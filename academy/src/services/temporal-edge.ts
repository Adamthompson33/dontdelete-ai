/**
 * TemporalEdgeScanner — Jackbot's Tool
 * 
 * Detects temporal patterns in crypto markets:
 * 1. Funding rate reset windows — price moves around HyperLiquid hourly resets
 * 2. Regime detection — ADX + volatility ratio classifies TRENDING/CHOPPY/VOLATILE
 * 3. Session timing — Asian open, US open, weekly close patterns
 * 
 * This is a SCANNER, not an executor. It emits signals to the Signal Board.
 * Execution happens later when the desk trades real capital.
 * 
 * HyperLiquid settles funding every hour (not 8h like CEXs).
 * Price action in the 30-60 min before/after resets creates temporal edges.
 * 
 * No wallet. No auth. No execution. Just pattern detection.
 */

import * as fs from 'fs';
import * as path from 'path';

const HL_API = 'https://api.hyperliquid.xyz/info';

// ═══ Interfaces ═══

export interface TemporalSignal {
  coin: string;
  pattern: 'funding_reset' | 'regime_shift' | 'session_edge';
  direction: 'long' | 'short' | 'flat';
  confidence: number;          // 0-1
  kelly_size: number;          // fraction of portfolio
  invalidation: string;
  reasoning: string;
  data: {
    fundingRate?: number;
    annualizedRate?: number;
    minutesToReset?: number;
    regime?: string;
    markPrice?: number;
    oraclePrice?: number;
    premium?: number;
    priceChange24h?: number;
    session?: string;
  };
}

export interface RegimeState {
  regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'CHOPPY' | 'VOLATILE';
  adx: number;              // 0-100, >25 = trending
  volatilityRatio: number;  // current vol / avg vol
  priceChange1h: number;
  priceChange24h: number;
}

export interface TemporalScanResult {
  scannedAt: string;
  signals: TemporalSignal[];
  regimes: Record<string, RegimeState>;
  regimeParams: RegimeParams;  // Stage 2: risk params for current BTC regime
  nextResetMinutes: number;
  session: string;
}

// ═══ Regime Risk Parameters (Oracle directive 2026-02-24) ═══
// Stop-loss, position size multiplier, and max hold time per regime.
// These constrain downstream scanners (Rei, etc.) based on market conditions.

export interface RegimeParams {
  stop: number;      // stop-loss percentage (e.g., 0.02 = 2%)
  size: number;      // position size multiplier (1.0 = full, 0.25 = quarter) — default for direction
  sizeLong?: number;  // override size for LONG positions (Oracle directive 2026-02-27)
  sizeShort?: number; // override size for SHORT positions
  maxHold: number;   // max hold time in hours
  longRequiresSentry?: boolean; // if true, longs need Sentry approval (Oracle directive 2026-02-27)
}

export const REGIME_PARAMS: Record<string, RegimeParams> = {
  CHOPPY:        { stop: 0.02, size: 0.25, maxHold: 4 },
  TRENDING_DOWN: { stop: 0.03, size: 0.75, sizeLong: 0.25, sizeShort: 0.75, maxHold: 12, longRequiresSentry: true },
  TRENDING_UP:   { stop: 0.04, size: 0.75, maxHold: 18 },
  VOLATILE:      { stop: 0.03, size: 0.50, maxHold: 8 },
};

// Default params if regime unknown
export const DEFAULT_REGIME_PARAMS: RegimeParams = { stop: 0.03, size: 0.50, maxHold: 8 };

// ═══ Constants ═══

// Funding extremes that matter near reset windows
const EXTREME_FUNDING_APR = 50;     // 50% annualized = interesting
const VERY_EXTREME_FUNDING_APR = 100; // 100%+ = high conviction
const RESET_WINDOW_MINUTES = 45;    // 45 min before hourly reset (expanded from 30 per Oracle)

// Regime thresholds
const ADX_TRENDING = 25;            // ADX > 25 = trending market
const VOL_RATIO_HIGH = 1.5;         // Current vol > 1.5x average = volatile

// Session boundaries (UTC hours)
const SESSIONS: Record<string, { start: number; end: number; name: string }> = {
  asian:  { start: 0,  end: 8,  name: 'Asian session' },
  europe: { start: 8,  end: 16, name: 'European session' },
  us:     { start: 14, end: 22, name: 'US session' },
};

// Coins to scan for temporal patterns
const TEMPORAL_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'ARB', 'OP', 'AVAX', 'LINK', 'WIF', 'INJ'];

