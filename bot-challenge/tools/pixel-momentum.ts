#!/usr/bin/env npx tsx
/**
 * Pixel Momentum Scanner — Bot Challenge Tool
 * 
 * Pure momentum/trend following using HyperLiquid candle data.
 * Ported from strategy_enhanced.py regime detection + SMA cross logic.
 * 
 * Detects:
 * - Regime: TRENDING / CHOPPY / VOLATILE (ADX + volatility ratio)
 * - SMA crossovers (13/33 — SI's original strategy)
 * - RSI extremes (overbought >70, oversold <30)
 * - Bollinger Band position
 * 
 * Output: directional signals (LONG/SHORT/FLAT) with confidence to paper-ledger.json
 * 
 * Usage: npx tsx tools/pixel-momentum.ts
 * Cron: :01 (signal tool, before meta-tools)
 */

import * as fs from 'fs';
import * as path from 'path';
import { isClosedPosition } from './lib/closed-position-gate';
import { isBlocked } from './lib/blocklist';

const HL_API = 'https://api.hyperliquid.xyz/info';

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');

const COINS = ['BTC', 'ETH', 'SOL'];
const CANDLE_INTERVAL = '1h';
const CANDLE_LOOKBACK_MS = 72 * 60 * 60 * 1000; // 72h for enough SMA data

// Regime thresholds (from strategy_enhanced.py)
const ADX_TREND_THRESHOLD = 25;
const VOL_RATIO_SPIKE = 1.8;
const MA_CONVERGENCE_PCT = 1.0;

// RSI
const RSI_PERIOD = 14;
const RSI_OVERBOUGHT = 70;
const RSI_OVERSOLD = 30;

// Bollinger
const BB_PERIOD = 20;
const BB_STD_MULT = 2.0;

// SMA
const SMA_FAST = 13;
const SMA_SLOW = 33;

// Confidence
const MIN_CONFIDENCE_TO_SIGNAL = 40;

// ═══ Interfaces ═══

interface Candle {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

interface RegimeData {
  regime: 'TRENDING_LONG' | 'TRENDING_SHORT' | 'CHOPPY' | 'VOLATILE';
  adx: number;
  volRatio: number;
  rsi: number;
  smaFast: number;
  smaSlow: number;
  smaDiffPct: number;
  freshCross: boolean;
  crossDirection: 'UP' | 'DOWN' | 'NONE';
  bbUpper: number;
  bbMid: number;
  bbLower: number;
  price: number;
}

interface BotChallengeSignal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  entryPrice: number;
  regime: string;
  reasoning: string;
  invalidation: string;
  indicators: {
    smaFast: number;
    smaSlow: number;
    rsi: number;
    adx: number;
    volRatio: number;
    bbPosition: number; // 0=lower band, 1=upper band
  };
}

// ═══ HyperLiquid Data ═══

async function fetchCandles(coin: string): Promise<Candle[]> {
  const now = Date.now();
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: {
        coin,
        interval: CANDLE_INTERVAL,
        startTime: now - CANDLE_LOOKBACK_MS,
        endTime: now,
      },
    }),
  });

  if (!res.ok) throw new Error(`HyperLiquid candles for ${coin}: ${res.status}`);
  const raw: any[] = await res.json() as any[];

  return raw.map(c => ({
    t: c.t || 0,
    o: parseFloat(c.o || c.open || '0'),
    h: parseFloat(c.h || c.high || '0'),
    l: parseFloat(c.l || c.low || '0'),
    c: parseFloat(c.c || c.close || '0'),
    v: parseFloat(c.v || c.volume || '0'),
  })).filter(c => c.c > 0);
}

async function fetchCurrentPrice(coin: string): Promise<number> {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  if (!res.ok) return 0;
  const [meta, ctxs]: [any, any[]] = await res.json() as any;
  const idx = meta.universe.findIndex((u: any) => u.name === coin);
  if (idx < 0) return 0;
  return parseFloat(ctxs[idx]?.markPx || '0');
}

// ═══ Technical Indicators ═══

function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

function ema(values: number[], period: number): number[] {
  const result: number[] = [];
  const alpha = 1 / period;
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      // Use SMA for initial value
      if (i === period - 1) {
        prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
        result.push(prev);
      } else {
        result.push(NaN);
      }
    } else {
      prev = alpha * values[i] + (1 - alpha) * prev;
      result.push(prev);
    }
  }
  return result;
}

