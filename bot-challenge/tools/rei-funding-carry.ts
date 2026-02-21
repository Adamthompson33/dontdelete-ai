#!/usr/bin/env npx tsx
/**
 * Rei Funding Carry — Bot Challenge Tool
 * 
 * Standalone funding rate scanner for the Bot Challenge leaderboard.
 * Imports FundingScanner from the Academy but runs independently.
 * 
 * Usage: npx tsx tools/rei-funding-carry.ts
 * 
 * Output: scans HyperLiquid funding rates, flags extreme opportunities,
 * logs signals to paper-ledger.json with exact timestamps.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FundingScanner, FundingOpportunity } from '../../academy/src/services/funding-scanner';

// ═══ Bot Challenge Signal Format ═══

interface BotChallengeSignal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: 'LONG' | 'SHORT';
  confidence: 'high' | 'medium' | 'low';
  entryPrice: number;
  annualizedRate: number;
  reasoning: string;
  invalidation: string;
}

interface PaperLedgerEntry {
  signals: BotChallengeSignal[];
  lastScanAt: string;
  totalScans: number;
}

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const MIN_APR = 1.00; // 100% annualized — only flag extreme opportunities for Bot Challenge

// ═══ Main ═══

async function main() {
  const scanner = new FundingScanner();
  
  console.log('🔍 Rei Funding Carry — scanning HyperLiquid...\n');
  
  const opportunities = await scanner.scan();
  
  // Filter to extreme opportunities only (Bot Challenge threshold: 100% APR)
  const extreme = opportunities.filter(o => Math.abs(o.annualizedRate) >= MIN_APR);
  
  console.log(`Scanned ${opportunities.length} coins. ${extreme.length} above ${MIN_APR * 100}% APR threshold.\n`);
  
  // Convert to Bot Challenge signal format
  const signals: BotChallengeSignal[] = extreme.map(opp => ({
    tool: 'rei-funding-carry',
    timestamp: new Date().toISOString(),
    unixMs: Date.now(),
    coin: opp.coin,
    direction: opp.direction === 'LONG_BASIS' ? 'SHORT' as const : 'LONG' as const,
    // For carry trade: if longs pay shorts (positive funding), you short the perp
    confidence: opp.confidence,
    entryPrice: opp.markPrice,
    annualizedRate: opp.annualizedRate,
    reasoning: opp.reasoning,
    invalidation: `Rate drops below 20% APR or flips sign. ${opp.volatile ? 'VOLATILE — basis trade unsafe.' : ''}`,
  }));
  
  // Print signals
  if (signals.length === 0) {
    console.log('No extreme funding opportunities. Markets are balanced.');
  } else {
    for (const sig of signals) {
      const icon = sig.confidence === 'high' ? '🔴' : sig.confidence === 'medium' ? '🟡' : '⚪';
      console.log(`${icon} ${sig.coin}`);
      console.log(`   Direction: ${sig.direction} perp (carry trade)`);
      console.log(`   APR: ${(sig.annualizedRate * 100).toFixed(1)}%`);
      console.log(`   Entry: $${sig.entryPrice.toFixed(4)}`);
      console.log(`   Confidence: ${sig.confidence}`);
      console.log(`   Invalidation: ${sig.invalidation}`);
      console.log(`   ${sig.reasoning}\n`);
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
  
  // Ensure results dir exists
  const resultsDir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`✅ Logged ${signals.length} signals to paper-ledger.json (total: ${ledger.signals.length} signals, ${ledger.totalScans} scans)`);
  
  // Also save daily report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `rei-funding-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date,
    scannedAt: new Date().toISOString(),
    coinsScanned: opportunities.length,
    extremeCount: extreme.length,
    signals,
    allOpportunities: opportunities.slice(0, 20), // top 20 for reference
  }, null, 2), 'utf-8');
  
  console.log(`📊 Daily report saved to reports/rei-funding-${date}.json`);
}

main().catch(err => {
  console.error('❌ Scan failed:', err.message);
  process.exit(1);
});