const REPORTS_DIR = path.join(__dirname, '..', '..', 'temporal-reports');

// ═══ Scanner ═══

export class TemporalEdgeScanner {

  /**
   * Run full temporal scan — funding resets + regime detection + session timing
   */
  async scan(): Promise<TemporalScanResult> {
    const now = new Date();
    const signals: TemporalSignal[] = [];

    // Get HyperLiquid data
    const [metaData, recentCandles] = await Promise.all([
      this.getMetaAndAssets(),
      this.getRecentCandles('BTC'),  // BTC as regime proxy
    ]);

    const [meta, assetCtxs] = metaData;

    // Calculate minutes to next hourly reset
    const minutesToReset = 60 - now.getUTCMinutes();
    const inResetWindow = minutesToReset <= RESET_WINDOW_MINUTES || now.getUTCMinutes() < 5;

    // Determine current session
    const currentSession = this.getCurrentSession(now);

    // Calculate BTC regime from candles
    const btcRegime = this.calculateRegime(recentCandles);
    const regimes: Record<string, RegimeState> = { BTC: btcRegime };

    // Scan each coin for temporal patterns
    for (let i = 0; i < meta.universe.length; i++) {
      const coin = meta.universe[i].name;
      if (!TEMPORAL_COINS.includes(coin)) continue;

      const ctx = assetCtxs[i];
      if (!ctx) continue;

      const markPrice = parseFloat(ctx.markPx || '0');
      const oraclePrice = parseFloat(ctx.oraclePx || '0');
      const hourlyRate = parseFloat(ctx.funding || '0');
      const annualizedRate = hourlyRate * 24 * 365 * 100;
      const premium = oraclePrice > 0 ? ((markPrice - oraclePrice) / oraclePrice) * 100 : 0;
      const prevDayPx = parseFloat(ctx.prevDayPx || '0');
      const priceChange24h = prevDayPx > 0 ? ((markPrice - prevDayPx) / prevDayPx) * 100 : 0;

      // ═══ Pattern 1: Funding Reset Edge ═══
      // When funding is extreme AND we're near an hourly reset, price tends to mean-revert
      // after the reset as the funding pressure releases
      if (inResetWindow && Math.abs(annualizedRate) > EXTREME_FUNDING_APR) {
        const isVeryExtreme = Math.abs(annualizedRate) > VERY_EXTREME_FUNDING_APR;

        // Extreme positive funding (longs pay) → price tends to dip after reset → short bias
        // Extreme negative funding (shorts pay) → price tends to pop after reset → long bias
        const direction: 'long' | 'short' = hourlyRate > 0 ? 'short' : 'long';

        // Confidence scales with how extreme the funding is
        const fundingMagnitude = Math.min(Math.abs(annualizedRate) / 200, 1); // 0-1 scale
        const windowProximity = minutesToReset <= 10 ? 1.0 : minutesToReset <= 20 ? 0.8 : 0.6;
        const baseConfidence = 0.5 + (fundingMagnitude * 0.3) + (windowProximity * 0.1);
        const confidence = Math.min(0.85, baseConfidence);

        // Kelly sizing — conservative, 5-12% based on confidence
        const kelly = confidence > 0.7 ? 0.12 : confidence > 0.6 ? 0.08 : 0.05;

        const invalidation = direction === 'short'
          ? `${coin} breaks above ${(markPrice * 1.02).toFixed(2)} after reset (2% against)`
          : `${coin} breaks below ${(markPrice * 0.98).toFixed(2)} after reset (2% against)`;

        signals.push({
          coin,
          pattern: 'funding_reset',
          direction,
          confidence,
          kelly_size: kelly,
          invalidation,
          reasoning: `${coin} funding at ${annualizedRate.toFixed(0)}% APR with ${minutesToReset}min to hourly reset. ` +
            `${isVeryExtreme ? 'VERY extreme' : 'Extreme'} ${hourlyRate > 0 ? 'positive' : 'negative'} funding ` +
            `suggests ${direction} bias post-reset as funding pressure releases. ` +
            `Premium: ${premium.toFixed(3)}%. Regime: ${btcRegime.regime}.`,
          data: {
            fundingRate: hourlyRate,
            annualizedRate,
            minutesToReset,
            regime: btcRegime.regime,
            markPrice,
            oraclePrice,
            premium,
            priceChange24h,
            session: currentSession,
          },
        });
      }

      // ═══ Pattern 2: Regime Shift Detection ═══
      // When BTC regime shifts (e.g. CHOPPY → TRENDING), other coins often follow
      // with a lag. Detect regime + extreme funding = higher conviction
      if (coin !== 'BTC' && Math.abs(annualizedRate) > EXTREME_FUNDING_APR) {
        if ((btcRegime.regime === 'TRENDING_UP' || btcRegime.regime === 'TRENDING_DOWN') && Math.abs(btcRegime.priceChange24h) > 3) {
          // BTC trending + altcoin has extreme funding = directional edge
          const btcDirection = btcRegime.priceChange24h > 0 ? 'long' : 'short';
          const fundingAligned = (btcDirection === 'long' && hourlyRate < 0) ||
                                 (btcDirection === 'short' && hourlyRate > 0);

          if (fundingAligned) {
            // Funding is paying you to trade with the trend — high conviction
            signals.push({
              coin,
              pattern: 'regime_shift',
              direction: btcDirection,
              confidence: 0.7,
              kelly_size: 0.10,
              invalidation: `BTC regime shifts to CHOPPY or ${coin} funding normalizes below 20% APR`,
              reasoning: `BTC trending ${btcDirection} (${btcRegime.priceChange24h.toFixed(1)}% 24h) while ${coin} ` +
                `funding is ${annualizedRate.toFixed(0)}% APR — you get PAID to ride the trend. ` +
                `Regime: ${btcRegime.regime}, ADX: ${btcRegime.adx.toFixed(0)}.`,
              data: {
                fundingRate: hourlyRate,
                annualizedRate,
                regime: btcRegime.regime,
                markPrice,
                priceChange24h,
                session: currentSession,
              },
            });
          }
        }
      }
    }

    // ═══ Pattern 3: Session Edge — Dead Zone Detection ═══
    // If we're in a low-activity window (late Asian, pre-US) with extreme funding,
    // the reset edge is amplified because there's less liquidity to absorb it
    if (currentSession === 'dead_zone') {
      for (const sig of signals) {
        if (sig.pattern === 'funding_reset') {
          sig.confidence = Math.min(0.9, sig.confidence + 0.05);
          sig.reasoning += ' Session: dead zone (low liquidity amplifies funding reset impact).';
          sig.data.session = 'dead_zone';
        }
      }
    }

    // Compute regime params for current BTC regime (Stage 2)
    const currentRegime = regimes['BTC']?.regime || 'VOLATILE';
    const regimeParams = REGIME_PARAMS[currentRegime] || DEFAULT_REGIME_PARAMS;

    // Save report
    this.saveReport({ scannedAt: now.toISOString(), signals, regimes, regimeParams, nextResetMinutes: minutesToReset, session: currentSession });

    return {
      scannedAt: now.toISOString(),
      signals,
      regimes,
      regimeParams,
      nextResetMinutes: minutesToReset,
      session: currentSession,
    };
  }

