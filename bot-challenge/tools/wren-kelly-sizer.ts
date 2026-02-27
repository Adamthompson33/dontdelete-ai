#!/usr/bin/env npx tsx
/**
 * Wren Kelly Sizer — Bot Challenge Tool
 * 
 * Takes any signal from paper-ledger.json and computes the mathematically
 * optimal position size using the Kelly Criterion.
 * 
 * Kelly % = (p - (1-p)) / 1  where p = confidence probability
 *   high   → p = 0.70 → Kelly = 40% → capped at 20%
 *   medium → p = 0.55 → Kelly = 10%
 *   low    → p = 0.35 → Kelly = -30% → 0% (no position)
 * 
 * Cap: 20% max position size (half-Kelly for safety)
 * 
 * Reads paper-ledger.json, annotates signals with kelly_size,
 * writes back. Also prints a sizing report.
 * 
 * Usage: npx tsx tools/wren-kelly-sizer.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { REGIME_PARAMS, DEFAULT_REGIME_PARAMS } from '../../academy/src/services/temporal-edge';

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const MAX_KELLY = 0.20; // 20% max position cap

// Confidence → probability mapping
const CONFIDENCE_MAP: Record<string, number> = {
  high: 0.70,
  medium: 0.55,
  low: 0.35,
};

// ═══ Kelly Criterion ═══

interface KellyResult {
  rawKelly: number;    // uncapped Kelly fraction
  cappedKelly: number; // capped at MAX_KELLY
  action: 'SIZE' | 'SKIP'; // SKIP if Kelly <= 0
  reasoning: string;
}

function computeKelly(confidence: string, expectedEdge?: number): KellyResult {
  const p = CONFIDENCE_MAP[confidence] ?? 0.35;
  
  // Kelly % = (p - (1-p)) / 1 = 2p - 1
  // This is the simplified Kelly for even-money bets
  const rawKelly = (p - (1 - p));
  const cappedKelly = Math.min(Math.max(rawKelly, 0), MAX_KELLY);
  
  const action = rawKelly > 0 ? 'SIZE' : 'SKIP';

  let reasoning: string;
  if (action === 'SKIP') {
    reasoning = `Kelly = ${(rawKelly * 100).toFixed(1)}% (p=${(p * 100).toFixed(0)}%). Negative edge — no position.`;
  } else if (rawKelly > MAX_KELLY) {
    reasoning = `Kelly = ${(rawKelly * 100).toFixed(1)}% (p=${(p * 100).toFixed(0)}%). Capped at ${(MAX_KELLY * 100).toFixed(0)}% max position.`;
  } else {
    reasoning = `Kelly = ${(rawKelly * 100).toFixed(1)}% (p=${(p * 100).toFixed(0)}%). Within cap.`;
  }

  return { rawKelly, cappedKelly, action, reasoning };
}

// ═══ Main ═══

interface PaperLedgerEntry {
  signals: any[];
  lastScanAt: string;
  totalScans: number;
}

async function main() {
  console.log('📐 Wren Kelly Sizer — computing optimal position sizes...\n');

  // Load ledger
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch (err) {
    console.error('❌ Cannot read paper-ledger.json. Run a scanner first.');
    process.exit(1);
  }

  if (ledger.signals.length === 0) {
    console.log('No signals in paper-ledger. Nothing to size.');
    return;
  }

  // Detect current regime from most recent temporal-edge signal
  const now = Date.now();
  const recentTE = ledger.signals
    .filter((s: any) => s.tool === 'jackbot-temporal-edge' && s.regime && (now - (s.unixMs || 0)) < 5 * 60 * 60 * 1000)
    .sort((a: any, b: any) => (b.unixMs || 0) - (a.unixMs || 0));
  const currentRegime = recentTE.length > 0 ? recentTE[0].regime : '';
  if (currentRegime) {
    const rp = REGIME_PARAMS[currentRegime] || DEFAULT_REGIME_PARAMS;
    console.log(`Regime: ${currentRegime} | sizeLong=${rp.sizeLong ?? rp.size}x, sizeShort=${rp.sizeShort ?? rp.size}x`);
  }

  // Process all signals that don't already have kelly_size
  let sized = 0;
  let skipped = 0;
  let alreadySized = 0;

  const summary: { coin: string; tool: string; direction: string; confidence: string; kelly: number; action: string }[] = [];

  for (const signal of ledger.signals) {
    if (signal.kelly_size !== undefined) {
      alreadySized++;
      continue;
    }

    const confidence = signal.confidence || 'low';
    const result = computeKelly(confidence, signal.expectedEdge);

    // Apply regime size multiplier (Stage 3) — asymmetric per direction (Oracle 2026-02-27)
    let regimeMultiplier = signal.regimeSizeMultiplier || 1.0;
    
    // If signal has no explicit regimeSizeMultiplier, apply from global regime params
    if (!signal.regimeSizeMultiplier && currentRegime) {
      const rp = REGIME_PARAMS[currentRegime] || DEFAULT_REGIME_PARAMS;
      const dir = (signal.direction || '').toUpperCase();
      if (dir === 'LONG' && rp.sizeLong !== undefined) {
        regimeMultiplier = rp.sizeLong;
      } else if (dir === 'SHORT' && rp.sizeShort !== undefined) {
        regimeMultiplier = rp.sizeShort;
      } else {
        regimeMultiplier = rp.size;
      }
      
      // Sentry gate: in regimes requiring Sentry approval for longs, check for matching Sentry signal
      if (dir === 'LONG' && rp.longRequiresSentry && signal.tool !== 'sentry-sentiment-scanner') {
        const coin = signal.coin;
        const hasSentryApproval = ledger.signals.some((s: any) =>
          s.tool === 'sentry-sentiment-scanner' &&
          s.coin === coin &&
          (s.direction || '').toUpperCase() === 'LONG' &&
          s.kelly_action !== 'SKIP' &&
          (now - (s.unixMs || 0)) < 8 * 60 * 60 * 1000
        );
        if (!hasSentryApproval) {
          regimeMultiplier = 0; // Block: no Sentry approval in adverse regime
          signal.sentryBlocked = true;
          signal.kelly_action = 'BLOCKED';
          console.log(`🚫 ${coin} LONG blocked — ${currentRegime} requires Sentry approval for longs`);
        }
      }
    }
    const regimeAdjustedKelly = result.cappedKelly * regimeMultiplier;
    
    // Annotate signal
    signal.kelly_size = parseFloat(regimeAdjustedKelly.toFixed(6));
    signal.kelly_size_pre_regime = result.cappedKelly;
    signal.kelly_raw = result.rawKelly;
    signal.kelly_action = result.action;
    signal.kelly_reasoning = result.reasoning + (regimeMultiplier < 1.0 ? ` Regime-adjusted: ${regimeMultiplier}x.` : '');
    signal.kelly_sizedAt = new Date().toISOString();

    if (result.action === 'SIZE') {
      sized++;
    } else {
      skipped++;
    }

    summary.push({
      coin: signal.coin?.slice(0, 20) || 'UNKNOWN',
      tool: signal.tool || 'unknown',
      direction: signal.direction || '?',
      confidence,
      kelly: result.cappedKelly,
      action: result.action,
    });
  }

  // Print sizing report
  console.log(`Processed ${summary.length} new signals (${alreadySized} already sized)\n`);

  // Group by action
  const sizeSignals = summary.filter(s => s.action === 'SIZE');
  const skipSignals = summary.filter(s => s.action === 'SKIP');

  if (sizeSignals.length > 0) {
    console.log('📊 POSITION SIZES:');
    console.log('─'.repeat(70));
    for (const s of sizeSignals) {
      const pct = (s.kelly * 100).toFixed(1);
      const icon = s.confidence === 'high' ? '🔴' : '🟡';
      console.log(`${icon} ${s.coin.padEnd(20)} ${s.direction.padEnd(6)} ${pct.padStart(5)}% of bankroll  [${s.tool}]`);
    }
    console.log('');
  }

  if (skipSignals.length > 0) {
    console.log(`⚪ ${skipSignals.length} signals SKIPPED (low confidence → negative Kelly):`);
    for (const s of skipSignals) {
      console.log(`   ${s.coin.padEnd(20)} ${s.direction.padEnd(6)} [${s.tool}]`);
    }
    console.log('');
  }

  // ═══ Proportional Reduction ═══
  // Only consider ACTIVE signals (within maxHold window, default 24h)
  const MAX_SIGNAL_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  // Mark stale signals
  for (const signal of ledger.signals) {
    if (signal.kelly_action !== 'SIZE') continue;
    const signalTime = new Date(signal.timestamp || signal.scannedAt || signal.kelly_sizedAt || 0).getTime();
    const age = now - signalTime;
    if (age > MAX_SIGNAL_AGE_MS) {
      signal.kelly_status = 'STALE';
      signal.kelly_size = 0;
    } else {
      signal.kelly_status = 'ACTIVE';
    }
  }
  
  const staleCount = ledger.signals.filter(s => s.kelly_status === 'STALE').length;
  if (staleCount > 0) {
    console.log(`🕐 Marked ${staleCount} signals as STALE (>24h old) — allocation zeroed\n`);
  }
  
  // ═══ Deduplication (Oracle directive 2026-02-24) ═══
  // One active signal per ticker per tool. Highest tier wins, then newest.
  const TIER_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const activeSignals = ledger.signals.filter((s: any) => s.kelly_status === 'ACTIVE' && s.kelly_action === 'SIZE' && s.kelly_size > 0);
  
  // Group by coin+tool+direction key
  const bestByKey = new Map<string, any>();
  let dedupCount = 0;
  
  for (const signal of activeSignals) {
    const key = `${signal.coin}|${signal.tool}|${signal.direction}`;
    const existing = bestByKey.get(key);
    
    if (!existing) {
      bestByKey.set(key, signal);
      continue;
    }
    
    const newTierRank = TIER_RANK[signal.tier] || 0;
    const existingTierRank = TIER_RANK[existing.tier] || 0;
    
    let replace = false;
    if (newTierRank > existingTierRank) {
      replace = true; // higher tier wins
    } else if (newTierRank === existingTierRank && signal.unixMs > existing.unixMs) {
      replace = true; // same tier, newer wins
    }
    
    if (replace) {
      // Mark old signal as superseded
      existing.kelly_status = 'SUPERSEDED';
      existing.kelly_size = 0;
      existing.kelly_superseded_by = signal.timestamp;
      existing.kelly_superseded_reason = `Replaced by ${signal.tier} signal at ${signal.timestamp}`;
      bestByKey.set(key, signal);
      dedupCount++;
    } else {
      // New signal is lower/equal-and-older — mark it as superseded
      signal.kelly_status = 'SUPERSEDED';
      signal.kelly_size = 0;
      signal.kelly_superseded_by = existing.timestamp;
      signal.kelly_superseded_reason = `Kept existing ${existing.tier} signal from ${existing.timestamp}`;
      dedupCount++;
    }
  }
  
  if (dedupCount > 0) {
    console.log(`🔄 Dedup: ${dedupCount} duplicate signals superseded → ${bestByKey.size} unique positions\n`);
  }
  
  // Compute total allocation across ACTIVE (non-superseded) sized signals only
  const allSizedSignals = ledger.signals.filter(s => s.kelly_action === 'SIZE' && s.kelly_status === 'ACTIVE' && s.kelly_size > 0);
  const totalAllocation = allSizedSignals.reduce((sum, s) => sum + (s.kelly_size || 0), 0);
  
  console.log(`Summary: ${sized} sized | ${skipped} skipped | Total allocation: ${(totalAllocation * 100).toFixed(1)}% of bankroll`);
  
  if (totalAllocation > 1.0) {
    const scaleFactor = 1.0 / totalAllocation;
    console.log(`\n⚠️ Total allocation ${(totalAllocation * 100).toFixed(1)}% exceeds 100%!`);
    console.log(`📉 Applying proportional reduction: scale factor = ${(scaleFactor * 100).toFixed(2)}%`);
    
    let reducedCount = 0;
    for (const signal of allSizedSignals) {
      const original = signal.kelly_size;
      signal.kelly_size_unreduced = original; // preserve original for audit
      signal.kelly_size = parseFloat((original * scaleFactor).toFixed(6));
      signal.kelly_scale_factor = parseFloat(scaleFactor.toFixed(6));
      signal.kelly_reduced_at = new Date().toISOString();
      reducedCount++;
    }
    
    const newTotal = allSizedSignals.reduce((sum, s) => sum + (s.kelly_size || 0), 0);
    console.log(`✅ Reduced ${reducedCount} positions: ${(totalAllocation * 100).toFixed(1)}% → ${(newTotal * 100).toFixed(1)}%`);
    console.log('');
    
    // Print top 10 positions after reduction
    const top10 = [...allSizedSignals].sort((a, b) => (b.kelly_size || 0) - (a.kelly_size || 0)).slice(0, 10);
    console.log('Top 10 positions after reduction:');
    console.log('─'.repeat(70));
    for (const s of top10) {
      const pct = ((s.kelly_size || 0) * 100).toFixed(2);
      const origPct = ((s.kelly_size_unreduced || s.kelly_size || 0) * 100).toFixed(1);
      console.log(`  ${(s.coin || '?').slice(0,20).padEnd(20)} ${(s.direction || '?').padEnd(6)} ${pct.padStart(6)}% (was ${origPct}%)  [${s.tool || '?'}]`);
    }
    console.log('');
  }

  // Write back to ledger
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`\n✅ Updated paper-ledger.json with kelly_size fields`);

  // Save daily report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `wren-kelly-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date,
    sizedAt: new Date().toISOString(),
    totalSignals: ledger.signals.length,
    newlySized: summary.length,
    alreadySized,
    sized,
    skipped,
    totalAllocation,
    maxKelly: MAX_KELLY,
    positions: sizeSignals,
    skippedPositions: skipSignals,
  }, null, 2), 'utf-8');

  console.log(`📊 Daily report saved to reports/wren-kelly-${date}.json`);
}

main().catch(err => {
  console.error('❌ Kelly sizer failed:', err.message);
  process.exit(1);
});
