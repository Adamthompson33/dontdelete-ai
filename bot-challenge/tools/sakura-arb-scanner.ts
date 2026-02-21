#!/usr/bin/env npx tsx
/**
 * Sakura Arb Scanner — Bot Challenge Tool
 * 
 * Standalone arbitrage scanner for the Bot Challenge leaderboard.
 * Imports ArbitrageScanner from the Academy.
 * 
 * Usage: npx tsx tools/sakura-arb-scanner.ts
 * 
 * Scans Manifold Markets for mispricings: bounded violations,
 * stale prices, cluster inconsistencies.
 * Logs signals to shared paper-ledger.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ArbitrageScanner, ArbitrageOpportunity } from '../../academy/src/services/arbitrage';

// ═══ Bot Challenge Signal Format ═══

interface BotChallengeSignal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: 'LONG' | 'SHORT' | 'ARB';
  confidence: 'high' | 'medium' | 'low';
  entryPrice: number;
  expectedEdge: number;
  reasoning: string;
  invalidation: string;
  markets: { question: string; prob: number; url: string }[];
}

interface PaperLedgerEntry {
  signals: any[];
  lastScanAt: string;
  totalScans: number;
}

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const MIN_EDGE = 3.0; // Only flag opportunities with 3pp+ edge

// ═══ Main ═══

async function main() {
  console.log('🔍 Sakura Arb Scanner — scanning Manifold Markets...\n');

  let scanner: ArbitrageScanner;
  let result;

  try {
    scanner = new ArbitrageScanner();
    result = await scanner.scan();
  } catch (err: any) {
    // Graceful failure — geo-block or API down
    if (err.message?.includes('geo') || err.message?.includes('403') || err.message?.includes('ENOTFOUND')) {
      console.log('⚠️ Manifold Markets geo-blocked or unavailable. No data.');
      logEmpty();
      return;
    }
    throw err;
  }

  // Filter to significant opportunities
  const significant = result.opportunities.filter(o => o.expectedEdge >= MIN_EDGE);

  console.log(`\nScanned ${result.marketsScanned} markets. ${significant.length} opportunities above ${MIN_EDGE}pp threshold.\n`);

  // Convert to Bot Challenge signal format
  const signals: BotChallengeSignal[] = significant.map(opp => ({
    tool: 'sakura-arb-scanner',
    timestamp: new Date().toISOString(),
    unixMs: Date.now(),
    coin: opp.markets[0]?.question?.slice(0, 30) || 'UNKNOWN',
    direction: 'ARB' as const,
    confidence: opp.confidence,
    entryPrice: opp.markets[0]?.prob || 0,
    expectedEdge: opp.expectedEdge,
    reasoning: opp.reasoning,
    invalidation: `Edge drops below ${MIN_EDGE}pp or markets resolve.`,
    markets: opp.markets.map(m => ({
      question: m.question,
      prob: m.prob,
      url: m.url,
    })),
  }));

  // Print signals
  if (signals.length === 0) {
    console.log('No significant arbitrage opportunities. Markets are efficient.');
  } else {
    for (const sig of signals) {
      const icon = sig.confidence === 'high' ? '🔴' : sig.confidence === 'medium' ? '🟡' : '⚪';
      console.log(`${icon} ${sig.coin}`);
      console.log(`   Edge: ${sig.expectedEdge.toFixed(1)}pp | Confidence: ${sig.confidence}`);
      console.log(`   ${sig.reasoning.slice(0, 150)}`);
      for (const m of sig.markets) {
        console.log(`   📊 ${(m.prob * 100).toFixed(0)}% — ${m.question.slice(0, 60)}`);
      }
      console.log('');
    }
  }

  // Append to paper ledger
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    ledger = { signals: [], lastScanAt: '', totalScans: 0 };
  }

  ledger.signals.push(...signals);
  ledger.lastScanAt = new Date().toISOString();
  ledger.totalScans++;

  const resultsDir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`✅ Logged ${signals.length} signals to paper-ledger.json (total: ${ledger.signals.length} signals, ${ledger.totalScans} scans)`);

  // Save daily report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `sakura-arb-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date,
    scannedAt: new Date().toISOString(),
    marketsScanned: result.marketsScanned,
    opportunitiesFound: significant.length,
    signals,
    allOpportunities: result.opportunities,
  }, null, 2), 'utf-8');

  console.log(`📊 Daily report saved to reports/sakura-arb-${date}.json`);
}

function logEmpty() {
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    ledger = { signals: [], lastScanAt: '', totalScans: 0 };
  }
  ledger.lastScanAt = new Date().toISOString();
  ledger.totalScans++;

  const resultsDir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`✅ Logged 0 signals (geo-blocked). Scan count: ${ledger.totalScans}`);
}

main().catch(err => {
  console.error('❌ Scan failed:', err.message);
  process.exit(1);
});
