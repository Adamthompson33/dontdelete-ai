#!/usr/bin/env npx tsx
/**
 * BACKTEST 1: CEX-DEX Spread Profile
 * For each coin at each hour: spread = HL_rate - Binance_rate
 * Output: spread-profile.json
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(__dirname, '..', 'data', 'loris-historical');
const OUT_FILE = join(__dirname, '..', 'results', 'spread-profile.json');

interface Point { t: string; y: number }
interface CoinData { symbol: string; series: Record<string, Point[]> }

function autocorrelation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let num = 0, den = 0;
  for (let i = 0; i < values.length; i++) {
    den += (values[i] - mean) ** 2;
    if (i < values.length - 1) {
      num += (values[i] - mean) * (values[i + 1] - mean);
    }
  }
  return den === 0 ? 0 : num / den;
}

const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
const results: Record<string, any> = {};

for (const file of files) {
  const coin = file.replace('.json', '');
  const data: CoinData = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
  
  const hl = data.series?.hyperliquid;
  const bn = data.series?.binance;
  
  if (!hl || !bn) {
    results[coin] = { error: `Missing ${!hl ? 'hyperliquid' : ''}${!hl && !bn ? '+' : ''}${!bn ? 'binance' : ''}` };
    continue;
  }

  // Build time-indexed maps. HL is hourly (×8 for 8h comparison), Binance is 8h native
  const hlMap = new Map<string, number>();
  for (const p of hl) hlMap.set(p.t, p.y);
  
  const bnMap = new Map<string, number>();
  for (const p of bn) bnMap.set(p.t, p.y);

  // HL reports hourly in BPS. Binance reports 8-hourly.
  // To compare: we need to align. HL hourly × 8 = equivalent 8h rate.
  // But Binance only has 3 data points per day (00:00, 08:00, 16:00 UTC).
  // Strategy: For each HL hourly point, find the most recent Binance 8h rate and compare.
  
  // Actually, let's just compute hourly spreads where both have data at the same timestamp.
  // If Binance is 8h, we'll have fewer overlap points. Let's check both approaches.
  
  // Approach 1: Direct timestamp match (works if both have hourly data for some exchanges)
  const spreads: number[] = [];
  const spreadTimeSeries: { t: string; spread: number }[] = [];
  
  // For coins on both HL (1h) and Binance (8h), align by finding Binance rate at 8h boundaries
  // and computing spread at those timestamps
  const bnTimes = Array.from(bnMap.keys()).sort();
  const hlTimes = Array.from(hlMap.keys()).sort();
  
  // Loris normalizes all rates to hourly BPS already — direct comparison
  for (const t of hlTimes) {
    if (bnMap.has(t)) {
      const spread = hlMap.get(t)! - bnMap.get(t)!;
      spreads.push(spread);
      spreadTimeSeries.push({ t, spread });
    }
  }

  if (spreads.length === 0) {
    results[coin] = { error: 'No overlapping timestamps', hl_count: hl.length, bn_count: bn.length };
    continue;
  }

  const sorted = [...spreads].sort((a, b) => a - b);
  const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const std = Math.sqrt(spreads.reduce((a, b) => a + (b - mean) ** 2, 0) / spreads.length);
  const absSpreads = spreads.map(Math.abs);
  const pct_above_20bps = spreads.filter(s => Math.abs(s) > 20).length / spreads.length;
  const pct_above_10bps = spreads.filter(s => Math.abs(s) > 10).length / spreads.length;
  const pct_above_5bps = spreads.filter(s => Math.abs(s) > 5).length / spreads.length;
  const ar1 = autocorrelation(spreads);

  results[coin] = {
    observations: spreads.length,
    hl_points: hl.length,
    bn_points: bn.length,
    mean_spread_bps: +mean.toFixed(2),
    median_spread_bps: +median.toFixed(2),
    std_bps: +std.toFixed(2),
    max_spread_bps: +Math.max(...spreads).toFixed(2),
    min_spread_bps: +Math.min(...spreads).toFixed(2),
    pct_above_5bps: +(pct_above_5bps * 100).toFixed(1),
    pct_above_10bps: +(pct_above_10bps * 100).toFixed(1),
    pct_above_20bps: +(pct_above_20bps * 100).toFixed(1),
    autocorrelation_lag1: +ar1.toFixed(4),
    time_series_sample: spreadTimeSeries.slice(0, 5),
  };
}

// Summary stats
const coins = Object.keys(results).filter(c => !results[c].error);
const avgPctAbove20 = coins.reduce((a, c) => a + results[c].pct_above_20bps, 0) / coins.length;
const avgAR1 = coins.reduce((a, c) => a + results[c].autocorrelation_lag1, 0) / coins.length;

const output = {
  generated: new Date().toISOString(),
  description: 'CEX-DEX spread profile: HL hourly rate minus Binance hourly rate (both normalized by Loris to hourly BPS)',
  summary: {
    total_coins: files.length,
    coins_with_both_exchanges: coins.length,
    coins_missing_exchange: Object.keys(results).filter(c => results[c].error).length,
    avg_pct_above_20bps: +avgPctAbove20.toFixed(1),
    avg_autocorrelation_lag1: +avgAR1.toFixed(4),
    zhivkov_comparison: {
      zhivkov_pct_above_20bps: 17,
      our_pct_above_20bps: +avgPctAbove20.toFixed(1),
      zhivkov_ar1: 0.96,
      our_ar1: +avgAR1.toFixed(4),
    }
  },
  coins_missing: Object.entries(results).filter(([, v]) => v.error).map(([k, v]) => ({ coin: k, reason: v.error })),
  profiles: Object.fromEntries(
    coins.sort((a, b) => Math.abs(results[b].mean_spread_bps) - Math.abs(results[a].mean_spread_bps))
      .map(c => [c, results[c]])
  ),
};

writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
console.log(`\n=== BACKTEST 1: CEX-DEX Spread Profile ===`);
console.log(`Coins analyzed: ${coins.length}/${files.length}`);
console.log(`Avg % above 20bps: ${avgPctAbove20.toFixed(1)}% (Zhivkov: 17%)`);
console.log(`Avg AR(1): ${avgAR1.toFixed(4)} (Zhivkov: 0.96)`);
console.log(`\nTop 10 by |mean spread|:`);
coins.sort((a, b) => Math.abs(results[b].mean_spread_bps) - Math.abs(results[a].mean_spread_bps))
  .slice(0, 10)
  .forEach(c => {
    const r = results[c];
    console.log(`  ${c.padEnd(10)} mean=${r.mean_spread_bps.toString().padStart(7)}bps  std=${r.std_bps.toString().padStart(7)}  >20bps=${r.pct_above_20bps}%  AR1=${r.autocorrelation_lag1}`);
  });

if (output.coins_missing.length > 0) {
  console.log(`\nMissing exchanges: ${output.coins_missing.map(m => m.coin).join(', ')}`);
}
console.log(`\nOutput: ${OUT_FILE}`);
