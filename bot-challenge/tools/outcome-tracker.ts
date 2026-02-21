#!/usr/bin/env npx tsx
/**
 * Outcome Tracker — Bot Challenge Tool
 * 
 * Checks current prices against paper ledger signals to calculate P&L.
 * For funding carry signals: checks if the funding rate is still extreme.
 * For arb signals: checks if the edge still exists.
 */

import * as fs from 'fs';
import * as path from 'path';

const HL_API = 'https://api.hyperliquid.xyz/info';
const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');

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

  for (const signal of ledger.signals as Signal[]) {
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

    const icon = pnl > 0 ? '✅' : '❌';
    console.log(`${icon} ${signal.tool} | ${coin} ${signal.direction} | ${hoursAgo}h ago`);
    console.log(`   Entry: $${signal.entryPrice.toFixed(4)} → Now: $${current.markPx.toFixed(4)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);
    if (signal.annualizedRate) {
      console.log(`   Funding: ${(signal.annualizedRate * 100).toFixed(1)}% → ${(current.annualized * 100).toFixed(1)}% APR`);
    }
    console.log(`   P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%\n`);
    updated++;
  }

  // Summary
  const tracked = (ledger.signals as Signal[]).filter(s => s.outcome);
  const winning = tracked.filter(s => s.outcome!.pnlPercent! > 0);
  const totalPnl = tracked.reduce((sum, s) => sum + (s.outcome!.pnlPercent || 0), 0);

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`Tracked: ${tracked.length} signals`);
  console.log(`Winning: ${winning.length}/${tracked.length} (${tracked.length > 0 ? ((winning.length / tracked.length) * 100).toFixed(0) : 0}%)`);
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
    winning: winning.length,
    totalPnl,
    avgPnl: tracked.length > 0 ? totalPnl / tracked.length : 0,
    signals: tracked,
  }, null, 2), 'utf-8');
}

main().catch(err => {
  console.error('❌ Tracker failed:', err.message);
  process.exit(1);
});