function computeRSI(closes: number[], period: number = RSI_PERIOD): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
      rsi.push(50);
      continue;
    }
    const delta = closes[i] - closes[i - 1];
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);

    if (i < period) {
      rsi.push(50);
      continue;
    }

    if (i === period) {
      const avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    } else {
      // Wilder smoothing
      const prevRSI = rsi[rsi.length - 1];
      const prevAvgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const prevAvgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const avgGain = (prevAvgGain * (period - 1) + gains[i]) / period;
      const avgLoss = (prevAvgLoss * (period - 1) + losses[i]) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  return rsi;
}

function computeADX(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const adx: number[] = new Array(closes.length).fill(15);

  if (closes.length < period * 2) return adx;

  // True Range + Directional Movement
  const tr: number[] = [0];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];

  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));

    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smoothed TR, +DM, -DM (Wilder's method)
  const smoothTR = ema(tr, period);
  const smoothPlusDM = ema(plusDM, period);
  const smoothMinusDM = ema(minusDM, period);

  for (let i = period; i < closes.length; i++) {
    const atr = smoothTR[i] || 1;
    const pdi = 100 * (smoothPlusDM[i] || 0) / atr;
    const mdi = 100 * (smoothMinusDM[i] || 0) / atr;
    const dx = (pdi + mdi) === 0 ? 0 : 100 * Math.abs(pdi - mdi) / (pdi + mdi);
    adx[i] = dx; // Simplified — using DX directly as ADX proxy
  }

  // Smooth ADX itself
  const smoothedADX = ema(adx, period);
  for (let i = period * 2; i < closes.length; i++) {
    if (!isNaN(smoothedADX[i])) adx[i] = smoothedADX[i];
  }

  return adx;
}

function computeBollinger(closes: number[], period: number = BB_PERIOD, mult: number = BB_STD_MULT) {
  const mid = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1 || isNaN(mid[i])) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }

  return { upper, mid, lower };
}

// ═══ Regime Detection ═══

function analyzeRegime(candles: Candle[]): RegimeData {
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  const n = closes.length;

  // SMA 13/33
  const sma13 = sma(closes, SMA_FAST);
  const sma33 = sma(closes, SMA_SLOW);
  const currentSmaFast = sma13[n - 1];
  const currentSmaSlow = sma33[n - 1];
  const smaDiffPct = currentSmaSlow > 0 ? ((currentSmaFast - currentSmaSlow) / currentSmaSlow) * 100 : 0;

  // Fresh cross detection (last 4 candles)
  let freshCross = false;
  let crossDirection: 'UP' | 'DOWN' | 'NONE' = 'NONE';
  if (n >= SMA_SLOW + 4) {
    const nowAbove = sma13[n - 1] > sma33[n - 1];
    const wasAbove = sma13[n - 4] > sma33[n - 4];
    if (nowAbove && !wasAbove) { freshCross = true; crossDirection = 'UP'; }
    if (!nowAbove && wasAbove) { freshCross = true; crossDirection = 'DOWN'; }
  }

  // RSI
  const rsiValues = computeRSI(closes, RSI_PERIOD);
  const rsi = rsiValues[n - 1];

  // ADX
  const adxValues = computeADX(highs, lows, closes);
  const adx = adxValues[n - 1];

  // Volatility ratio (last 10 vs last 40 candles)
  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
  const recentReturns = returns.slice(-10);
  const longReturns = returns.slice(-40);
  const recentVol = Math.sqrt(recentReturns.reduce((s, r) => s + r * r, 0) / recentReturns.length);
  const longVol = Math.sqrt(longReturns.reduce((s, r) => s + r * r, 0) / longReturns.length);
  const volRatio = longVol > 0 ? recentVol / longVol : 1.0;

  // Bollinger
  const bb = computeBollinger(closes);
  const bbUpper = bb.upper[n - 1];
  const bbMid = bb.mid[n - 1];
  const bbLower = bb.lower[n - 1];

  const price = closes[n - 1];

  // Regime classification (from strategy_enhanced.py)
  let regime: RegimeData['regime'];
  if (volRatio > VOL_RATIO_SPIKE) {
    regime = 'VOLATILE';
  } else if (Math.abs(smaDiffPct) >= MA_CONVERGENCE_PCT && adx >= ADX_TREND_THRESHOLD) {
    regime = currentSmaFast > currentSmaSlow ? 'TRENDING_LONG' : 'TRENDING_SHORT';
  } else {
    regime = 'CHOPPY';
  }

  return {
    regime, adx, volRatio, rsi,
    smaFast: currentSmaFast, smaSlow: currentSmaSlow, smaDiffPct,
    freshCross, crossDirection,
    bbUpper, bbMid, bbLower, price,
  };
}

