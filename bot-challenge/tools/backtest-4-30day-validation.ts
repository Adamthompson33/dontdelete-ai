#!/usr/bin/env npx tsx
/**
 * BACKTEST 4: 30-Day Momentum Validation
 * 
 * Uses Binance klines (price) + Binance funding rates (signal).
 * Funding is 8-hourly; we check each funding snapshot for extremes >100bps.
 * Regime from BTC 13/33 SMA. Stops regime-specific.
 * 
 * KEY QUESTIONS:
 * 1. Does signal survive across full month (up AND down)?
 * 2. Does long momentum work as well as short momentum?
 * 3. Signal frequency — trades per week?
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const KLINE_DIR = join(__dirname, '..', 'data', 'binance-klines');
const FUNDING_DIR = join(__dirname, '..', 'data', 'binance-funding');
const OUT_FILE = join(__dirname, '..', 'results', 'backtest-4-results.json');

const THRESHOLD_BPS = 100;
const HOLD_WINDOWS = [1, 2, 4, 6, 8];
const REGIME_STOPS: Record<string, number> = {
  CHOPPY: 0.02, TRENDING_DOWN: 0.03, VOLATILE: 0.03, TRENDING_UP: 0.04, UNKNOWN: 0.03,
};

interface Candle { t: number; o: string; c: string; h: string; l: string; v: string; }
interface FundingPoint { t: number; rate: number; rateBps: number; }

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

function classifyRegimes(btcCandles: Candle[]): Map<number, string> {
  const closes = btcCandles.map(c => parseFloat(c.c));
  const highs = btcCandles.map(c => parseFloat(c.h));
  const lows = btcCandles.map(c => parseFloat(c.l));
  const sma13 = sma(closes, 13);
  const sma33 = sma(closes, 33);
  const regimeMap = new Map<number, string>();
  
  for (let i = 0; i < btcCandles.length; i++) {
    const hourTs = Math.floor(btcCandles[i].t / 3600000) * 3600000;
    if (sma13[i] === null || sma33[i] === null) { regimeMap.set(hourTs, 'UNKNOWN'); continue; }
    const spread = (sma13[i]! - sma33[i]!) / sma33[i]!;
    const lookback = Math.min(i + 1, 8);
    let maxH = 0, minL = Infinity;
    for (let j = i - lookback + 1; j <= i; j++) { maxH = Math.max(maxH, highs[j]); minL = Math.min(minL, lows[j]); }
    const vol = (maxH - minL) / closes[i];
    
    if (vol > 0.03) regimeMap.set(hourTs, 'VOLATILE');
    else if (Math.abs(spread) < 0.002) regimeMap.set(hourTs, 'CHOPPY');
    else if (spread > 0) regimeMap.set(hourTs, 'TRENDING_UP');
    else regimeMap.set(hourTs, 'TRENDING_DOWN');
  }
  return regimeMap;
}

function getRegimeAtTime(regimeMap: Map<number, string>, timeMs: number): string {
  const hourTs = Math.floor(timeMs / 3600000) * 3600000;
  return regimeMap.get(hourTs) || 'UNKNOWN';
}

async function main() {
  // Load BTC klines for regime
  const btcCandles: Candle[] = JSON.parse(readFileSync(join(KLINE_DIR, 'BTC.json'), 'utf-8'));
  btcCandles.sort((a, b) => a.t - b.t);
  const regimeMap = classifyRegimes(btcCandles);
  
  // Count regimes
  const regimeCounts: Record<string, number> = {};
  for (const r of regimeMap.values()) regimeCounts[r] = (regimeCounts[r] || 0) + 1;
  console.log('30-day regime distribution (hourly):', regimeCounts);
  
  // Get all coins with both klines and funding
  const klineCoins = new Set(readdirSync(KLINE_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')));
  const fundingCoins = readdirSync(FUNDING_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  const coins = fundingCoins.filter(c => klineCoins.has(c) && c !== 'BTC');
  
  console.log(`\nCoins with both klines + funding: ${coins.length}`);
  
  // Exclude concentrated coins from BT2
  const EXCLUDE = new Set(['AZTEC', 'AXS']);
  
  interface Trade {
    coin: string;
    fundingTime: number;
    fundingBps: number;
    regime: string;
    direction: 'long' | 'short';
    entryPrice: number;
    stopPct: number;
    results: Record<string, { returnPct: number; stoppedOut: boolean; stoppedAtHour?: number; }>;
  }
  
  const allTrades: Trade[] = [];
  const allTradesNoExclude: Trade[] = [];
  const coinSignalCounts: Record<string, number> = {};
  
  for (const coin of fundingCoins.filter(c => klineCoins.has(c) && c !== 'BTC')) {
    const funding: FundingPoint[] = JSON.parse(readFileSync(join(FUNDING_DIR, `${coin}.json`), 'utf-8'));
    const candles: Candle[] = JSON.parse(readFileSync(join(KLINE_DIR, `${coin}.json`), 'utf-8'));
    candles.sort((a, b) => a.t - b.t);
    
    // Build hourly price map + candle array for stop checking
    const priceByHour = new Map<number, number>();
    for (const c of candles) {
      const hourTs = Math.floor(c.t / 3600000) * 3600000;
      priceByHour.set(hourTs, parseFloat(c.c));
    }
    
    for (const fp of funding) {
      if (Math.abs(fp.rateBps) < THRESHOLD_BPS) continue;
      
      const fundingHour = Math.floor(fp.t / 3600000) * 3600000;
      const entryPrice = priceByHour.get(fundingHour);
      if (!entryPrice) continue;
      
      const regime = getRegimeAtTime(regimeMap, fp.t);
      const direction: 'long' | 'short' = fp.rateBps < 0 ? 'short' : 'long';
      const stopPct = REGIME_STOPS[regime] || 0.03;
      
      // Simulate trade with stops
      const results: Trade['results'] = {};
      let alreadyStopped = false;
      let stoppedAtHour = 0;
      
      for (const h of HOLD_WINDOWS) {
        const targetTime = fundingHour + h * 3600000;
        
        if (!alreadyStopped) {
          // Check candles between entry and target for stop breach
          for (const c of candles) {
            if (c.t <= fundingHour) continue;
            if (c.t > targetTime) break;
            const high = parseFloat(c.h);
            const low = parseFloat(c.l);
            if (direction === 'short' && high >= entryPrice * (1 + stopPct)) {
              alreadyStopped = true;
              stoppedAtHour = Math.ceil((c.t - fundingHour) / 3600000);
              break;
            }
            if (direction === 'long' && low <= entryPrice * (1 - stopPct)) {
              alreadyStopped = true;
              stoppedAtHour = Math.ceil((c.t - fundingHour) / 3600000);
              break;
            }
          }
        }
        
        if (alreadyStopped) {
          results[`${h}h`] = { returnPct: -stopPct, stoppedOut: true, stoppedAtHour };
        } else {
          const exitPrice = priceByHour.get(targetTime);
          if (!exitPrice) continue;
          const rawRet = (exitPrice - entryPrice) / entryPrice;
          const ret = direction === 'short' ? -rawRet : rawRet;
          results[`${h}h`] = { returnPct: ret, stoppedOut: false };
        }
      }
      
      if (Object.keys(results).length === 0) continue;
      
      const trade: Trade = {
        coin, fundingTime: fp.t, fundingBps: fp.rateBps, regime,
        direction, entryPrice, stopPct, results,
      };
      
      coinSignalCounts[coin] = (coinSignalCounts[coin] || 0) + 1;
      allTradesNoExclude.push(trade);
      if (!EXCLUDE.has(coin)) allTrades.push(trade);
    }
  }
  
  console.log(`\nTotal trades (no AZTEC/AXS): ${allTrades.length}`);
  console.log(`Total trades (all coins): ${allTradesNoExclude.length}`);
  
  // === ANALYSIS ===
  function analyze(trades: Trade[], label: string) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${label} (n=${trades.length})`);
    console.log('='.repeat(70));
    
    // Overall
    console.log('\n--- OVERALL (with stops) ---');
    for (const h of HOLD_WINDOWS) {
      const wk = `${h}h`;
      const relevant = trades.filter(t => t.results[wk]);
      const returns = relevant.map(t => t.results[wk].returnPct);
      if (returns.length === 0) continue;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const winRate = returns.filter(r => r > 0).length / returns.length;
      const stopped = relevant.filter(t => t.results[wk].stoppedOut).length;
      const cumReturn = returns.reduce((a, b) => a + b, 0);
      const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length);
      const sharpe = std > 0 ? mean / std : 0;
      console.log(`  ${wk}: mean=${(mean*100).toFixed(3)}%, winRate=${(winRate*100).toFixed(1)}%, sharpe=${sharpe.toFixed(3)}, survived=${relevant.length-stopped}/${relevant.length} (${((1-stopped/relevant.length)*100).toFixed(0)}%), cumReturn=${(cumReturn*100).toFixed(1)}%`);
    }
    
    // By regime
    console.log('\n--- BY REGIME ---');
    const regimes = [...new Set(trades.map(t => t.regime))].sort();
    for (const regime of regimes) {
      const rt = trades.filter(t => t.regime === regime);
      if (rt.length < 3) continue;
      console.log(`\n  ${regime} (n=${rt.length}, stop=${((REGIME_STOPS[regime]||0.03)*100)}%):`);
      for (const h of HOLD_WINDOWS) {
        const wk = `${h}h`;
        const relevant = rt.filter(t => t.results[wk]);
        const returns = relevant.map(t => t.results[wk].returnPct);
        if (returns.length === 0) continue;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const winRate = returns.filter(r => r > 0).length / returns.length;
        const stopped = relevant.filter(t => t.results[wk].stoppedOut).length;
        console.log(`    ${wk}: mean=${(mean*100).toFixed(3)}%, winRate=${(winRate*100).toFixed(1)}%, survived=${relevant.length-stopped}/${relevant.length}`);
      }
    }
    
    // Q2: Long vs Short momentum
    console.log('\n--- LONG vs SHORT MOMENTUM ---');
    for (const dir of ['long', 'short'] as const) {
      const dt = trades.filter(t => t.direction === dir);
      console.log(`\n  ${dir.toUpperCase()} (n=${dt.length}):`);
      for (const h of HOLD_WINDOWS) {
        const wk = `${h}h`;
        const relevant = dt.filter(t => t.results[wk]);
        const returns = relevant.map(t => t.results[wk].returnPct);
        if (returns.length === 0) continue;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const winRate = returns.filter(r => r > 0).length / returns.length;
        const stopped = relevant.filter(t => t.results[wk].stoppedOut).length;
        console.log(`    ${wk}: mean=${(mean*100).toFixed(3)}%, winRate=${(winRate*100).toFixed(1)}%, survived=${relevant.length-stopped}/${relevant.length}`);
      }
    }
    
    // Q3: Signal frequency
    const times = trades.map(t => t.fundingTime).sort((a, b) => a - b);
    const spanDays = (times[times.length - 1] - times[0]) / (24 * 3600000);
    const tradesPerWeek = trades.length / (spanDays / 7);
    console.log(`\n--- SIGNAL FREQUENCY ---`);
    console.log(`  Period: ${new Date(times[0]).toISOString().slice(0,10)} to ${new Date(times[times.length-1]).toISOString().slice(0,10)} (${spanDays.toFixed(0)} days)`);
    console.log(`  Total signals: ${trades.length}`);
    console.log(`  Trades/week: ${tradesPerWeek.toFixed(1)}`);
    console.log(`  Trades/day: ${(trades.length / spanDays).toFixed(1)}`);
    
    // Weekly breakdown
    console.log('\n  Weekly breakdown:');
    const weekBuckets: Record<string, number> = {};
    for (const t of trades) {
      const d = new Date(t.fundingTime);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      weekBuckets[key] = (weekBuckets[key] || 0) + 1;
    }
    for (const [week, count] of Object.entries(weekBuckets).sort()) {
      console.log(`    ${week}: ${count} trades`);
    }
  }
  
  analyze(allTrades, 'BACKTEST 4: 30-DAY MOMENTUM (no AZTEC/AXS)');
  analyze(allTradesNoExclude, 'BACKTEST 4: 30-DAY MOMENTUM (all coins)');
  
  // Top coins
  console.log('\n--- TOP COINS BY SIGNAL COUNT ---');
  const sorted = Object.entries(coinSignalCounts).sort((a, b) => b[1] - a[1]);
  for (const [coin, count] of sorted.slice(0, 15)) {
    console.log(`  ${coin}: ${count}`);
  }
  
  // Save
  writeFileSync(OUT_FILE, JSON.stringify({
    metadata: {
      period: `${new Date(Math.min(...allTradesNoExclude.map(t=>t.fundingTime))).toISOString().slice(0,10)} to ${new Date(Math.max(...allTradesNoExclude.map(t=>t.fundingTime))).toISOString().slice(0,10)}`,
      threshold_bps: THRESHOLD_BPS,
      stops: REGIME_STOPS,
      totalTrades: allTrades.length,
      totalTradesAll: allTradesNoExclude.length,
    },
    regimeDistribution: regimeCounts,
    coinSignalCounts,
    trades: allTrades,
    tradesAll: allTradesNoExclude,
  }, null, 2));
  console.log(`\nResults saved to ${OUT_FILE}`);
}

main().catch(console.error);
