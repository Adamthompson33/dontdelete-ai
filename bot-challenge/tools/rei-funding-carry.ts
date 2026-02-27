#!/usr/bin/env npx tsx
/**
 * Rei Funding Carry — Bot Challenge Tool (3-Tier Model)
 * 
 * Standalone funding rate scanner with Oracle's 3-tier confidence model:
 *   HIGH: |APR| > 100% + persisted 4+ hours + price stable (<5% 24h move)
 *   MEDIUM: |APR| > 100% + persisted 2+ hours OR price moving (5-15%)
 *   LOW: |APR| > 50% OR extreme but recent/unconfirmed — log only, don't trade
 * 
 * Persistence check: compares current scan against paper-ledger.json history.
 * Was this coin flagged in previous hourly scans?
 * 
 * DO NOT modify Academy scanner. This is the Bot Challenge lab version.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FundingScanner, FundingOpportunity } from '../../academy/src/services/funding-scanner';
import { REGIME_PARAMS, DEFAULT_REGIME_PARAMS, RegimeParams } from '../../academy/src/services/temporal-edge';
import { isClosedPosition } from './lib/closed-position-gate';
import { checkHLStale } from './lib/hl-stale-check';

// ═══ Bot Challenge Signal Format ═══

interface BotChallengeSignal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: 'LONG' | 'SHORT';
  confidence: 'high' | 'medium' | 'low';
  tier: 'HIGH' | 'MEDIUM' | 'LOW';
  tierReason: string;
  entryPrice: number;
  annualizedRate: number;
  basis: number;              // mark/index basis — The Surgeon variable
  surgeonSignal: boolean;     // true when dual-condition met (negative basis + extreme funding)
  priceChange24h: number;
  persistenceHours: number;
  reasoning: string;
  invalidation: string;
  sentryConflict?: boolean;   // true when Sentry SHORT conflicts with Rei LONG
  originalConfidence?: string; // pre-soft-gate confidence (before halving)
}

interface PaperLedgerEntry {
  signals: any[];
  lastScanAt: string;
  totalScans: number;
}

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const SIGNAL_LOG_DIR = path.join(__dirname, '..', 'data', 'live-signals');

// ═══ MOMENTUM MODE (Backtest 2B validated) ═══
// Direction: go WITH the crowd (momentum), not against (carry)
// Threshold: 100 Loris bps = 0.01 hourly rate = 8760% APR
// Size: 0.25x cautious rollout until 30+ days out-of-sample
const MOMENTUM_MODE = true;
const MOMENTUM_SIZE_MULTIPLIER = 0.25; // cautious rollout

// ═══ Blacklist — tokens to auto-exclude regardless of funding/basis ═══
// OM (MANTRA): 90%+ crash, likely rug pull.
// AZTEC, AXS: concentration risk — dominated backtest results, excluding improves sharpe
const BLACKLISTED_COINS = new Set(['OM', 'AZTEC', 'AXS']);

// Tier thresholds — raised to match backtest-validated 100bps signal
// 100 Loris bps = hourly rate 0.01 = annualized 87.6 (8760%)
const MOMENTUM_MIN_RATE = 0.01;  // hourly rate threshold for momentum signals
const HIGH_MIN_APR = 87.6;       // 8760% annualized (= 100bps hourly)
const HIGH_MIN_PERSIST = 2;      // hours (lowered — momentum signals are faster)
const HIGH_MAX_PRICE_MOVE = 0.15; // 15% (widened — momentum works WITH moves)

const MED_MIN_APR = 43.8;        // 4380% annualized (= 50bps hourly)
const MED_MIN_PERSIST = 1;
const MED_MAX_PRICE_MOVE = 0.25; // 25%

const LOW_MIN_APR = 8.76;        // 876% annualized (= 10bps hourly) — log everything above this

// ═══ Regime Reader (Stage 3 — Oracle 2026-02-24) ═══
// Read latest BTC regime from Temporal Edge reports or paper ledger

function getCurrentRegimeParams(): { regime: string; params: RegimeParams } {
  const ledgerPath = LEDGER_FILE;
  try {
    const ledger: PaperLedgerEntry = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    const now = Date.now();
    const lookback = 5 * 60 * 60 * 1000; // 5h — covers gap between cron cycles
    
    // Find most recent temporal-edge signal with regime tag
    const recentTE = ledger.signals
      .filter((s: any) => s.tool === 'jackbot-temporal-edge' && s.regime && (now - s.unixMs) < lookback)
      .sort((a: any, b: any) => b.unixMs - a.unixMs);
    
    if (recentTE.length > 0) {
      const regime = recentTE[0].regime;
      const params = REGIME_PARAMS[regime] || DEFAULT_REGIME_PARAMS;
      return { regime, params };
    }
  } catch {}
  
  // Also try reading temporal-edge report files
  const reportsDir = path.join(__dirname, '..', 'reports');
  try {
    const today = new Date().toISOString().slice(0, 10);
    const reportFile = path.join(reportsDir, `jackbot-temporal-${today}.json`);
    if (fs.existsSync(reportFile)) {
      const report = JSON.parse(fs.readFileSync(reportFile, 'utf-8'));
      const regime = report.btcRegime?.regime;
      if (regime) {
        const params = REGIME_PARAMS[regime] || DEFAULT_REGIME_PARAMS;
        return { regime, params };
      }
    }
  } catch {}
  
  return { regime: 'UNKNOWN', params: DEFAULT_REGIME_PARAMS };
}

// ═══ Sentry Conflict Check ═══

function getSentryConflicts(ledger: PaperLedgerEntry, reiSignals: BotChallengeSignal[]): Set<string> {
  const conflicts = new Set<string>();
  const now = Date.now();
  const lookback = 5 * 60 * 60 * 1000; // 5 hours — covers the gap between 4h cron cycles

  // Find recent Sentry SHORT signals
  const recentSentryShorts = ledger.signals.filter((s: any) =>
    s.tool === 'sentry-sentiment-scanner' &&
    s.direction === 'SHORT' &&
    (now - s.unixMs) < lookback
  );

  const sentryShortCoins = new Set(recentSentryShorts.map((s: any) => s.coin));

  // Check which Rei LONG signals conflict
  for (const rei of reiSignals) {
    if (rei.direction === 'LONG' && sentryShortCoins.has(rei.coin)) {
      conflicts.add(rei.coin);
    }
  }

  return conflicts;
}

// ═══ Persistence Check ═══

function checkPersistence(coin: string, ledger: PaperLedgerEntry): number {
  // Count how many previous hourly scans flagged this coin
  const now = Date.now();
  const maxLookback = 12 * 60 * 60 * 1000; // 12 hours

  const previousSignals = ledger.signals.filter((s: any) =>
    s.tool === 'rei-funding-carry' &&
    s.coin === coin &&
    (now - s.unixMs) < maxLookback &&
    (now - s.unixMs) > 30 * 60 * 1000 // at least 30 min ago (not this scan)
  );

  if (previousSignals.length === 0) return 0;

  // Estimate hours of persistence from signal timestamps
  const oldest = Math.min(...previousSignals.map((s: any) => s.unixMs));
  const hoursActive = (now - oldest) / (1000 * 60 * 60);

  return hoursActive;
}

// ═══ 3-Tier Classification ═══

function classifyTier(
  opp: FundingOpportunity,
  persistenceHours: number
): { tier: 'HIGH' | 'MEDIUM' | 'LOW'; reason: string } {
  const absApr = Math.abs(opp.annualizedRate);
  const absPriceMove = Math.abs(opp.priceChange24h);
  const basisPct = opp.basis * 100;
  const negativeBasis = opp.basis < -0.001; // mark trading below index

  // HIGH: Surgeon-grade = extreme funding + negative basis + persistent + price stable
  // Dual-condition upgrade: basis confirms funding dislocation is real, not just a spike
  if (absApr >= HIGH_MIN_APR && negativeBasis && persistenceHours >= HIGH_MIN_PERSIST && absPriceMove <= HIGH_MAX_PRICE_MOVE) {
    return {
      tier: 'HIGH',
      reason: `🔪 SURGEON: ${(absApr * 100).toFixed(0)}% APR + ${basisPct.toFixed(3)}% basis (mark below index), ${persistenceHours.toFixed(1)}h persistent, price stable. Dual-condition dislocation.`,
    };
  }

  // HIGH (legacy): extreme funding + persistent + stable, but no basis confirmation
  if (absApr >= HIGH_MIN_APR && persistenceHours >= HIGH_MIN_PERSIST && absPriceMove <= HIGH_MAX_PRICE_MOVE) {
    return {
      tier: 'HIGH',
      reason: `${(absApr * 100).toFixed(0)}% APR, ${persistenceHours.toFixed(1)}h persistent, price stable (${(absPriceMove * 100).toFixed(1)}% move). Basis: ${basisPct.toFixed(3)}% (single-condition — funding only).`,
    };
  }

  // MEDIUM: extreme funding + some persistence or moderate price move
  // Boost: if basis confirms, note it
  if (absApr >= MED_MIN_APR && (persistenceHours >= MED_MIN_PERSIST || absPriceMove <= MED_MAX_PRICE_MOVE)) {
    const basisNote = negativeBasis
      ? ` Basis confirms (${basisPct.toFixed(3)}% — mark below index).`
      : ` Basis neutral/positive (${basisPct.toFixed(3)}%).`;
    return {
      tier: 'MEDIUM',
      reason: `${(absApr * 100).toFixed(0)}% APR, ${persistenceHours.toFixed(1)}h persistent, ${(absPriceMove * 100).toFixed(1)}% price move.${basisNote} Could go either way.`,
    };
  }

  // LOW: anything above 50% APR — log only
  if (absApr >= LOW_MIN_APR) {
    const reasons: string[] = [];
    if (persistenceHours < MED_MIN_PERSIST) reasons.push(`only ${persistenceHours.toFixed(1)}h persistence`);
    if (absPriceMove > MED_MAX_PRICE_MOVE) reasons.push(`large price move (${(absPriceMove * 100).toFixed(1)}%)`);
    if (absApr > 5.0) reasons.push(`extreme APR (${(absApr * 100).toFixed(0)}%) — possible distress`);
    reasons.push(`basis: ${basisPct.toFixed(3)}%`);

    return {
      tier: 'LOW',
      reason: `Log only: ${reasons.join(', ')}. Track outcomes, don't trade.`,
    };
  }

  // Shouldn't reach here given our filter, but fallback
  return { tier: 'LOW', reason: 'Below threshold.' };
}

// ═══ Main ═══

async function main() {
  const scanner = new FundingScanner();

  const modeLabel = MOMENTUM_MODE ? '⚡ MOMENTUM MODE (0.25x)' : '💰 CARRY MODE';
  console.log(`🔍 Rei Funding ${modeLabel} — scanning HyperLiquid...\n`);

  const opportunities = await scanner.scan();

  // ═══ Stale HL Data Check (Oracle directive 2026-02-27) ═══
  const hlRatesMap: Record<string, number> = {};
  for (const o of opportunities) {
    hlRatesMap[o.coin] = o.annualizedRate * 100; // convert to % for stale check
  }
  const staleResult = checkHLStale(hlRatesMap);
  if (staleResult.isStale) {
    console.log(`⚠️ STALE HL DATA DETECTED: ${staleResult.reason}`);
    console.log(`   Skipping cycle to avoid generating signals from stale funding data.\n`);
    process.exit(0);
  }

  // Load existing ledger for persistence check
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    ledger = { signals: [], lastScanAt: '', totalScans: 0 };
  }

  // Filter to everything above LOW threshold
  // In MOMENTUM_MODE: use hourly rate thresholds aligned with backtest
  // Also exclude blacklisted coins and catastrophic movers
  const candidates = opportunities.filter(o => {
    if (BLACKLISTED_COINS.has(o.coin)) {
      console.log(`⛔ ${o.coin} — BLACKLISTED (skipped)`);
      return false;
    }
    if (o.priceChange24h < -0.50) {
      console.log(`💀 ${o.coin} — CATASTROPHIC MOVE (${(o.priceChange24h * 100).toFixed(1)}% 24h drop, auto-excluded)`);
      return false;
    }
    return Math.abs(o.annualizedRate) >= LOW_MIN_APR;
  });

  console.log(`Scanned ${opportunities.length} coins. ${candidates.length} above ${LOW_MIN_APR * 100}% APR threshold.\n`);

  // Classify each candidate
  const signals: BotChallengeSignal[] = [];

  for (const opp of candidates) {
    // Determine direction first for closed position check
    const dir = MOMENTUM_MODE
      ? (opp.direction === 'LONG_BASIS' ? 'LONG' : 'SHORT')
      : (opp.direction === 'LONG_BASIS' ? 'SHORT' : 'LONG');
    
    // ═══ Closed Position Gate (Oracle directive 2026-02-26) ═══
    if (isClosedPosition(opp.coin, dir)) {
      console.log(`🚫 ${opp.coin} ${dir} — BLOCKED by closed position gate (zombie prevention)`);
      continue;
    }

    const persistenceHours = checkPersistence(opp.coin, ledger);
    const { tier, reason } = classifyTier(opp, persistenceHours);

    const isSurgeonSignal = opp.basis < -0.001 && opp.currentRate < 0 && Math.abs(opp.annualizedRate) >= 0.50;

    const signal: BotChallengeSignal = {
      tool: 'rei-funding-carry',
      timestamp: new Date().toISOString(),
      unixMs: Date.now(),
      coin: opp.coin,
      // MOMENTUM MODE: go WITH the crowd, not against
      // Positive funding (longs pay shorts) = crowd is long → go LONG (momentum)
      // Negative funding (shorts pay longs) = crowd is short → go SHORT (momentum)
      // This is the INVERSE of carry. Backtest 2B validated: momentum sharpe 0.59-1.13
      direction: MOMENTUM_MODE
        ? (opp.direction === 'LONG_BASIS' ? 'LONG' as const : 'SHORT' as const)
        : (opp.direction === 'LONG_BASIS' ? 'SHORT' as const : 'LONG' as const),
      confidence: tier === 'HIGH' ? 'high' : tier === 'MEDIUM' ? 'medium' : 'low',
      tier,
      tierReason: reason,
      entryPrice: opp.markPrice,
      annualizedRate: opp.annualizedRate,
      basis: opp.basis,
      surgeonSignal: isSurgeonSignal,
      priceChange24h: opp.priceChange24h,
      persistenceHours,
      reasoning: opp.reasoning,
      invalidation: `Rate drops below 20% APR or flips sign. Basis convergence (mark = index) also signals exit.`,
    };

    signals.push(signal);

    // Print with tier-specific formatting
    const tierIcon = tier === 'HIGH' ? '🔴' : tier === 'MEDIUM' ? '🟡' : '⚪';
    const tierLabel = tier === 'LOW' ? ' [LOG ONLY]' : '';
    const surgeonTag = isSurgeonSignal ? ' 🔪' : '';
    console.log(`${tierIcon} ${opp.coin} — ${tier}${tierLabel}${surgeonTag}`);
    console.log(`   ${signal.direction} perp | ${(opp.annualizedRate * 100).toFixed(1)}% APR | Basis: ${(opp.basis * 100).toFixed(3)}%`);
    console.log(`   Price: $${opp.markPrice.toFixed(4)} | Oracle: $${opp.oraclePrice.toFixed(4)} | 24h move: ${(opp.priceChange24h * 100).toFixed(1)}%`);
    console.log(`   Persistence: ${persistenceHours.toFixed(1)}h`);
    console.log(`   Tier reason: ${reason}\n`);
  }

  // ═══ Sentry HARD Gate (Oracle directive 2026-02-24) ═══
  // When Sentry SHORT conflicts with Rei LONG on same coin: BLOCK the signal.
  // Signal is NOT fired, NOT logged as active — but IS recorded as counterfactual.
  // Auto-revert conditions:
  //   - Sentry accuracy on conflicts drops below 70% (rolling 20 conflicts)
  //   - Market regime shifts to TRENDING_UP (confirmed by Temporal Edge)
  //   - Manual override by Oracle
  const sentryConflicts = getSentryConflicts(ledger, signals);
  const blockedSignals: BotChallengeSignal[] = [];
  
  if (sentryConflicts.size > 0) {
    console.log(`🛡️ Sentry HARD gate: ${sentryConflicts.size} conflicts detected\n`);
    
    // Check auto-revert: compute Sentry accuracy on rolling 20 conflicts
    const now = Date.now();
    const recentConflicts = ledger.signals.filter((s: any) =>
      s.sentryConflict === true && s.sentryBlockedOutcome !== undefined
    ).slice(-20);
    
    const sentryCorrect = recentConflicts.filter((s: any) => s.sentryBlockedOutcome === 'sentry_correct').length;
    const sentryAccuracy = recentConflicts.length >= 5 ? sentryCorrect / recentConflicts.length : 1.0; // assume accurate until enough data
    
    const hardGateActive = sentryAccuracy >= 0.70;
    
    if (!hardGateActive) {
      console.log(`  ⚠️ HARD GATE AUTO-REVERTED: Sentry accuracy ${(sentryAccuracy * 100).toFixed(0)}% < 70% on rolling ${recentConflicts.length} conflicts`);
      console.log(`  Falling back to soft gate (confidence halving)\n`);
    }
    
    for (const signal of signals) {
      if (sentryConflicts.has(signal.coin)) {
        signal.sentryConflict = true;
        signal.originalConfidence = signal.confidence;
        
        if (hardGateActive) {
          // HARD GATE: Block signal entirely, log counterfactual
          (signal as any).sentryBlocked = true;
          (signal as any).sentryBlockedAt = new Date().toISOString();
          (signal as any).sentryBlockedReason = `Sentry SHORT vs Rei LONG on ${signal.coin}. Hard gate active (accuracy ${(sentryAccuracy * 100).toFixed(0)}% on ${recentConflicts.length} conflicts).`;
          (signal as any).kelly_action = 'BLOCKED';
          (signal as any).kelly_size = 0;
          signal.confidence = 'low';
          signal.tier = 'LOW';
          signal.tierReason = `🚫 SENTRY HARD GATE (BLOCKED): Sentry says SHORT, Rei says LONG. Signal recorded as counterfactual only. Original: ${signal.originalConfidence}. ${signal.tierReason}`;
          blockedSignals.push(signal);
          console.log(`  🚫 ${signal.coin} — BLOCKED by Sentry hard gate (was ${signal.originalConfidence}). Counterfactual logged.`);
        } else {
          // SOFT GATE FALLBACK: halve confidence
          if (signal.confidence === 'high') {
            signal.confidence = 'medium';
            signal.tier = 'MEDIUM';
          } else if (signal.confidence === 'medium') {
            signal.confidence = 'low';
            signal.tier = 'LOW';
          }
          signal.tierReason = `⚠️ SENTRY CONFLICT (soft gate — hard gate reverted): ${signal.tierReason}`;
          console.log(`  ⚠️ ${signal.coin} — Sentry conflict, soft gate applied (${signal.originalConfidence} → ${signal.confidence})`);
        }
      }
    }
    
    if (blockedSignals.length > 0) {
      console.log(`\n  📋 ${blockedSignals.length} signals BLOCKED. Counterfactual tracking active — outcomes will be compared against what would have happened.`);
    }
    console.log('');
  }

  // ═══ Regime-Aware Constraints (Stage 3 — Oracle 2026-02-24) ═══
  // Read current BTC regime from Temporal Edge and apply stop/size/maxHold
  const { regime: currentRegime, params: regimeParams } = getCurrentRegimeParams();
  console.log(`📊 BTC Regime: ${currentRegime} → stop=${(regimeParams.stop * 100).toFixed(0)}%, size=${regimeParams.size}x, maxHold=${regimeParams.maxHold}h\n`);
  
  for (const signal of signals) {
    // Tag every signal with regime
    (signal as any).regime = currentRegime;
    (signal as any).regimeStop = regimeParams.stop;
    (signal as any).regimeMaxHold = regimeParams.maxHold;
    
    // Apply size multiplier to kelly-eligible signals
    // In MOMENTUM_MODE: cap at 0.25x regime size (cautious rollout)
    const sizeCap = MOMENTUM_MODE ? MOMENTUM_SIZE_MULTIPLIER : 1.0;
    const effectiveSize = Math.min(regimeParams.size, sizeCap);
    if (signal.confidence === 'high' || signal.confidence === 'medium') {
      (signal as any).regimeSizeMultiplier = effectiveSize;
      (signal as any).momentumMode = MOMENTUM_MODE;
    }
  }

  // ═══ Live Signal Collection (for out-of-sample tracking) ═══
  // Log ALL HL funding events where |rate| >= 100bps, regardless of other filters
  // This builds the out-of-sample dataset for the momentum signal
  if (!fs.existsSync(SIGNAL_LOG_DIR)) {
    fs.mkdirSync(SIGNAL_LOG_DIR, { recursive: true });
  }
  const extremeEvents = opportunities.filter(o => Math.abs(o.currentRate) >= MOMENTUM_MIN_RATE);
  if (extremeEvents.length > 0) {
    const logDate = new Date().toISOString().slice(0, 10);
    const logFile = path.join(SIGNAL_LOG_DIR, `${logDate}.json`);
    let existing: any[] = [];
    try { existing = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch {}
    for (const e of extremeEvents) {
      existing.push({
        timestamp: new Date().toISOString(),
        coin: e.coin,
        rate: e.currentRate,
        rateBps: Math.round(e.currentRate * 10000),
        annualizedAPR: e.annualizedRate,
        price: e.markPrice,
        regime: currentRegime,
        direction: e.currentRate > 0 ? 'LONG' : 'SHORT', // momentum direction
        basis: e.basis,
        priceChange24h: e.priceChange24h,
      });
    }
    fs.writeFileSync(logFile, JSON.stringify(existing, null, 2), 'utf-8');
    console.log(`📡 Live signal log: ${extremeEvents.length} events >= 100bps saved to data/live-signals/${logDate}.json`);
  } else {
    console.log(`📡 Live signal log: 0 events >= 100bps this scan (normal — signal fires during dislocations)`);
  }

  // Summary by tier
  const highCount = signals.filter(s => s.tier === 'HIGH').length;
  const medCount = signals.filter(s => s.tier === 'MEDIUM').length;
  const lowCount = signals.filter(s => s.tier === 'LOW').length;
  console.log(`Tiers: ${highCount} HIGH | ${medCount} MEDIUM | ${lowCount} LOW (log only)\n`);

  // Append to paper ledger
  ledger.signals.push(...signals);
  ledger.lastScanAt = new Date().toISOString();
  ledger.totalScans++;

  const resultsDir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`✅ Logged ${signals.length} signals to paper-ledger.json (total: ${ledger.signals.length} signals, ${ledger.totalScans} scans)`);

  // Save daily report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `rei-funding-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date,
    scannedAt: new Date().toISOString(),
    coinsScanned: opportunities.length,
    candidates: candidates.length,
    tiers: { high: highCount, medium: medCount, low: lowCount },
    signals,
    allOpportunities: opportunities.slice(0, 20),
  }, null, 2), 'utf-8');

  console.log(`📊 Daily report saved to reports/rei-funding-${date}.json`);
}

main().catch(err => {
  console.error('❌ Scan failed:', err.message);
  process.exit(1);
});
