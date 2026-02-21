import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// --- Types ---

interface Signal {
  id: string;
  tool: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  annualizedRate: number;
  confidence: 'HIGH' | 'MEDIUM';
  entryPrice: number;
  invalidation: string;
  timestamp: string;
  outcome1h: number | null;
  outcome4h: number | null;
  outcome24h: number | null;
  pnlPercent: number | null;
  status: 'OPEN' | 'CLOSED' | 'INVALIDATED';
}

interface Ledger {
  signals: Signal[];
}

// --- Config ---

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';
const LEDGER_PATH = path.join(__dirname, '..', 'paper-ledger.json');

// --- Helpers ---

function hoursAgo(timestamp: string): number {
  return (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
}

function calcPnl(entry: number, current: number, direction: 'LONG' | 'SHORT'): number {
  if (direction === 'LONG') {
    return ((current - entry) / entry) * 100;
  } else {
    return ((entry - current) / entry) * 100;
  }
}

// --- Ledger I/O ---

function readLedger(): Ledger {
  const raw = fs.readFileSync(LEDGER_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeLedger(ledger: Ledger): void {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

// --- Price Fetcher ---

async function fetchPrices(): Promise<Map<string, number>> {
  const res = await axios.post(HYPERLIQUID_API, { type: 'metaAndAssetCtxs' });
  const [meta, assetCtxs] = res.data;
  const prices = new Map<string, number>();

  for (let i = 0; i < meta.universe.length; i++) {
    const name = meta.universe[i].name;
    const markPx = parseFloat(assetCtxs[i]?.markPx || '0');
    if (markPx > 0) prices.set(name, markPx);
  }

  return prices;
}

// --- Check for funding flip (invalidation) ---

async function fetchFundingRates(): Promise<Map<string, number>> {
  const res = await axios.post(HYPERLIQUID_API, { type: 'metaAndAssetCtxs' });
  const [meta, assetCtxs] = res.data;
  const rates = new Map<string, number>();

  for (let i = 0; i < meta.universe.length; i++) {
    const name = meta.universe[i].name;
    const funding = parseFloat(assetCtxs[i]?.funding || '0');
    rates.set(name, funding);
  }

  return rates;
}

// --- Main ---

async function main() {
  console.log(`\n📊 Outcome Tracker`);
  console.log(`  ${new Date().toISOString()}\n`);

  const ledger = readLedger();
  const openSignals = ledger.signals.filter(s => s.status === 'OPEN');

  if (openSignals.length === 0) {
    console.log('  No open signals to track.\n');
    return;
  }

  const prices = await fetchPrices();
  const fundingRates = await fetchFundingRates();
  let updated = 0;

  for (const signal of openSignals) {
    const currentPrice = prices.get(signal.coin);
    if (!currentPrice) {
      console.log(`  ⚠️  ${signal.coin}: no price data`);
      continue;
    }

    const age = hoursAgo(signal.timestamp);
    const funding = fundingRates.get(signal.coin) || 0;

    // Check invalidation: funding flipped sign
    const fundingFlipped =
      (signal.direction === 'SHORT' && funding < 0) ||
      (signal.direction === 'LONG' && funding > 0);

    if (fundingFlipped) {
      signal.status = 'INVALIDATED';
      signal.pnlPercent = calcPnl(signal.entryPrice, currentPrice, signal.direction);
      console.log(`  ❌ ${signal.id} ${signal.coin}: INVALIDATED (funding flipped) | PnL: ${signal.pnlPercent.toFixed(2)}%`);
      updated++;
      continue;
    }

    // Fill outcome checkpoints
    if (age >= 1 && signal.outcome1h === null) {
      signal.outcome1h = currentPrice;
      console.log(`  📍 ${signal.id} ${signal.coin}: 1h outcome @ $${currentPrice}`);
      updated++;
    }

    if (age >= 4 && signal.outcome4h === null) {
      signal.outcome4h = currentPrice;
      console.log(`  📍 ${signal.id} ${signal.coin}: 4h outcome @ $${currentPrice}`);
      updated++;
    }

    if (age >= 24 && signal.outcome24h === null) {
      signal.outcome24h = currentPrice;
      signal.pnlPercent = calcPnl(signal.entryPrice, currentPrice, signal.direction);
      signal.status = 'CLOSED';
      console.log(`  ✅ ${signal.id} ${signal.coin}: CLOSED 24h @ $${currentPrice} | PnL: ${signal.pnlPercent.toFixed(2)}%`);
      updated++;
    }
  }

  if (updated > 0) {
    writeLedger(ledger);
    console.log(`\n  💾 ${updated} update(s) written to paper-ledger.json\n`);
  } else {
    console.log('  No updates needed yet.\n');
  }
}

main().catch(err => {
  console.error('Tracker error:', err.message);
  process.exit(1);
});
