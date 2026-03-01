#!/usr/bin/env npx tsx
/**
 * Outcome Tracker — Bot Challenge Tool
 *
 * Checks current prices against paper ledger signals to calculate P&L.
 * For funding carry signals: checks if the funding rate is still extreme.
 * For arb signals: checks if the edge still exists.
 *
 * Locked-outcome system: P&L is frozen at maxHold expiry to stop WR drift.
 */

import * as fs from 'fs';
import * as path from 'path';

const HL_API = 'https://api.hyperliquid.xyz/info';
const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');

const MAX_HOLD_HOURS = 72; // fallback when signal has no regimeMaxHold
const MIGRATION_CUTOFF_HOURS = 72;

interface Signal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: string;
  confidence: string | number;
  entryPrice?: number;
  annualizedRate?: number;
  expectedEdge?: number;
  outcome?: {
    checkedAt: string;
    currentPrice?: number;
    currentRate?: number;
    priceChange?: number;
    pnlPercent?: number;
    status: string;
    locked?: boolean;       // true = P&L is permanently frozen
    lockedAt?: string;      // ISO timestamp when it was locked
    lockReason?: string;    // "maxHold" | "stopLoss" | "migration"
  };
}

async function getHLPrices(): Promise<Map<string, { markPx: number; funding: number; annualized: number }>> {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  if (!res.ok) throw new Error(`HL API: ${res.status}`);
  const data = await res.json() as [any, any[]];
  const map = new Map();
  for (let i = 0; i < data[0].universe.length; i++) {
    const coin = data[0].universe[i].name;
    const ctx = data[1][i];
    const rate = parseFloat(ctx.funding);
    map.set(coin, {
      markPx: parseFloat(ctx.markPx),
      funding: rate,
      annualized: rate * 24 * 365,
    });
  }
  return map;
}

