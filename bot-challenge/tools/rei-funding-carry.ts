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
}

interface PaperLedgerEntry {
  signals: any[];
  lastScanAt: string;
  totalScans: number;
}

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');

// Tier thresholds
const HIGH_MIN_APR = 1.00;       // 100% annualized
const HIGH_MIN_PERSIST = 4;      // hours
const HIGH_MAX_PRICE_MOVE = 0.05; // 5%

const MED_MIN_APR = 1.00;
const MED_MIN_PERSIST = 2;
const MED_MAX_PRICE_MOVE = 0.15; // 15%

const LOW_MIN_APR = 0.50;        // 50% annualized — log everything above this

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

  console.log('🔍 Rei Funding Carry (3-Tier Model) — scanning HyperLiquid...\n');

  const opportunities = await scanner.scan();

  // Load existing ledger for persistence check
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    ledger = { signals: [], lastScanAt: '', totalScans: 0 };
  }

  // Filter to everything above LOW threshold (50% APR)
  const candidates = opportunities.filter(o => Math.abs(o.annualizedRate) >= LOW_MIN_APR);

  console.log(`Scanned ${opportunities.length} coins. ${candidates.length} above ${LOW_MIN_APR * 100}% APR threshold.\n`);

  // Classify each candidate
  const signals: BotChallengeSignal[] = [];

  for (const opp of candidates) {
    const persistenceHours = checkPersistence(opp.coin, ledger);
    const { tier, reason } = classifyTier(opp, persistenceHours);

    const isSurgeonSignal = opp.basis < -0.001 && opp.currentRate < 0 && Math.abs(opp.annualizedRate) >= 0.50;

    const signal: BotChallengeSignal = {
      tool: 'rei-funding-carry',
      timestamp: new Date().toISOString(),
      unixMs: Date.now(),
      coin: opp.coin,
      direction: opp.direction === 'LONG_BASIS' ? 'SHORT' as const : 'LONG' as const,
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
