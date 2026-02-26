#!/usr/bin/env npx tsx
/**
 * BACKTEST 2B: Three Variant Tests
 * 
 * TEST 1: Momentum Inversion — go WITH funding direction
 * TEST 2: Higher thresholds (100bps, 200bps) 
 * TEST 3: Exclude AZTEC/AXS concentration
 * All combinations run in one pass.
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const LORIS_DIR = join(__dirname, '..', 'data', 'loris-historical');
const CANDLE_DIR = join(__dirname, '..', 'data', 'hl-candles');
const OUT_FILE = join(__dirname, '..', 'results', 'backtest-2b-results.json');

const HOLD_WINDOWS = [1, 2, 4, 6, 8];
const THRESHOLDS = [50, 100, 200];
const EXCLUDE_COINS = new Set(['AZTEC', 'AXS']);

interface Candle {
  t: number; T: number; s: string; i: string;
  o: string; c: string; h: string; l: string; v: string; n: number;
}

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

function classifyRegimes(btcCandles: Candle[]): Map<string, string> {
  const closes = btcCandles.map(c => parseFloat(c.c));
  const highs = btcCandles.map(c => parseFloat(c.h));
  const lows = btcCandles.map(c => parseFloat(c.l));
  const sma13 = sma(closes, 13);
  const sma33 = sma(closes, 33);
  const regimeMap = new Map<string, string>();
  
  for (let i = 0; i < btcCandles.length; i++) {
    const ts = new Date(btcCandles[i].t).toISOString().slice(0, 13) + ':00:00Z';
    if (sma13[i] === null || sma33[i] === null) { regimeMap.set(ts, 'UNKNOWN'); continue; }
    const spread = (sma13[i]! - sma33[i]!) / sma33[i]!;
    const lookback = Math.min(i + 1, 8);
    let maxH = 0, minL = Infinity;
    for (let j = i - lookback + 1; j <= i; j++) { maxH = Math.max(maxH, highs[j]); minL = Math.min(minL, lows[j]); }
    const vol = (maxH - minL) / closes[i];
    
    if (vol > 0.03) regimeMap.set(ts, 'VOLATILE');
    else if (Math.abs(spread) < 0.002) regimeMap.set(ts, 'CHOPPY');
    else if (spread > 0) regimeMap.set(ts, 'TRENDING_UP');
    else regimeMap.set(ts, 'TRENDING_DOWN');
  }
  return regimeMap;
}

interface RawEvent {
  coin: string;
  timestamp: string;
  fundingRate: number;
  regime: string;
  price: number;
  priceMap: Map<string, number>; // ref to coin's price map for return calc
}

function calcStats(events: RawEvent[], mode: 'carry' | 'momentum') {
  interface WinStats { mean: number; median: number; winRate: number; sharpe: number; n: number; }
  const byRegime: Record<string, Record<string, { returns: number[] }>> = {};
  const overall: Record<string, { returns: number[] }> = {};
  
  for (const e of events) {
    // Carry: long when funding negative, short when positive (fade the crowd)
    // Momentum: short when funding negative, long when positive (ride the crowd)
    const carryDir = e.fundingRate < 0 ? 1 : -1; // 1=long, -1=short
    const dir = mode === 'carry' ? carryDir : -carryDir;
    
    for (const h of HOLD_WINDOWS) {
      const futureTs = new Date(new Date(e.timestamp).getTime() + h * 3600000).toISOString().slice(0, 13) + ':00:00Z';
      const futurePrice = e.priceMap.get(futureTs);
      if (!futurePrice) continue;
      const ret = dir * (futurePrice - e.price) / e.price;
      
      const wk = `${h}h`;
      if (!overall[wk]) overall[wk] = { returns: [] };
      overall[wk].returns.push(ret);
      
      if (!byRegime[e.regime]) byRegime[e.regime] = {};
      if (!byRegime[e.regime][wk]) byRegime[e.regime][wk] = { returns: [] };
      byRegime[e.regime][wk].returns.push(ret);
    }
  }
  
  function summarize(returns: number[]): WinStats {
    if (returns.length === 0) return { mean: 0, median: 0, winRate: 0, sharpe: 0, n: 0 };
    const r = [...returns].sort((a, b) => a - b);
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const median = r.length % 2 === 0 ? (r[r.length / 2 - 1] + r[r.length / 2]) / 2 : r[Math.floor(r.length / 2)];
    const winRate = r.filter(x => x > 0).length / r.length;
    const std = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
    const sharpe = std > 0 ? mean / std : 0;
    return { mean, median, winRate, sharpe, n: r.length };
  }
  
  return {
    overall: Object.fromEntries(Object.entries(overall).map(([k, v]) => [k, summarize(v.returns)])),
    byRegime: Object.fromEntries(Object.entries(byRegime).map(([regime, windows]) => [
      regime, Object.fromEntries(Object.entries(windows).map(([k, v]) => [k, summarize(v.returns)]))
    ])),
    totalEvents: events.length,
  };
}

async function main() {
  const btcCandles: Candle[] = JSON.parse(readFileSync(join(CANDLE_DIR, 'BTC.json'), 'utf-8'));
  btcCandles.sort((a, b) => a.t - b.t);
  const regimeMap = classifyRegimes(btcCandles);
  
  // Load all raw events (at lowest threshold, we'll filter up)
  const lorisFiles = readdirSync(LORIS_DIR).filter(f => f.endsWith('.json'));
  const candleFiles = new Set(readdirSync(CANDLE_DIR).map(f => f.replace('.json', '')));
  const allRawEvents: RawEvent[] = [];
  
  for (const file of lorisFiles) {
    const coin = file.replace('.json', '');
    if (!candleFiles.has(coin) || coin === 'BTC') continue;
    
    const loris = JSON.parse(readFileSync(join(LORIS_DIR, file), 'utf-8'));
    const hlFunding = loris.series?.hyperliquid;
    if (!hlFunding?.length) continue;
    
    const candles: Candle[] = JSON.parse(readFileSync(join(CANDLE_DIR, `${coin}.json`), 'utf-8'));
    candles.sort((a, b) => a.t - b.t);
    const priceMap = new Map<string, number>();
    for (const c of candles) {
      priceMap.set(new Date(c.t).toISOString().slice(0, 13) + ':00:00Z', parseFloat(c.c));
    }
    
    for (const point of hlFunding) {
      if (Math.abs(point.y) < 50) continue; // minimum threshold
      const normalTs = point.t.slice(0, 13) + ':00:00Z';
      const price = priceMap.get(normalTs);
      if (!price) continue;
      allRawEvents.push({
        coin, timestamp: normalTs, fundingRate: point.y,
        regime: regimeMap.get(normalTs) || 'UNKNOWN', price, priceMap,
      });
    }
  }
  
  console.log(`Total raw events (>=50bps): ${allRawEvents.length}\n`);
  
  // Run all variant combinations
  const results: Record<string, any> = {};
  
  for (const threshold of THRESHOLDS) {
    for (const excludeConcentrated of [false, true]) {
      const filtered = allRawEvents.filter(e => {
        if (Math.abs(e.fundingRate) < threshold) return false;
        if (excludeConcentrated && EXCLUDE_COINS.has(e.coin)) return false;
        return true;
      });
      
      const label = `${threshold}bps${excludeConcentrated ? '_noAZTEC_AXS' : '_all'}`;
      
      const carry = calcStats(filtered, 'carry');
      const momentum = calcStats(filtered, 'momentum');
      
      results[label] = { carry, momentum, threshold, excludeConcentrated, eventCount: filtered.length };
      
      // Print summary
      console.log(`=== ${label} (n=${filtered.length}) ===`);
      console.log('  CARRY (fade funding):');
      for (const h of HOLD_WINDOWS) {
        const s = carry.overall[`${h}h`];
        if (s) console.log(`    ${h}h: mean=${(s.mean*100).toFixed(3)}%, winRate=${(s.winRate*100).toFixed(1)}%, sharpe=${s.sharpe.toFixed(3)}, n=${s.n}`);
      }
      console.log('  MOMENTUM (ride funding):');
      for (const h of HOLD_WINDOWS) {
        const s = momentum.overall[`${h}h`];
        if (s) console.log(`    ${h}h: mean=${(s.mean*100).toFixed(3)}%, winRate=${(s.winRate*100).toFixed(1)}%, sharpe=${s.sharpe.toFixed(3)}, n=${s.n}`);
      }
      
      // Best regime for momentum
      const bestRegime = Object.entries(momentum.byRegime)
        .map(([r, windows]) => ({ regime: r, ...(windows['4h'] || { mean: 0, sharpe: 0, n: 0 }) }))
        .filter(x => x.n >= 5)
        .sort((a, b) => (b as any).sharpe - (a as any).sharpe)[0];
      if (bestRegime) {
        console.log(`  Best momentum regime (4h): ${bestRegime.regime} — mean=${((bestRegime as any).mean*100).toFixed(3)}%, sharpe=${(bestRegime as any).sharpe.toFixed(3)}, n=${(bestRegime as any).n}`);
      }
      console.log();
    }
  }
  
  // Detailed regime breakdown for the most interesting variant
  console.log('\n' + '='.repeat(70));
  console.log('DETAILED REGIME BREAKDOWN — MOMENTUM @ 100bps (all coins)');
  console.log('='.repeat(70));
  const key100 = results['100bps_all'];
  if (key100) {
    for (const [regime, windows] of Object.entries(key100.momentum.byRegime as Record<string, any>)) {
      console.log(`\n  ${regime}:`);
      for (const h of HOLD_WINDOWS) {
        const s = (windows as any)[`${h}h`];
        if (s) console.log(`    ${h}h: mean=${(s.mean*100).toFixed(3)}%, median=${(s.median*100).toFixed(3)}%, winRate=${(s.winRate*100).toFixed(1)}%, sharpe=${s.sharpe.toFixed(3)}, n=${s.n}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('DETAILED REGIME BREAKDOWN — MOMENTUM @ 100bps (no AZTEC/AXS)');
  console.log('='.repeat(70));
  const key100ex = results['100bps_noAZTEC_AXS'];
  if (key100ex) {
    for (const [regime, windows] of Object.entries(key100ex.momentum.byRegime as Record<string, any>)) {
      console.log(`\n  ${regime}:`);
      for (const h of HOLD_WINDOWS) {
        const s = (windows as any)[`${h}h`];
        if (s) console.log(`    ${h}h: mean=${(s.mean*100).toFixed(3)}%, median=${(s.median*100).toFixed(3)}%, winRate=${(s.winRate*100).toFixed(1)}%, sharpe=${s.sharpe.toFixed(3)}, n=${s.n}`);
      }
    }
  }
  
  // Strip priceMap from output (not serializable)
  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${OUT_FILE}`);
}

main().catch(console.error);