// ═══ Confidence Scoring (from strategy_enhanced.py) ═══

function scoreConfidence(data: RegimeData, direction: 'LONG' | 'SHORT'): number {
  let score = 0;

  // 1. ADX strength (0-20)
  if (data.adx >= 40) score += 20;
  else if (data.adx >= 25) score += 10 + ((data.adx - 25) / 15) * 10;
  else score += (data.adx / 25) * 10;

  // 2. RSI alignment (0-20)
  if (direction === 'SHORT') {
    if (data.rsi > 65) score += 20;
    else if (data.rsi > 50) score += 12;
    else if (data.rsi > 35) score += 6;
  } else {
    if (data.rsi < 35) score += 20;
    else if (data.rsi < 50) score += 12;
    else if (data.rsi < 65) score += 6;
  }

  // 3. BB position (0-20)
  const bbRange = (data.bbUpper - data.bbLower) || 1;
  const bbPct = (data.price - data.bbLower) / bbRange;
  if (direction === 'SHORT') score += Math.min(20, bbPct * 20);
  else score += Math.min(20, (1 - bbPct) * 20);

  // 4. MA separation (0-20)
  const maDiff = Math.abs(data.smaDiffPct);
  if (maDiff >= 3.0) score += 20;
  else if (maDiff >= 1.5) score += 10 + ((maDiff - 1.5) / 1.5) * 10;
  else score += (maDiff / 1.5) * 10;

  // 5. Volatility (0-20)
  if (data.volRatio >= 0.8 && data.volRatio <= 1.3) score += 20;
  else if (data.volRatio >= 0.5 && data.volRatio <= 1.8) score += 12;
  else score += 4;

  // Bonus: fresh cross
  if (data.freshCross) score += 10;

  return Math.min(Math.round(score), 100);
}

// ═══ RSI/BB Entry Filter (from strategy_enhanced.py) ═══

function shouldEnter(data: RegimeData, direction: 'LONG' | 'SHORT'): { ok: boolean; reason: string } {
  if (direction === 'SHORT') {
    if (data.rsi < RSI_OVERSOLD) return { ok: false, reason: `RSI oversold (${data.rsi.toFixed(1)}) — bounce likely` };
    if (data.price < data.bbLower) return { ok: false, reason: `Price below lower BB — stretched` };
  } else {
    if (data.rsi > RSI_OVERBOUGHT) return { ok: false, reason: `RSI overbought (${data.rsi.toFixed(1)}) — pullback likely` };
    if (data.price > data.bbUpper) return { ok: false, reason: `Price above upper BB — stretched` };
  }
  return { ok: true, reason: 'Filters passed' };
}

// ═══ Main ═══

interface PaperLedgerEntry {
  signals: any[];
  lastScanAt: string;
  totalScans: number;
}