  /**
   * Format scan results for Jackbot's briefing
   */
  formatForBriefing(result: TemporalScanResult): string {
    let output = `\n\n[TEMPORAL EDGE SCANNER — Jackbot's Tool]\n`;
    output += `Session: ${result.session} | Next funding reset: ${result.nextResetMinutes}min\n`;

    const btcRegime = result.regimes['BTC'];
    if (btcRegime) {
      output += `BTC regime: ${btcRegime.regime} (ADX: ${btcRegime.adx.toFixed(0)}, Vol ratio: ${btcRegime.volatilityRatio.toFixed(2)})\n`;
    }

    if (result.signals.length === 0) {
      output += `No temporal edge signals detected this scan.\n`;
    } else {
      output += `\nSignals:\n`;
      for (const sig of result.signals) {
        output += `  ${sig.direction.toUpperCase()} ${sig.coin} (${sig.pattern}) — ${(sig.confidence * 100).toFixed(0)}% conf, ${(sig.kelly_size * 100).toFixed(0)}% Kelly\n`;
        output += `    ${sig.reasoning.slice(0, 150)}\n`;
      }
    }

    return output;
  }

  // ═══ Internal Methods ═══

  private async getMetaAndAssets(): Promise<[any, any[]]> {
    const res = await fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (!res.ok) throw new Error(`HyperLiquid meta: ${res.status}`);
    return await res.json() as [any, any[]];
  }