async function main() {
  console.log('📊 Outcome Tracker — checking paper ledger signals...\n');

  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    console.log('No paper ledger found.');
    return;
  }

  const prices = await getHLPrices();
  const now = Date.now();
  let updated = 0;

  // MIGRATION: lock all signals past 72h that have outcomes but aren't locked yet
  let migrated = 0;
  for (const signal of ledger.signals as Signal[]) {
    if (signal.outcome && !signal.outcome.locked) {
      const hoursOld = (now - signal.unixMs) / (1000 * 60 * 60);
      if (hoursOld >= MIGRATION_CUTOFF_HOURS) {
        signal.outcome.locked = true;
        signal.outcome.lockedAt = new Date().toISOString();
        signal.outcome.lockReason = 'migration';
        migrated++;
      }
    }
  }
  if (migrated > 0) {
    console.log(`🔒 MIGRATION: Locked ${migrated} stale outcomes (>72h old)\n`);
  }

  for (const signal of ledger.signals as Signal[]) {
    // Skip already-locked outcomes - never recalculate
    if (signal.outcome?.locked === true) continue;

    // Skip arb signals (no HL price to check)
    if (signal.tool === 'sakura-arb-scanner') continue;
    // Skip if no entry price
    if (!signal.entryPrice || signal.entryPrice === 0) continue;

    const coin = signal.coin;
    const current = prices.get(coin);
    if (!current) continue;

    const hoursAgo = ((now - signal.unixMs) / (1000 * 60 * 60)).toFixed(1);
    const priceChange = ((current.markPx - signal.entryPrice) / signal.entryPrice) * 100;

    // P&L based on direction
    let pnl = 0;
    if (signal.direction === 'LONG') {
      pnl = priceChange;
    } else if (signal.direction === 'SHORT') {
      pnl = -priceChange;
    }

    // For funding carry: add estimated funding collected
    if (signal.tool === 'rei-funding-carry' && signal.annualizedRate) {
      const hoursHeld = (now - signal.unixMs) / (1000 * 60 * 60);
      const fundingPnl = Math.abs(signal.annualizedRate) / (365 * 24) * hoursHeld * 100;
      pnl += fundingPnl;
    }

    signal.outcome = {
      checkedAt: new Date().toISOString(),
      currentPrice: current.markPx,
      currentRate: current.annualized,
      priceChange,
      pnlPercent: pnl,
      status: pnl > 0 ? 'WINNING' : 'LOSING',
    };

    // Lock on maxHold expiry
    const signalMaxHold = (signal as any).regimeMaxHold ?? MAX_HOLD_HOURS;
    const hoursHeld = (now - signal.unixMs) / (1000 * 60 * 60);
    if (hoursHeld >= signalMaxHold) {
      signal.outcome.locked = true;
      signal.outcome.lockedAt = new Date().toISOString();
      signal.outcome.lockReason = 'maxHold';
    }

    const icon = pnl > 0 ? '✅' : '❌';
    const lockTag = signal.outcome.locked ? ' 🔒' : '';
    console.log(`${icon} ${signal.tool} | ${coin} ${signal.direction} | ${hoursAgo}h ago${lockTag}`);
    console.log(`   Entry: $${signal.entryPrice.toFixed(4)} → Now: $${current.markPx.toFixed(4)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);
    if (signal.annualizedRate) {
      console.log(`   Funding: ${(signal.annualizedRate * 100).toFixed(1)}% → ${(current.annualized * 100).toFixed(1)}% APR`);
    }
    console.log(`   P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%\n`);
    updated++;
  }

  // Summary
  const tracked = (ledger.signals as Signal[]).filter(s => s.outcome);
  const lockedOutcomes = tracked.filter(s => s.outcome!.locked === true);
  const liveOutcomes = tracked.filter(s => !s.outcome!.locked);

  const winning = tracked.filter(s => s.outcome!.pnlPercent! > 0);
  const winningLocked = lockedOutcomes.filter(s => s.outcome!.pnlPercent! > 0);
  const winningLive = liveOutcomes.filter(s => s.outcome!.pnlPercent! > 0);

  const totalPnl = tracked.reduce((sum, s) => sum + (s.outcome!.pnlPercent || 0), 0);

  const wrAll = tracked.length > 0 ? ((winning.length / tracked.length) * 100).toFixed(1) : '0.0';
  const wrLocked = lockedOutcomes.length > 0 ? ((winningLocked.length / lockedOutcomes.length) * 100).toFixed(1) : 'N/A';
  const wrLive = liveOutcomes.length > 0 ? ((winningLive.length / liveOutcomes.length) * 100).toFixed(1) : 'N/A';

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`Locked outcomes: ${lockedOutcomes.length} (frozen P&L)`);
  console.log(`Live outcomes:   ${liveOutcomes.length} (recalculated this scan)`);
  console.log(`Total signals:   ${tracked.length}`);
  console.log(`Win rate (all):    ${wrAll}%`);
  console.log(`Win rate (locked): ${wrLocked}%`);
  console.log(`Win rate (live):   ${wrLive}%`);
  console.log(`Total P&L: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}%`);
  console.log(`Avg P&L: ${tracked.length > 0 ? (totalPnl / tracked.length).toFixed(2) : 0}%\n`);

  // Save updated ledger
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`✅ Updated ${updated} signal outcomes in paper-ledger.json`);

  // Save report
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(REPORT_DIR, `outcomes-${date}.json`), JSON.stringify({
    date,
    checkedAt: new Date().toISOString(),
    tracked: tracked.length,
    lockedOutcomes: lockedOutcomes.length,
    liveOutcomes: liveOutcomes.length,
    winning: winning.length,
    winningLocked: winningLocked.length,
    winningLive: winningLive.length,
    winRate: wrAll,
    winRateLocked: wrLocked,
    winRateLive: wrLive,
    totalPnl,
    avgPnl: tracked.length > 0 ? totalPnl / tracked.length : 0,
    signals: tracked,
  }, null, 2), 'utf-8');
}

main().catch(err => {
  console.error('❌ Tracker failed:', err.message);
  process.exit(1);
});
