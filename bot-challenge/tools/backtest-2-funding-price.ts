#!/usr/bin/env npx tsx
/**
 * BACKTEST 2: Intra-HL Funding Extremes → Price Response
 * 
 * Question: "Does regime predict profitability of intra-HL funding rate signals?"
 * 
 * Method:
 * 1. Find all HL funding extremes (>50bps abs) from Loris data
 * 2. Reconstruct regime from BTC candles (CHOP/TRENDING_UP/TRENDING_DOWN/VOLATILE)
 * 3. Track price movement 1-8h after each extreme
 * 4. Segment by regime
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const LORIS_DIR = join(__dirname, '..', 'data', 'loris-historical');
const CANDLE_DIR = join(__dirname, '..', 'data', 'hl-candles');
const OUT_FILE = join(__dirname, '..', 'results', 'backtest-2-results.json');

const FUNDING_THRESHOLD_BPS = 50; // absolute value in bps (1 bps = 0.01%)
const HOLD_WINDOWS = [1, 2, 4, 6, 8]; // hours after signal

// ========== REGIME CLASSIFICATION ==========
// Using BTC 13/33 MA cross (same as SI's ETH strategy) + volatility

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
  // Hourly regime classification using 13/33 SMA cross + volatility
  const closes = btcCandles.map(c => parseFloat(c.c));
  const highs = btcCandles.map(c => parseFloat(c.h));
  const lows = btcCandles.map(c => parseFloat(c.l));
  
  const sma13 = sma(closes, 13);
  const sma33 = sma(closes, 33);
  
  // Hourly volatility: rolling 8h range / close
  const regimeMap = new Map<string, string>();
  
  for (let i = 0; i < btcCandles.length; i++) {
    const ts = new Date(btcCandles[i].t).toISOString().slice(0, 13) + ':00:00Z';
    
    if (sma13[i] === null || sma33[i] === null) {
      regimeMap.set(ts, 'UNKNOWN');
      continue;
    }
    
    const fast = sma13[i]!;
    const slow = sma33[i]!;
    const spread = (fast - slow) / slow;
    
    // Volatility: 8h rolling range
    const lookback = Math.min(i + 1, 8);
    let maxH = 0, minL = Infinity;
    for (let j = i - lookback + 1; j <= i; j++) {
      maxH = Math.max(maxH, highs[j]);
      minL = Math.min(minL, lows[j]);
    }
    const vol = (maxH - minL) / closes[i];
    
    let regime: string;
    if (vol > 0.03) {
      regime = 'VOLATILE';
    } else if (Math.abs(spread) < 0.002) {
      regime = 'CHOPPY';
    } else if (spread > 0) {
      regime = 'TRENDING_UP';
    } else {
      regime = 'TRENDING_DOWN';
    }
    
    regimeMap.set(ts, regime);
  }
  
  return regimeMap;
}

// ========== MAIN ==========

interface FundingEvent {
  coin: string;
  timestamp: string;
  fundingRate: number; // raw from Loris (already in % or bps — need to check)
  regime: string;
  direction: 'long' | 'short'; // long if funding very negative (shorts paying), short if very positive
  priceAtSignal: number;
  returns: Record<string, number>; // keyed by hold window
}

async function main() {
  // 1. Load BTC candles and build regime map
  const btcCandles: Candle[] = JSON.parse(readFileSync(join(CANDLE_DIR, 'BTC.json'), 'utf-8'));
  btcCandles.sort((a, b) => a.t - b.t);
  const regimeMap = classifyRegimes(btcCandles);
  
  console.log(`Regime map: ${regimeMap.size} hours classified`);
  const regimeCounts: Record<string, number> = {};
  for (const r of regimeMap.values()) regimeCounts[r] = (regimeCounts[r] || 0) + 1;
  console.log('Regime distribution:', regimeCounts);
  
  // 2. Process each coin
  const lorisFiles = readdirSync(LORIS_DIR).filter(f => f.endsWith('.json'));
  const candleFiles = new Set(readdirSync(CANDLE_DIR).map(f => f.replace('.json', '')));
  
  const allEvents: FundingEvent[] = [];
  const coinStats: Record<string, { extremes: number; withPrice: number }> = {};
  
  for (const file of lorisFiles) {
    const coin = file.replace('.json', '');
    if (!candleFiles.has(coin)) continue; // need price data
    if (coin === 'BTC') continue; // BTC is regime proxy, not trade target
    
    const loris = JSON.parse(readFileSync(join(LORIS_DIR, file), 'utf-8'));
    const hlFunding = loris.series?.hyperliquid;
    if (!hlFunding || hlFunding.length === 0) continue;
    
    const candles: Candle[] = JSON.parse(readFileSync(join(CANDLE_DIR, `${coin}.json`), 'utf-8'));
    candles.sort((a, b) => a.t - b.t);
    
    // Build price map: timestamp -> close price
    const priceMap = new Map<string, number>();
    for (const c of candles) {
      const ts = new Date(c.t).toISOString().slice(0, 13) + ':00:00Z';
      priceMap.set(ts, parseFloat(c.c));
    }
    
    let extremes = 0, withPrice = 0;
    
    for (const point of hlFunding) {
      const rate = point.y; // Loris rate (need to determine units)
      // Loris y values seem to be in bps already based on sample (1.0 = 1 bps)
      // Check: if typical values are 1-100 range, they're bps. If 0.01-1.0, they're %
      
      if (Math.abs(rate) < FUNDING_THRESHOLD_BPS) continue;
      extremes++;
      
      const ts = point.t; // ISO string
      const normalTs = ts.slice(0, 13) + ':00:00Z';
      const price = priceMap.get(normalTs);
      if (!price) continue;
      withPrice++;
      
      const regime = regimeMap.get(normalTs) || 'UNKNOWN';
      
      // Direction: very negative funding = shorts paying longs = go long (crowded short)
      // Very positive funding = longs paying shorts = go short (crowded long)  
      const direction: 'long' | 'short' = rate < 0 ? 'long' : 'short';
      
      // Calculate returns at each hold window
      const returns: Record<string, number> = {};
      for (const h of HOLD_WINDOWS) {
        const futureTs = new Date(new Date(normalTs).getTime() + h * 3600000).toISOString().slice(0, 13) + ':00:00Z';
        const futurePrice = priceMap.get(futureTs);
        if (futurePrice) {
          const rawReturn = (futurePrice - price) / price;
          // Adjust for direction: long = raw, short = -raw
          returns[`${h}h`] = direction === 'long' ? rawReturn : -rawReturn;
        }
      }
      
      if (Object.keys(returns).length === 0) continue;
      
      allEvents.push({
        coin,
        timestamp: normalTs,
        fundingRate: rate,
        regime,
        direction,
        priceAtSignal: price,
        returns,
      });
    }
    
    coinStats[coin] = { extremes, withPrice };
  }
  
  console.log(`\nTotal funding extremes found: ${allEvents.length}`);
  console.log(`Coins with data: ${Object.keys(coinStats).length}`);
  
  // 3. Aggregate by regime
  interface RegimeStats {
    count: number;
    byWindow: Record<string, { 
      returns: number[]; 
      mean: number; 
      median: number; 
      winRate: number; 
      sharpe: number;
    }>;
    avgAbsFunding: number;
    longCount: number;
    shortCount: number;
  }
  
  const byRegime: Record<string, RegimeStats> = {};
  
  for (const event of allEvents) {
    if (!byRegime[event.regime]) {
      byRegime[event.regime] = { 
        count: 0, byWindow: {}, avgAbsFunding: 0, longCount: 0, shortCount: 0 
      };
    }
    const rs = byRegime[event.regime];
    rs.count++;
    rs.avgAbsFunding += Math.abs(event.fundingRate);
    if (event.direction === 'long') rs.longCount++; else rs.shortCount++;
    
    for (const [window, ret] of Object.entries(event.returns)) {
      if (!rs.byWindow[window]) {
        rs.byWindow[window] = { returns: [], mean: 0, median: 0, winRate: 0, sharpe: 0 };
      }
      rs.byWindow[window].returns.push(ret);
    }
  }
  
  // Calculate stats
  for (const [regime, rs] of Object.entries(byRegime)) {
    rs.avgAbsFunding /= rs.count;
    for (const [window, ws] of Object.entries(rs.byWindow)) {
      const r = ws.returns;
      r.sort((a, b) => a - b);
      ws.mean = r.reduce((a, b) => a + b, 0) / r.length;
      ws.median = r.length % 2 === 0 
        ? (r[r.length / 2 - 1] + r[r.length / 2]) / 2 
        : r[Math.floor(r.length / 2)];
      ws.winRate = r.filter(x => x > 0).length / r.length;
      const std = Math.sqrt(r.reduce((a, b) => a + (b - ws.mean) ** 2, 0) / r.length);
      ws.sharpe = std > 0 ? ws.mean / std : 0;
    }
  }
  
  // 4. Overall stats (all regimes combined)
  const overall: Record<string, { returns: number[]; mean: number; median: number; winRate: number; sharpe: number }> = {};
  for (const event of allEvents) {
    for (const [window, ret] of Object.entries(event.returns)) {
      if (!overall[window]) overall[window] = { returns: [], mean: 0, median: 0, winRate: 0, sharpe: 0 };
      overall[window].returns.push(ret);
    }
  }
  for (const ws of Object.values(overall)) {
    const r = ws.returns;
    r.sort((a, b) => a - b);
    ws.mean = r.reduce((a, b) => a + b, 0) / r.length;
    ws.median = r.length % 2 === 0 ? (r[r.length / 2 - 1] + r[r.length / 2]) / 2 : r[Math.floor(r.length / 2)];
    ws.winRate = r.filter(x => x > 0).length / r.length;
    const std = Math.sqrt(r.reduce((a, b) => a + (b - ws.mean) ** 2, 0) / r.length);
    ws.sharpe = std > 0 ? ws.mean / std : 0;
  }
  
  // 5. Top coins by signal count
  const coinSignalCounts: Record<string, number> = {};
  for (const e of allEvents) coinSignalCounts[e.coin] = (coinSignalCounts[e.coin] || 0) + 1;
  const topCoins = Object.entries(coinSignalCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  
  // 6. Print results
  console.log('\n' + '='.repeat(70));
  console.log('BACKTEST 2: Funding Extremes → Price Response by Regime');
  console.log('='.repeat(70));
  console.log(`Period: Feb 18-25, 2026 | Threshold: >${FUNDING_THRESHOLD_BPS} bps abs`);
  console.log(`Total events: ${allEvents.length} across ${Object.keys(coinSignalCounts).length} coins\n`);
  
  console.log('--- OVERALL (all regimes) ---');
  for (const h of HOLD_WINDOWS) {
    const ws = overall[`${h}h`];
    if (!ws) continue;
    console.log(`  ${h}h: mean=${(ws.mean * 100).toFixed(3)}%, median=${(ws.median * 100).toFixed(3)}%, winRate=${(ws.winRate * 100).toFixed(1)}%, sharpe=${ws.sharpe.toFixed(3)}, n=${ws.returns.length}`);
  }
  
  console.log('\n--- BY REGIME ---');
  for (const [regime, rs] of Object.entries(byRegime)) {
    console.log(`\n  ${regime} (n=${rs.count}, avg|funding|=${rs.avgAbsFunding.toFixed(1)} bps, long=${rs.longCount} short=${rs.shortCount})`);
    for (const h of HOLD_WINDOWS) {
      const ws = rs.byWindow[`${h}h`];
      if (!ws) continue;
      console.log(`    ${h}h: mean=${(ws.mean * 100).toFixed(3)}%, median=${(ws.median * 100).toFixed(3)}%, winRate=${(ws.winRate * 100).toFixed(1)}%, sharpe=${ws.sharpe.toFixed(3)}, n=${ws.returns.length}`);
    }
  }
  
  console.log('\n--- TOP COINS BY SIGNAL COUNT ---');
  for (const [coin, count] of topCoins) {
    console.log(`  ${coin}: ${count} signals`);
  }
  
  // 7. Save full results
  const output = {
    metadata: {
      period: 'Feb 18-25, 2026',
      threshold_bps: FUNDING_THRESHOLD_BPS,
      total_events: allEvents.length,
      coins_with_signals: Object.keys(coinSignalCounts).length,
      hold_windows: HOLD_WINDOWS,
      regime_source: 'BTC 13/33 SMA cross + 8h volatility',
    },
    regimeDistribution: regimeCounts,
    overall: Object.fromEntries(
      Object.entries(overall).map(([k, v]) => [k, { mean: v.mean, median: v.median, winRate: v.winRate, sharpe: v.sharpe, n: v.returns.length }])
    ),
    byRegime: Object.fromEntries(
      Object.entries(byRegime).map(([regime, rs]) => [regime, {
        count: rs.count,
        avgAbsFunding: rs.avgAbsFunding,
        longCount: rs.longCount,
        shortCount: rs.shortCount,
        windows: Object.fromEntries(
          Object.entries(rs.byWindow).map(([k, v]) => [k, { mean: v.mean, median: v.median, winRate: v.winRate, sharpe: v.sharpe, n: v.returns.length }])
        ),
      }])
    ),
    topCoins: Object.fromEntries(topCoins),
    coinStats,
    events: allEvents, // full event log for drill-down
  };
  
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to ${OUT_FILE}`);
}

main().catch(console.error);