  private async getRecentCandles(coin: string): Promise<any[]> {
    try {
      const now = Date.now();
      const res = await fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: {
            coin,
            interval: '1h',
            startTime: now - 24 * 60 * 60 * 1000, // last 24h
            endTime: now,
          },
        }),
      });
      if (!res.ok) return [];
      return await res.json() as any[];
    } catch {
      return [];
    }
  }

  /**
   * Simple regime detection from 1h candles
   * ADX approximation + volatility ratio
   */
  private calculateRegime(candles: any[]): RegimeState {
    if (candles.length < 10) {
      return { regime: 'CHOPPY', adx: 15, volatilityRatio: 1.0, priceChange1h: 0, priceChange24h: 0 };
    }

    // Extract closes
    const closes = candles.map((c: any) => parseFloat(c.c || c.close || '0')).filter(v => v > 0);
    const highs = candles.map((c: any) => parseFloat(c.h || c.high || '0')).filter(v => v > 0);
    const lows = candles.map((c: any) => parseFloat(c.l || c.low || '0')).filter(v => v > 0);

    if (closes.length < 10) {
      return { regime: 'CHOPPY', adx: 15, volatilityRatio: 1.0, priceChange1h: 0, priceChange24h: 0 };
    }

    // Price changes
    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const firstClose = closes[0];
    const priceChange1h = prevClose > 0 ? ((lastClose - prevClose) / prevClose) * 100 : 0;
    const priceChange24h = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;

    // ADX approximation: measure directional movement
    // Simplified: average absolute hourly returns vs net return
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const avgAbsReturn = returns.reduce((s, r) => s + Math.abs(r), 0) / returns.length;
    const netReturn = Math.abs(returns.reduce((s, r) => s + r, 0));
    const efficiency = avgAbsReturn > 0 ? netReturn / (avgAbsReturn * returns.length) : 0;
    // Scale efficiency to ADX-like 0-100
    const adx = efficiency * 100;

    // Volatility ratio: recent 6h vol vs full 24h average
    const recentReturns = returns.slice(-6);
    const recentVol = Math.sqrt(recentReturns.reduce((s, r) => s + r * r, 0) / recentReturns.length);
    const fullVol = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length);
    const volatilityRatio = fullVol > 0 ? recentVol / fullVol : 1.0;

    // Classify regime (Oracle spec 2026-02-24: split TRENDING into UP/DOWN)
    let regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'CHOPPY' | 'VOLATILE';
    if (adx > ADX_TRENDING && volatilityRatio < VOL_RATIO_HIGH) {
      regime = priceChange24h >= 0 ? 'TRENDING_UP' : 'TRENDING_DOWN';
    } else if (volatilityRatio > VOL_RATIO_HIGH) {
      regime = 'VOLATILE';
    } else {
      regime = 'CHOPPY';
    }

    return { regime, adx, volatilityRatio, priceChange1h, priceChange24h };
  }

  private getCurrentSession(now: Date): string {
    const hour = now.getUTCHours();

    // Check for session overlaps
    if (hour >= 14 && hour < 16) return 'us_europe_overlap';
    if (hour >= 0 && hour < 8) return 'asian';
    if (hour >= 8 && hour < 14) return 'european';
    if (hour >= 16 && hour < 22) return 'us';

    // Dead zone: 22:00-00:00 UTC
    return 'dead_zone';
  }

  private saveReport(result: TemporalScanResult): void {
    try {
      if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);
      const file = path.join(REPORTS_DIR, `${date}.json`);
      fs.writeFileSync(file, JSON.stringify(result, null, 2));
    } catch (e: any) {
      console.warn(`Failed to save temporal report: ${e.message}`);
    }
  }
}

// ═══ Quick test ═══
if (require.main === module) {
  (async () => {
    const scanner = new TemporalEdgeScanner();
    console.log('═══ Temporal Edge Scanner Test ═══\n');

    const result = await scanner.scan();

    console.log(`Session: ${result.session}`);
    console.log(`Next funding reset: ${result.nextResetMinutes}min`);
    console.log(`BTC regime: ${result.regimes['BTC']?.regime} (ADX: ${result.regimes['BTC']?.adx.toFixed(1)})`);
    console.log(`Signals: ${result.signals.length}\n`);

    for (const sig of result.signals) {
      console.log(`📡 ${sig.direction.toUpperCase()} ${sig.coin} (${sig.pattern})`);
      console.log(`   Confidence: ${(sig.confidence * 100).toFixed(0)}% | Kelly: ${(sig.kelly_size * 100).toFixed(0)}%`);
      console.log(`   ${sig.reasoning.slice(0, 120)}`);
      console.log(`   Invalidation: ${sig.invalidation}\n`);
    }

    console.log('\n═══ Briefing Format ═══');
    console.log(scanner.formatForBriefing(result));
  })().catch(console.error);
}
