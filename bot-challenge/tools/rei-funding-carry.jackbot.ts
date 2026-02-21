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

const MIN_ANNUAL_RATE = 100;    // % — signal threshold
const MAX_ANNUAL_RATE = 500;    // % — distressed filter
const MAX_24H_MOVE = 20;        // % — volatile filter
const MIN_24H_VOLUME = 100_000; // $ — liquidity filter

// --- HyperLiquid API ---

async function fetchMetaAndAssets(): Promise<any> {
  const res = await axios.post(HYPERLIQUID_API, { type: 'metaAndAssetCtxs' });
  return res.data;
}

// --- Scanning ---

async function scan(): Promise<Signal[]> {
  const [meta, assetCtxs] = await fetchMetaAndAssets();
  const coins = meta.universe;
  const signals: Signal[] = [];
  const now = new Date().toISOString();

  // Load existing ledger to generate next ID
  const ledger = readLedger();
  let nextId = ledger.signals.length + 1;

  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    const ctx = assetCtxs[i];
    if (!ctx) continue;

    const name: string = coin.name;
    const funding = parseFloat(ctx.funding);
    const markPx = parseFloat(ctx.markPx);
    const prevDayPx = parseFloat(ctx.prevDayPx);
    const dayNtlVlm = parseFloat(ctx.dayNtlVlm);

    // Annualise hourly funding rate
    const annualizedRate = Math.abs(funding) * 24 * 365 * 100;

    // --- Crash Filters ---

    // Skip low funding
    if (annualizedRate < MIN_ANNUAL_RATE) continue;

    // Skip distressed
    if (annualizedRate > MAX_ANNUAL_RATE) {
      console.log(`  SKIP ${name}: distressed (${annualizedRate.toFixed(0)}% APR)`);
      continue;
    }

    // Skip volatile
    const priceChange = prevDayPx > 0 ? Math.abs((markPx - prevDayPx) / prevDayPx) * 100 : 0;
    if (priceChange > MAX_24H_MOVE) {
      console.log(`  SKIP ${name}: volatile (${priceChange.toFixed(1)}% 24h move)`);
      continue;
    }

    // Skip illiquid
    if (dayNtlVlm < MIN_24H_VOLUME) {
      console.log(`  SKIP ${name}: illiquid ($${dayNtlVlm.toFixed(0)} 24h vol)`);
      continue;
    }

    // --- Signal ---

    // Positive funding = longs pay shorts → short is the carry trade
    const direction: 'LONG' | 'SHORT' = funding > 0 ? 'SHORT' : 'LONG';
    const confidence: 'HIGH' | 'MEDIUM' = annualizedRate > 200 ? 'HIGH' : 'MEDIUM';

    // Skip if we already have an OPEN signal for this coin + direction
    const duplicate = ledger.signals.find(
      s => s.coin === name && s.direction === direction && s.status === 'OPEN'
    );
    if (duplicate) {
      console.log(`  SKIP ${name}: already have open ${direction} signal`);
      continue;
    }

    const signal: Signal = {
      id: `rei-funding-${String(nextId++).padStart(3, '0')}`,
      tool: 'rei-funding-carry',
      coin: name,
      direction,
      annualizedRate: Math.round(annualizedRate * 10) / 10,
      confidence,
      entryPrice: markPx,
      invalidation: `funding flips ${funding > 0 ? 'negative' : 'positive'}`,
      timestamp: now,
      outcome1h: null,
      outcome4h: null,
      outcome24h: null,
      pnlPercent: null,
      status: 'OPEN',
    };

    signals.push(signal);
    console.log(`  SIGNAL: ${direction} ${name} @ $${markPx} | ${annualizedRate.toFixed(0)}% APR | ${confidence}`);
  }

  return signals;
}

// --- Ledger I/O ---

function readLedger(): Ledger {
  try {
    const raw = fs.readFileSync(LEDGER_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { signals: [] };
  }
}

function writeLedger(ledger: Ledger): void {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

// --- Main ---

async function main() {
  console.log(`\n🎪 Rei's Funding Rate Scanner`);
  console.log(`  ${new Date().toISOString()}\n`);

  const newSignals = await scan();

  if (newSignals.length === 0) {
    console.log('\n  No new signals.\n');
    return;
  }

  const ledger = readLedger();
  ledger.signals.push(...newSignals);
  writeLedger(ledger);

  console.log(`\n  ✅ ${newSignals.length} signal(s) logged to paper-ledger.json\n`);
}

main().catch(err => {
  console.error('Scanner error:', err.message);
  process.exit(1);
});