async function main() {
  console.log('📈 Pixel Momentum Scanner — scanning HyperLiquid...\n');

  const signals: BotChallengeSignal[] = [];

  for (const coin of COINS) {
    try {
      const candles = await fetchCandles(coin);
      if (candles.length < SMA_SLOW + 5) {
        console.log(`⚠️ ${coin}: not enough candles (${candles.length}). Skipping.`);
        continue;
      }

      const data = analyzeRegime(candles);
      const bbRange = (data.bbUpper - data.bbLower) || 1;
      const bbPosition = (data.price - data.bbLower) / bbRange;

      // Print regime
      const regimeIcon = data.regime.startsWith('TRENDING') ? '📈' :
                         data.regime === 'VOLATILE' ? '⚡' : '📊';
      console.log(`${regimeIcon} ${coin} — ${data.regime}`);
      console.log(`   Price: $${data.price.toFixed(2)} | SMA13: $${data.smaFast.toFixed(2)} | SMA33: $${data.smaSlow.toFixed(2)}`);
      console.log(`   RSI: ${data.rsi.toFixed(1)} | ADX: ${data.adx.toFixed(1)} | Vol ratio: ${data.volRatio.toFixed(2)}`);
      console.log(`   BB: [${data.bbLower.toFixed(2)} — ${data.bbMid.toFixed(2)} — ${data.bbUpper.toFixed(2)}]`);
      if (data.freshCross) console.log(`   🔀 FRESH SMA CROSS: ${data.crossDirection}`);

      // Generate signal based on regime
      if (data.regime === 'VOLATILE') {
        console.log(`   → FLAT (volatile regime — stay out)\n`);
        continue;
      }

      if (data.regime === 'CHOPPY') {
        console.log(`   → FLAT (choppy — no trend)\n`);
        continue;
      }

      // Trending — determine direction
      const direction: 'LONG' | 'SHORT' = data.regime === 'TRENDING_LONG' ? 'LONG' : 'SHORT';

      // Closed position gate (Oracle directive 2026-02-26)
      if (isClosedPosition(coin, direction)) {
        console.log(`   🚫 ${coin} ${direction} — BLOCKED by closed position gate\n`);
        continue;
      }

      // Entry filter
      const filter = shouldEnter(data, direction);
      if (!filter.ok) {
        console.log(`   → ${direction} signal FILTERED: ${filter.reason}\n`);
        continue;
      }

      // Confidence score
      const confidenceScore = scoreConfidence(data, direction);
      if (confidenceScore < MIN_CONFIDENCE_TO_SIGNAL) {
        console.log(`   → ${direction} signal LOW CONFIDENCE: ${confidenceScore}/100 (min: ${MIN_CONFIDENCE_TO_SIGNAL})\n`);
        continue;
      }

      const confidenceLabel = confidenceScore >= 70 ? 'high' : confidenceScore >= 55 ? 'medium' : 'low';

      // Build reasoning
      const parts: string[] = [];
      parts.push(`${coin} in ${data.regime} regime (ADX: ${data.adx.toFixed(1)}, MA diff: ${data.smaDiffPct.toFixed(2)}%)`);
      parts.push(`SMA13 ${data.smaFast > data.smaSlow ? 'above' : 'below'} SMA33`);
      if (data.freshCross) parts.push(`Fresh ${data.crossDirection} cross detected`);
      parts.push(`RSI: ${data.rsi.toFixed(1)}, BB position: ${(bbPosition * 100).toFixed(0)}%`);
      parts.push(`Vol ratio: ${data.volRatio.toFixed(2)} (${data.volRatio < 1.3 ? 'normal' : 'elevated'})`);

      const invalidation = direction === 'LONG'
        ? `SMA13 crosses below SMA33 or RSI > ${RSI_OVERBOUGHT}`
        : `SMA13 crosses above SMA33 or RSI < ${RSI_OVERSOLD}`;

      const signal: BotChallengeSignal = {
        tool: 'pixel-momentum',
        timestamp: new Date().toISOString(),
        unixMs: Date.now(),
        coin,
        direction,
        confidence: confidenceLabel,
        confidenceScore,
        entryPrice: data.price,
        regime: data.regime,
        reasoning: parts.join('. ') + '.',
        invalidation,
        indicators: {
          smaFast: data.smaFast,
          smaSlow: data.smaSlow,
          rsi: data.rsi,
          adx: data.adx,
          volRatio: data.volRatio,
          bbPosition,
        },
      };

      signals.push(signal);

      const icon = confidenceLabel === 'high' ? '🔴' : confidenceLabel === 'medium' ? '🟡' : '⚪';
      console.log(`   ${icon} → ${direction} | Confidence: ${confidenceScore}/100 (${confidenceLabel})`);
      console.log(`   ${parts[0]}\n`);

      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    } catch (err: any) {
      console.log(`⚠️ ${coin}: ${err.message}\n`);
    }
  }

  // Append to paper ledger
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    ledger = { signals: [], lastScanAt: '', totalScans: 0 };
  }

  // Filter out blocked/cooldown coins
  const filtered = signals.filter(s => {
    const check = isBlocked(s.coin);
    if (check.blocked) {
      console.log(`🚫 ${s.coin} — ${check.reason}`);
      return false;
    }
    return true;
  });

  ledger.signals.push(...filtered);
  ledger.lastScanAt = new Date().toISOString();
  ledger.totalScans++;

  const resultsDir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');

  console.log(`✅ Logged ${filtered.length} signals to paper-ledger.json (${signals.length - filtered.length} blocked) (total: ${ledger.signals.length} signals, ${ledger.totalScans} scans)`);

  // Save daily report
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `pixel-momentum-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date,
    scannedAt: new Date().toISOString(),
    coinsScanned: COINS.length,
    signalCount: signals.length,
    signals,
  }, null, 2), 'utf-8');

  console.log(`📊 Daily report saved to reports/pixel-momentum-${date}.json`);
}

main().catch(err => {
  console.error('❌ Pixel momentum scan failed:', err.message);
  process.exit(1);
});
