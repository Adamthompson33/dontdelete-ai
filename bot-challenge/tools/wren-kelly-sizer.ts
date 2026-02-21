#!/usr/bin/env npx tsx
/**
 * Wren Kelly Sizer — Bot Challenge Tool
 * 
 * Takes any signal from paper-ledger.json and computes the mathematically
 * optimal position size using the Kelly Criterion.
 * 
 * Kelly % = (p - (1-p)) / 1  where p = confidence probability
 *   high   → p = 0.70 → Kelly = 40% → capped at 20%
 *   medium → p = 0.55 → Kelly = 10%
 *   low    → p = 0.35 → Kelly = -30% → 0% (no position)
 * 
 * Cap: 20% max position size (half-Kelly for safety)
 * 
 * Reads paper-ledger.json, annotates signals with kelly_size,
 * writes back. Also prints a sizing report.
 * 
 * Usage: npx tsx tools/wren-kelly-sizer.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const MAX_KELLY = 0.20; // 20% max position cap

// Confidence → probability mapping
const CONFIDENCE_MAP: Record<string, number> = {
  high: 0.70,
  medium: 0.55,
  low: 0.35,
};

// ═══ Kelly Criterion ═══

interface KellyResult {
  rawKelly: number;    // uncapped Kelly fraction
  cappedKelly: number; // capped at MAX_KELLY
  action: 'SIZE' | 'SKIP'; // SKIP if Kelly <= 0
  reasoning: string;
}

function computeKelly(confidence: string, expectedEdge?: number): KellyResult {
  const p = CONFIDENCE_MAP[confidence] ?? 0.35;
  
  // Kelly % = (p - (1-p)) / 1 = 2p - 1
  // This is the simplified Kelly for even-money bets
  const rawKelly = (p - (1 - p));
  const cappedKelly = Math.min(Math.max(rawKelly, 0), MAX_KELLY);
  
  const action = rawKelly > 0 ? 'SIZE' : 'SKIP';

  let reasoning: string;
  if (action === 'SKIP') {
    reasoning = `Kelly = ${(rawKelly * 100).toFixed(1)}% (p=${(p * 100).toFixed(0)}%). Negative edge — no position.`;
  } else if (rawKelly > MAX_KELLY) {
    reasoning = `Kelly = ${(rawKelly * 100).toFixed(1)}% (p=${(p * 100).toFixed(0)}%). Capped at ${(MAX_KELLY * 100).toFixed(0)}% max position.`;
  } else {
    reasoning = `Kelly = ${(rawKelly * 100).toFixed(1)}% (p=${(p * 100).toFixed(0)}%). Within cap.`;
  }

  return { rawKelly, cappedKelly, action, reasoning };
}

// ═══ Main ═══

interface PaperLedgerEntry {
  signals: any[];
  lastScanAt: string;
  totalScans: number;
}

async function main() {
  console.log('📐 Wren Kelly Sizer — computing optimal position sizes...\n');

  // Load ledger
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch (err) {
    console.error('❌ Cannot read paper-ledger.json. Run a scanner first.');
    process.exit(1);
  }

  if (ledger.signals.length === 0) {
    console.log('No signals in paper-ledger. Nothing to size.');
    return;
  }

  // Process all signals that don't already have kelly_size
  let sized = 0;
  let skipped = 0;
  let alreadySized = 0;

  const summary: { coin: string; tool: string; direction: string; confidence: string; kelly: number; action: string }[] = [];

  for (const signal of ledger.signals) {
    if (signal.kelly_size !== undefined) {
      alreadySized++;
      continue;
    }

    const confidence = signal.confidence || 'low';
    const result = computeKelly(confidence, signal.expectedEdge);

    // Annotate signal
    signal.kelly_size = result.cappedKelly;
    signal.kelly_raw = result.rawKelly;
    signal.kelly_action = result.action;
    signal.kelly_reasoning = result.reasoning;
    signal.kelly_sizedAt = new Date().toISOString();

    if (result.action === 'SIZE') {
      sized++;
    } else {
      skipped++;
    }

    summary.push({
      coin: signal.coin?.slice(0, 20) || 'UNKNOWN',
      tool: signal.tool || 'unknown',
      direction: signal.direction || '?',
      confidence,
      kelly: result.cappedKelly,
      action: result.action,
    });
  }

  // Print sizing report
  console.log(`Processed ${summary.length} new signals (${alreadySized} already sized)\n`);

  // Group by action
  const sizeSignals = summary.filter(s => s.action === 'SIZE');
  const skipSignals = summary.filter(s => s.action === 'SKIP');

  if (sizeSignals.length > 0) {
    console.log('📊 POSITION SIZES:');
    console.log('─'.repeat(70));
    for (const s of sizeSignals) {
      const pct = (s.kelly * 100).toFixed(1);
      const icon = s.confidence === 'high' ? '🔴' : '🟡';
      console.log(`${icon} ${s.coin.padEnd(20)} ${s.direction.padEnd(6)} ${pct.padStart(5)}% of bankroll  [${s.tool}]`);
    }
    console.log('');
  }

  if (skipSignals.length > 0) {
    console.log(`⚪ ${skipSignals.length} signals SKIPPED (low confidence → negative Kelly):`);
    for (const s of skipSignals) {
      console.log(`   ${s.coin.padEnd(20)} ${s.direction.padEnd(6)} [${s.tool}]`);
    }
    console.log('');
  }

  // Aggregate stats
  const totalAllocation = sizeSignals.reduce((sum, s) => sum + s.kelly, 0);
  console.log(`Summary: ${sized} sized | ${skipped} skipped | Total allocation: ${(totalAllocation * 100).toFixed(1)}% of bankroll`);
  
  if (totalAllocation > 1.0) {
    console.log(`⚠️ Total allocation exceeds 100%! Consider reducing positions proportionally.`);
  }

  // Write back to ledger
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`\n✅ Updated paper-ledger.json with kelly_size fields`);

  // Save daily report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `wren-kelly-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date,
    sizedAt: new Date().toISOString(),
    totalSignals: ledger.signals.length,
    newlySized: summary.length,
    alreadySized,
    sized,
    skipped,
    totalAllocation,
    maxKelly: MAX_KELLY,
    positions: sizeSignals,
    skippedPositions: skipSignals,
  }, null, 2), 'utf-8');

  console.log(`📊 Daily report saved to reports/wren-kelly-${date}.json`);
}

main().catch(err => {
  console.error('❌ Kelly sizer failed:', err.message);
  process.exit(1);
});
