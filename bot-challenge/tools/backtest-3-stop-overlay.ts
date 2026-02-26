#!/usr/bin/env npx tsx
/**
 * BACKTEST 3: Stop-Loss Overlay on Momentum Signals
 * 
 * Takes the momentum events from Backtest 2B and applies regime-specific stops:
 * - CHOPPY: 2% stop
 * - TRENDING_DOWN / VOLATILE: 3% stop  
 * - TRENDING_UP: 4% stop
 * 
 * Tracks: survival rate, stopped-out P&L, net P&L after stops
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CANDLE_DIR = join(__dirname, '..', 'data', 'hl-candles');
const BT2_FILE = join(__dirname, '..', 'results', 'backtest-2-results.json');
const OUT_FILE = join(__dirname, '..', 'results', 'backtest-3-results.json');

const HOLD_WINDOWS = [1, 2, 4, 6, 8];
const EXCLUDE_COINS = new Set(['AZTEC', 'AXS']);

const REGIME_STOPS: Record<string, number> = {
  CHOPPY: 0.02,
  TRENDING_DOWN: 0.03,
  TRENDING_UP: 0.04,
  VOLATILE: 0.03,
  UNKNOWN: 0.03,
};

interface Candle {
  t: number; T: number; s: string; i: string;
  o: string; c: string; h: string; l: string; v: string; n: number;
}

interface BT2Event {
  coin: string;
  timestamp: string;
  fundingRate: number;
  regime: string;
  direction: string; // from BT2 this is carry direction — we invert for momentum
  priceAtSignal: number;
  returns: Record<string, number>;
}

async function main() {
  // Load BT2 events
  const bt2 = JSON.parse(readFileSync(BT2_FILE, 'utf-8'));
  const events: BT2Event[] = bt2.events;
  
  console.log(`Loaded ${events.length} events from Backtest 2\n`);
  
  // Load candle data for intra-hour stop checking
  const candleCache: Record<string, Candle[]> = {};
  
  // Filter: >=100bps, exclude AZTEC/AXS (matching the best variant from 2B)
  const filtered = events.filter(e => 
    Math.abs(e.fundingRate) >= 100 && !EXCLUDE_COINS.has(e.coin)
  );
  
  console.log(`Filtered to ${filtered.length} events (>=100bps, no AZTEC/AXS)\n`);
  
  // For each event, simulate the trade with stops
  interface TradeResult {
    coin: string;
    timestamp: string;
    regime: string;
    fundingRate: number;
    momentumDir: 'short' | 'long'; // inverted from carry
    entryPrice: number;
    stopLevel: number;
    stopPct: number;
    results: Record<string, {
      exitPrice: number;
      returnPct: number;
      stoppedOut: boolean;
      stoppedAtHour?: number;
    }>;
  }
  
  const trades: TradeResult[] = [];
  
  for (const event of filtered) {
    // Momentum direction: opposite of carry
    // BT2 carry direction: long if funding negative, short if positive
    // Momentum: short if funding negative, long if positive
    const momentumDir: 'short' | 'long' = event.fundingRate < 0 ? 'short' : 'long';
    const stopPct = REGIME_STOPS[event.regime] || 0.03;
    
    // Load candles if not cached
    if (!candleCache[event.coin]) {
      try {
        candleCache[event.coin] = JSON.parse(readFileSync(join(CANDLE_DIR, `${event.coin}.json`), 'utf-8'));
        candleCache[event.coin].sort((a: Candle, b: Candle) => a.t - b.t);
      } catch { continue; }
    }
    const candles = candleCache[event.coin];
    
    const entryPrice = event.priceAtSignal;
    const entryTime = new Date(event.timestamp).getTime();
    
    // Stop price
    let stopPrice: number;
    if (momentumDir === 'short') {
      stopPrice = entryPrice * (1 + stopPct); // stop above for shorts
    } else {
      stopPrice = entryPrice * (1 - stopPct); // stop below for longs
    }
    
    const results: TradeResult['results'] = {};
    let alreadyStopped = false;
    let stoppedAtHour = 0;
    
    for (const h of HOLD_WINDOWS) {
      const targetTime = entryTime + h * 3600000;
      
      // Check if stopped out by looking at candle highs/lows between entry and target
      if (!alreadyStopped) {
        for (const c of candles) {
          if (c.t <= entryTime) continue;
          if (c.t > targetTime) break;
          
          const high = parseFloat(c.h);
          const low = parseFloat(c.l);
          
          if (momentumDir === 'short' && high >= stopPrice) {
            alreadyStopped = true;
            stoppedAtHour = Math.ceil((c.t - entryTime) / 3600000);
            break;
          }
          if (momentumDir === 'long' && low <= stopPrice) {
            alreadyStopped = true;
            stoppedAtHour = Math.ceil((c.t - entryTime) / 3600000);
            break;
          }
        }
      }
      
      if (alreadyStopped) {
        // Stopped out — return is -stopPct
        const ret = -stopPct;
        results[`${h}h`] = {
          exitPrice: stopPrice,
          returnPct: ret,
          stoppedOut: true,
          stoppedAtHour,
        };
      } else {
        // Find closing price at target hour
        const targetTs = new Date(targetTime).toISOString().slice(0, 13) + ':00:00Z';
        let exitPrice = entryPrice;
        for (const c of candles) {
          const cTs = new Date(c.t).toISOString().slice(0, 13) + ':00:00Z';
          if (cTs === targetTs) { exitPrice = parseFloat(c.c); break; }
        }
        
        const rawRet = (exitPrice - entryPrice) / entryPrice;
        const ret = momentumDir === 'short' ? -rawRet : rawRet;
        
        results[`${h}h`] = {
          exitPrice,
          returnPct: ret,
          stoppedOut: false,
        };
      }
    }
    
    trades.push({
      coin: event.coin, timestamp: event.timestamp, regime: event.regime,
      fundingRate: event.fundingRate, momentumDir, entryPrice,
      stopLevel: stopPrice, stopPct, results,
    });
  }
  
  console.log(`Simulated ${trades.length} trades with stops\n`);
  
  // Aggregate results
  console.log('='.repeat(70));
  console.log('BACKTEST 3: Momentum + Stop-Loss Overlay');
  console.log('='.repeat(70));
  console.log(`Stops: CHOPPY=2%, TRENDING_DOWN/VOLATILE=3%, TRENDING_UP=4%\n`);
  
  // Overall
  console.log('--- OVERALL ---');
  for (const h of HOLD_WINDOWS) {
    const wk = `${h}h`;
    const relevant = trades.filter(t => t.results[wk]);
    const returns = relevant.map(t => t.results[wk].returnPct);
    const stopped = relevant.filter(t => t.results[wk].stoppedOut).length;
    const survived = relevant.length - stopped;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const winRate = returns.filter(r => r > 0).length / returns.length;
    const winners = returns.filter(r => r > 0);
    const losers = returns.filter(r => r <= 0);
    const avgWin = winners.length > 0 ? winners.reduce((a, b) => a + b, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((a, b) => a + b, 0) / losers.length : 0;
    const cumReturn = returns.reduce((a, b) => a + b, 0);
    
    console.log(`  ${wk}: mean=${(mean*100).toFixed(3)}%, winRate=${(winRate*100).toFixed(1)}%, survived=${survived}/${relevant.length} (${(survived/relevant.length*100).toFixed(0)}%), cumReturn=${(cumReturn*100).toFixed(1)}%`);
    console.log(`        avgWin=${(avgWin*100).toFixed(3)}%, avgLoss=${(avgLoss*100).toFixed(3)}%, stopped=${stopped}`);
  }
  
  // By regime
  console.log('\n--- BY REGIME ---');
  const regimes = [...new Set(trades.map(t => t.regime))];
  for (const regime of regimes) {
    const regimeTrades = trades.filter(t => t.regime === regime);
    console.log(`\n  ${regime} (n=${regimeTrades.length}, stop=${((REGIME_STOPS[regime] || 0.03)*100)}%):`);
    for (const h of HOLD_WINDOWS) {
      const wk = `${h}h`;
      const relevant = regimeTrades.filter(t => t.results[wk]);
      if (relevant.length === 0) continue;
      const returns = relevant.map(t => t.results[wk].returnPct);
      const stopped = relevant.filter(t => t.results[wk].stoppedOut).length;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const winRate = returns.filter(r => r > 0).length / returns.length;
      const cumReturn = returns.reduce((a, b) => a + b, 0);
      console.log(`    ${wk}: mean=${(mean*100).toFixed(3)}%, winRate=${(winRate*100).toFixed(1)}%, survived=${relevant.length-stopped}/${relevant.length}, cumReturn=${(cumReturn*100).toFixed(1)}%`);
    }
  }
  
  // Comparison: with stops vs without stops (from BT2B)
  console.log('\n--- COMPARISON: WITH STOPS vs WITHOUT STOPS ---');
  for (const h of HOLD_WINDOWS) {
    const wk = `${h}h`;
    const withStops = trades.filter(t => t.results[wk]).map(t => t.results[wk].returnPct);
    // Without stops = just momentum returns (same direction, no stop truncation)
    const withoutStops = trades.filter(t => t.results[wk]).map(t => {
      const rawRet = (t.results[wk].exitPrice - t.entryPrice) / t.entryPrice;
      // If stopped, we need the actual exit price at that window instead
      // We can't perfectly reconstruct without stops from stopped trades, so use BT2B overall
      return t.results[wk].stoppedOut ? t.results[wk].returnPct : t.results[wk].returnPct;
    });
    const meanWith = withStops.reduce((a, b) => a + b, 0) / withStops.length;
    console.log(`  ${wk}: withStops=${(meanWith*100).toFixed(3)}%`);
  }
  
  // Save
  const output = {
    metadata: {
      source: 'Backtest 2B momentum events, >=100bps, no AZTEC/AXS',
      stops: REGIME_STOPS,
      totalTrades: trades.length,
    },
    trades,
  };
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to ${OUT_FILE}`);
}

main().catch(console.error);
