#!/usr/bin/env npx tsx
/**
 * Jackbot Temporal Edge — Bot Challenge Tool
 * 
 * Standalone temporal edge scanner for the Bot Challenge leaderboard.
 * Imports TemporalEdgeScanner from the Academy.
 * 
 * Usage: npx tsx tools/jackbot-temporal-edge.ts
 * 
 * Detects: funding reset windows, regime shifts, session edges.
 * Logs signals to shared paper-ledger.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TemporalEdgeScanner, TemporalSignal } from '../../academy/src/services/temporal-edge';
import { isBlocked } from './lib/blocklist';

// ═══ Bot Challenge Signal Format ═══

interface BotChallengeSignal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  confidence: number;
  kelly_size: number;
  entryPrice: number;
  pattern: string;
  reasoning: string;
  invalidation: string;
}

interface PaperLedgerEntry {
  signals: any[];
  lastScanAt: string;
  totalScans: number;
}

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const MIN_CONFIDENCE = 0.6;
const MAX_APR = 500; // Skip distressed tokens (>500% APR)

// ═══ Main ═══

async function main() {
  const scanner = new TemporalEdgeScanner();
  
  console.log('⏰ Jackbot Temporal Edge — scanning HyperLiquid...\n');
  
  const result = await scanner.scan();
  
  console.log(`Session: ${result.session} | Next funding reset: ${result.nextResetMinutes}min`);
  const btc = result.regimes['BTC'];
  const currentRegime = btc?.regime || 'UNKNOWN';
  if (btc) {
    console.log(`BTC regime: ${btc.regime} (ADX: ${btc.adx.toFixed(1)}, Vol ratio: ${btc.volatilityRatio.toFixed(2)}, 24h: ${btc.priceChange24h >= 0 ? '+' : ''}${btc.priceChange24h.toFixed(1)}%)`);
  }
  console.log(`Regime params: stop=${(result.regimeParams.stop * 100).toFixed(0)}%, size=${result.regimeParams.size}x, maxHold=${result.regimeParams.maxHold}h`);
  console.log(`Raw signals: ${result.signals.length}\n`);
  
  // Filter: confidence >= 0.6 and not distressed
  const filteredByConfidence = result.signals.filter(sig => {
    if (sig.confidence < MIN_CONFIDENCE) {
      console.log(`SKIP ${sig.coin}: low confidence (${(sig.confidence * 100).toFixed(0)}%)`);
      return false;
    }
    const apr = Math.abs(sig.data.annualizedRate || 0);
    if (apr > MAX_APR) {
      console.log(`SKIP ${sig.coin}: distressed (${apr.toFixed(0)}% APR)`);
      return false;
    }
    return true;
  });
  
  // Convert to Bot Challenge signal format — regime-tagged (Stage 1, Oracle 2026-02-24)
  const signals: BotChallengeSignal[] = filteredByConfidence.map(sig => ({
    tool: 'jackbot-temporal-edge',
    timestamp: new Date().toISOString(),
    unixMs: Date.now(),
    coin: sig.coin,
    direction: sig.direction.toUpperCase() as 'LONG' | 'SHORT' | 'FLAT',
    confidence: sig.confidence,
    kelly_size: sig.kelly_size,
    entryPrice: sig.data.markPrice || 0,
    pattern: sig.pattern,
    reasoning: sig.reasoning,
    invalidation: sig.invalidation,
    regime: currentRegime,       // Stage 1: tag every signal with BTC regime
    regimeAdx: btc?.adx || 0,
    regimeVolRatio: btc?.volatilityRatio || 1.0,
  }));
  
  // Print signals
  if (signals.length === 0) {
    console.log('\nNo temporal edge signals above threshold.');
  } else {
    console.log('');
    for (const sig of signals) {
      const icon = sig.confidence >= 0.7 ? '🔴' : sig.confidence >= 0.6 ? '🟡' : '⚪';
      console.log(`${icon} ${sig.coin} (${sig.pattern})`);
      console.log(`   Direction: ${sig.direction}`);
      console.log(`   Confidence: ${(sig.confidence * 100).toFixed(0)}% | Kelly: ${(sig.kelly_size * 100).toFixed(0)}%`);
      console.log(`   Entry: $${sig.entryPrice.toFixed(4)}`);
      console.log(`   Invalidation: ${sig.invalidation}`);
      console.log(`   ${sig.reasoning}\n`);
    }
  }
  
  // Append to shared paper ledger
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    ledger = { signals: [], lastScanAt: '', totalScans: 0 };
  }
  
  // Filter out blocked/cooldown coins
  const filtered = signals.filter(s => {
    const check = isBlocked(s.coin);
    if (check.blocked) {
      console.log(`🚫 ${s.coin} — ${check.reason}`);
      return false;
    }
    return true;
  });

  ledger.signals.push(...filtered);
  ledger.lastScanAt = new Date().toISOString();
  ledger.totalScans++;
  
  const resultsDir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`✅ Logged ${filtered.length} signals to paper-ledger.json (${signals.length - filtered.length} blocked) (total: ${ledger.signals.length} signals, ${ledger.totalScans} scans)`);
  
  // Save daily report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `jackbot-temporal-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date,
    scannedAt: new Date().toISOString(),
    session: result.session,
    nextResetMinutes: result.nextResetMinutes,
    btcRegime: result.regimes['BTC'],
    signalCount: signals.length,
    signals,
    allRawSignals: result.signals,
  }, null, 2), 'utf-8');
  
  console.log(`📊 Daily report saved to reports/jackbot-temporal-${date}.json`);
}

main().catch(err => {
  console.error('❌ Scan failed:', err.message);
  process.exit(1);
});
