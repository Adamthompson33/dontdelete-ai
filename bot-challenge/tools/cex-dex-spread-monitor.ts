#!/usr/bin/env npx tsx
/**
 * CEX-DEX Spread Monitor — Replaces Phantom Whale Tracker
 * 
 * Compares Binance (CEX) vs HyperLiquid (DEX) funding rates for active coins.
 * Tests Zhivkov's finding: CEX leads DEX by 61%.
 * 
 * Pure data collection — no signals, no trades, no alerts.
 * 
 * Usage: npx tsx tools/cex-dex-spread-monitor.ts
 * Cron slot: :03 (same as old whale tracker)
 */

import * as fs from 'fs';
import * as path from 'path';

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const LEDGER_FILE = path.join(RESULTS_DIR, 'paper-ledger.json');
const OUTPUT_FILE = path.join(RESULTS_DIR, 'cex-dex-spreads.json');

const HL_API = 'https://api.hyperliquid.xyz/info';
const BINANCE_API = 'https://fapi.binance.com/fapi/v1/premiumIndex';

// ═══ Fetch Functions ═══

async function fetchHyperLiquidRates(): Promise<Record<string, number>> {
  const resp = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  const [meta, assetCtxs] = await resp.json() as [any, any[]];
  const rates: Record<string, number> = {};
  for (let i = 0; i < meta.universe.length && i < assetCtxs.length; i++) {
    const coin = meta.universe[i].name;
    const rate = parseFloat(assetCtxs[i].funding || '0');
    rates[coin] = rate * 24 * 365 * 100; // annualized %
  }
  return rates;
}

async function fetchBinanceRates(): Promise<Record<string, number>> {
  const resp = await fetch(BINANCE_API);
  const data = await resp.json() as any[];
  const rates: Record<string, number> = {};
  for (const item of data) {
    // Strip USDT suffix to match HL coin names
    const coin = item.symbol.replace(/USDT$/, '');
    const rate = parseFloat(item.lastFundingRate || '0');
    rates[coin] = rate * 3 * 365 * 100; // annualized % (Binance pays 3x/day)
  }
  return rates;
}

// ═══ Get Active Coins + Regime ═══

function getActiveCoinsAndRegime(ledger: any): { coins: string[]; regime: string } {
  const now = Date.now();
  const MAX_AGE = 24 * 60 * 60 * 1000;

  // Get regime from most recent temporal edge signal
  const recentTE = (ledger.signals || [])
    .filter((s: any) => s.tool === 'jackbot-temporal-edge' && s.regime && (now - (s.unixMs || 0)) < 5 * 60 * 60 * 1000)
    .sort((a: any, b: any) => (b.unixMs || 0) - (a.unixMs || 0));
  const regime = recentTE.length > 0 ? recentTE[0].regime : 'UNKNOWN';

  // Get active coins (same filter as Medic)
  const activeCoins = new Set<string>();
  const closedPairs = new Set<string>();
  
  for (const s of (ledger.signals || [])) {
    if (s.kelly_status === 'CLOSED' || s.medic_exit) {
      closedPairs.add(`${s.coin}_${s.direction}`);
    }
  }

  for (const s of (ledger.signals || [])) {
    const age = now - (s.unixMs || new Date(s.timestamp).getTime() || 0);
    if (age > MAX_AGE) continue;
    if (s.kelly_status === 'STALE' || s.kelly_status === 'SUPERSEDED' || s.kelly_status === 'CLOSED') continue;
    if (s.sentryBlocked) continue;
    if (s.kelly_action === 'SKIP' || s.kelly_action === 'BLOCKED') continue;
    if ((s.kelly_size || 0) <= 0) continue;
    if (closedPairs.has(`${s.coin}_${s.direction}`)) continue;
    activeCoins.add(s.coin);
  }

  return { coins: [...activeCoins], regime };
}

// ═══ Main ═══

async function main() {
  console.log('📊 CEX-DEX Spread Monitor — collecting spread data...\n');

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  // Load ledger for active coins + regime
  let ledger: any;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    console.error('❌ Cannot read paper-ledger.json');
    process.exit(1);
  }

  const { coins, regime } = getActiveCoinsAndRegime(ledger);
  console.log(`Regime: ${regime} | Active coins: ${coins.length} (${coins.join(', ')})\n`);

  if (coins.length === 0) {
    console.log('No active coins — nothing to compare.');
    return;
  }

  // Fetch rates from both exchanges
  const [hlRates, binanceRates] = await Promise.all([
    fetchHyperLiquidRates(),
    fetchBinanceRates(),
  ]);

  // Calculate spreads for active coins
  const spreads: any[] = [];
  for (const coin of coins.sort()) {
    const hlRate = hlRates[coin];
    const binRate = binanceRates[coin];
    
    if (hlRate === undefined && binRate === undefined) continue;

    const spread = (binRate ?? 0) - (hlRate ?? 0);
    spreads.push({
      coin,
      binance_rate_apr: binRate !== undefined ? +binRate.toFixed(2) : null,
      hyperliquid_rate_apr: hlRate !== undefined ? +hlRate.toFixed(2) : null,
      spread_apr: +(spread).toFixed(2),
      binance_available: binRate !== undefined,
      hyperliquid_available: hlRate !== undefined,
    });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    regime,
    coinCount: spreads.length,
    spreads,
  };

  // Print summary
  console.log(`Spread data for ${spreads.length} coins:\n`);
  for (const s of spreads) {
    const bin = s.binance_rate_apr !== null ? `${s.binance_rate_apr}%` : 'N/A';
    const hl = s.hyperliquid_rate_apr !== null ? `${s.hyperliquid_rate_apr}%` : 'N/A';
    console.log(`  ${s.coin.padEnd(8)} Binance: ${bin.padStart(10)} | HL: ${hl.padStart(10)} | Spread: ${s.spread_apr}%`);
  }

  // Append to output file (array of entries)
  let history: any[] = [];
  try {
    history = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    if (!Array.isArray(history)) history = [];
  } catch {
    // First run
  }
  history.push(entry);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(history, null, 2));

  console.log(`\n✅ Spread data logged. ${history.length} total entries in cex-dex-spreads.json`);
}

main().catch(err => {
  console.error('❌ CEX-DEX Spread Monitor failed:', err.message);
  process.exit(1);
});
