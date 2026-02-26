#!/usr/bin/env npx tsx
/**
 * Medic Position Monitor — Bot Challenge Tool #13 (FINAL)
 * 
 * Watches open positions and recommends smart exits/extensions based on:
 * 1. Regime shifts (params changed since entry)
 * 2. Stop-loss proximity/breach
 * 3. Funding rate decay (carry thesis dead?)
 * 4. Profitable hold extensions
 * 5. Jinx Factor escalation
 * 
 * Sits between Wren (sizing) and Outcome Tracker (scoring) in the pipeline.
 * 
 * Usage: npx tsx tools/medic-position-monitor.ts
 * Cron slot: :09 (after Jinx Factor Model at :08)
 */

import * as fs from 'fs';
import * as path from 'path';
import { REGIME_PARAMS, DEFAULT_REGIME_PARAMS, RegimeParams } from '../../academy/src/services/temporal-edge';
import { isClosedPosition } from './lib/closed-position-gate';

// ═══ Config ═══

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const LEDGER_FILE = path.join(RESULTS_DIR, 'paper-ledger.json');
const FACTOR_FILE = path.join(RESULTS_DIR, 'factor-model-output.json');
const STATE_FILE = path.join(RESULTS_DIR, 'medic-state.json');
const OUTPUT_FILE = path.join(RESULTS_DIR, 'medic-output.json');

const HL_API = 'https://api.hyperliquid.xyz/info';
const MAX_SIGNAL_AGE_MS = 24 * 60 * 60 * 1000;

// ═══ Types ═══

interface MedicAlert {
  type: 'REGIME_SHIFT' | 'STOP_BREACH' | 'STOP_APPROACHING' | 'FUNDING_DECAY' | 'PROFITABLE_HOLD' | 'JINX_ESCALATION';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  coin: string;
  direction: string;
  message: string;
  action: string;
  details?: Record<string, any>;
}

interface PositionState {
  entryRegime: string;
  entryTime: string;
  entryPrice: number;
  entryFundingAPR: number;
  entryParams: RegimeParams;
}

interface MedicState {
  lastRegime: string;
  lastFactorScore: number;
  lastFactorGrade: string;
  positions: Record<string, PositionState>;
  previousStopBreaches: string[]; // coin keys that were past stop last cycle
  lastRunAt: string;
}

interface MedicOutput {
  timestamp: string;
  regime: string;
  previousRegime: string;
  regimeShifted: boolean;
  alerts: MedicAlert[];
  summary: {
    totalPositions: number;
    alertCount: number;
    criticalCount: number;
    warningCount: number;
    recommendedExits: string[];
    recommendedExtensions: string[];
  };
}

// ═══ HyperLiquid Price Fetch ═══

async function getCurrentPrices(): Promise<Record<string, number>> {
  try {
    const resp = await fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });
    const data = await resp.json() as Record<string, string>;
    const prices: Record<string, number> = {};
    for (const [coin, price] of Object.entries(data)) {
      prices[coin] = parseFloat(price);
    }
    return prices;
  } catch (e) {
    console.error('Failed to fetch prices:', e);
    return {};
  }
}

async function getCurrentFunding(): Promise<Record<string, number>> {
  try {
    const resp = await fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    const [meta, assetCtxs] = await resp.json() as [any, any[]];
    const funding: Record<string, number> = {};
    for (let i = 0; i < meta.universe.length && i < assetCtxs.length; i++) {
      const coin = meta.universe[i].name;
      const rate = parseFloat(assetCtxs[i].funding || '0');
      funding[coin] = rate * 24 * 365 * 100; // annualized %
    }
    return funding;
  } catch (e) {
    console.error('Failed to fetch funding:', e);
    return {};
  }
}

// ═══ Get Current Regime ═══

function getCurrentRegime(ledger: any): string {
  const now = Date.now();
  const lookback = 5 * 60 * 60 * 1000;
  const recentTE = (ledger.signals || [])
    .filter((s: any) => s.tool === 'jackbot-temporal-edge' && s.regime && (now - (s.unixMs || 0)) < lookback)
    .sort((a: any, b: any) => (b.unixMs || 0) - (a.unixMs || 0));
  return recentTE.length > 0 ? recentTE[0].regime : 'TRENDING_DOWN';
}

// ═══ Check Functions ═══

function checkRegimeShift(
  posKey: string, pos: PositionState, currentRegime: string
): MedicAlert | null {
  if (pos.entryRegime === currentRegime) return null;
  
  const entryParams = REGIME_PARAMS[pos.entryRegime] || DEFAULT_REGIME_PARAMS;
  const newParams = REGIME_PARAMS[currentRegime] || DEFAULT_REGIME_PARAMS;
  
  const tighter = newParams.stop < entryParams.stop || 
                  newParams.size < entryParams.size || 
                  newParams.maxHold < entryParams.maxHold;
  
  if (!tighter) return null;
  
  const holdHours = (Date.now() - new Date(pos.entryTime).getTime()) / (1000 * 60 * 60);
  const holdExceeded = holdHours > newParams.maxHold;
  const coin = posKey.split('_')[0];
  const dir = posKey.split('_')[1];
  
  return {
    type: 'REGIME_SHIFT',
    severity: holdExceeded ? 'WARNING' : 'INFO',
    coin,
    direction: dir,
    message: `Opened in ${pos.entryRegime}, now ${currentRegime}. Stop: ${(entryParams.stop*100)}% → ${(newParams.stop*100)}%. ${holdExceeded ? `Hold ${holdHours.toFixed(1)}h exceeds ${newParams.maxHold}h maxHold.` : ''}`,
    action: holdExceeded ? 'EXIT_OR_REDUCE' : 'TIGHTEN_STOP',
    details: { from: pos.entryRegime, to: currentRegime, holdHours: +holdHours.toFixed(1), holdExceeded },
  };
}

function checkStopBreach(
  coin: string, direction: string, entryPrice: number, currentPrice: number, regimeParams: RegimeParams
): MedicAlert | null {
  if (!currentPrice || !entryPrice || entryPrice === 0) return null;
  
  const pnlPct = (currentPrice - entryPrice) / entryPrice;
  const adjustedPnl = direction === 'SHORT' ? -pnlPct : pnlPct;
  const stopLevel = regimeParams.stop;
  
  if (adjustedPnl <= -stopLevel) {
    return {
      type: 'STOP_BREACH',
      severity: 'CRITICAL',
      coin,
      direction,
      message: `Price at ${(adjustedPnl * 100).toFixed(1)}%, PAST ${(stopLevel * 100)}% stop. Immediate exit.`,
      action: 'EXIT_NOW',
      details: { pnlPct: +(adjustedPnl * 100).toFixed(2), stopLevel: +(stopLevel * 100) },
    };
  }
  
  if (adjustedPnl <= -(stopLevel * 0.75)) {
    return {
      type: 'STOP_APPROACHING',
      severity: 'WARNING',
      coin,
      direction,
      message: `Price at ${(adjustedPnl * 100).toFixed(1)}%, approaching ${(stopLevel * 100)}% stop (${((stopLevel + adjustedPnl) * 100).toFixed(1)}% away).`,
      action: 'MONITOR',
      details: { pnlPct: +(adjustedPnl * 100).toFixed(2), distanceToStop: +((stopLevel + adjustedPnl) * 100).toFixed(2) },
    };
  }
  
  return null;
}

function checkFundingDecay(
  coin: string, direction: string, entryFundingAPR: number, currentFundingAPR: number
): MedicAlert | null {
  if (!entryFundingAPR || Math.abs(entryFundingAPR) < 10) return null;
  
  const decayRatio = Math.abs(currentFundingAPR) / Math.abs(entryFundingAPR);
  
  if (decayRatio < 0.30) {
    return {
      type: 'FUNDING_DECAY',
      severity: 'WARNING',
      coin,
      direction,
      message: `Funding decayed from ${entryFundingAPR.toFixed(0)}% to ${currentFundingAPR.toFixed(0)}% APR (${((1 - decayRatio) * 100).toFixed(0)}% decay). Carry thesis weakening.`,
      action: 'EXIT',
      details: { entryFunding: +entryFundingAPR.toFixed(0), currentFunding: +currentFundingAPR.toFixed(0), decayPct: +((1 - decayRatio) * 100).toFixed(0) },
    };
  }
  
  return null;
}

function checkExtension(
  coin: string, direction: string, entryPrice: number, currentPrice: number, 
  holdHours: number, currentFundingAPR: number, regimeParams: RegimeParams
): MedicAlert | null {
  if (!currentPrice || !entryPrice || entryPrice === 0) return null;
  
  const pnlPct = (currentPrice - entryPrice) / entryPrice;
  const adjustedPnl = direction === 'SHORT' ? -pnlPct : pnlPct;
  const remainingHold = regimeParams.maxHold - holdHours;
  
  if (adjustedPnl > 0.01 && remainingHold <= 2 && remainingHold > 0 && Math.abs(currentFundingAPR) > 50) {
    return {
      type: 'PROFITABLE_HOLD',
      severity: 'INFO',
      coin,
      direction,
      message: `+${(adjustedPnl * 100).toFixed(1)}%, ${remainingHold.toFixed(1)}h remaining. Funding still at ${currentFundingAPR.toFixed(0)}% APR. Trail stop to breakeven.`,
      action: 'EXTEND',
      details: { pnlPct: +(adjustedPnl * 100).toFixed(2), remainingHours: +remainingHold.toFixed(1), currentFunding: +currentFundingAPR.toFixed(0) },
    };
  }
  
  return null;
}

function checkJinxEscalation(
  currentScore: number, currentGrade: string, previousScore: number, previousGrade: string
): MedicAlert | null {
  const escalated = (currentGrade === 'HIGH' || currentGrade === 'CRITICAL') && 
                    (previousGrade === 'LOW' || previousGrade === 'MODERATE');
  
  if (!escalated) return null;
  
  return {
    type: 'JINX_ESCALATION',
    severity: currentGrade === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
    coin: 'PORTFOLIO',
    direction: '-',
    message: `Risk score jumped ${previousScore} → ${currentScore} (${previousGrade} → ${currentGrade}). Do not add new longs. Consider closing weakest position.`,
    action: 'REVIEW_ALL',
    details: { previousScore, currentScore, previousGrade, currentGrade },
  };
}

// ═══ Format for console/email ═══

function formatOutput(output: MedicOutput): string {
  const { alerts, summary } = output;
  const regimeNote = output.regimeShifted ? `${output.previousRegime} → ${output.regime} (SHIFTED)` : output.regime;
  
  let text = `--- MEDIC POSITION MONITOR ---\nREGIME: ${regimeNote}\n${summary.totalPositions} positions monitored | ${summary.alertCount} alerts`;
  if (summary.criticalCount > 0) text += ` | ${summary.criticalCount} CRITICAL`;
  text += '\n';
  
  const criticals = alerts.filter(a => a.severity === 'CRITICAL');
  const warnings = alerts.filter(a => a.severity === 'WARNING');
  const infos = alerts.filter(a => a.severity === 'INFO');
  
  if (criticals.length > 0) {
    text += '\n🚨 CRITICAL:\n';
    for (const a of criticals) text += `  ${a.coin} ${a.direction}: ${a.message}\n`;
  }
  if (warnings.length > 0) {
    text += '\n⚠️ WARNINGS:\n';
    for (const a of warnings) text += `  ${a.coin} ${a.direction}: ${a.message}\n`;
  }
  if (infos.length > 0) {
    text += '\n✅ HOLDS:\n';
    for (const a of infos) text += `  ${a.coin} ${a.direction}: ${a.message}\n`;
  }
  
  if (summary.recommendedExits.length > 0) {
    text += `\nRECOMMENDED EXITS: ${summary.recommendedExits.join(', ')}`;
  }
  if (summary.recommendedExtensions.length > 0) {
    text += `\nRECOMMENDED EXTENSIONS: ${summary.recommendedExtensions.join(', ')}`;
  }
  
  if (alerts.length === 0) {
    text += '\n✅ All positions healthy. No alerts.';
  }
  
  return text;
}

// ═══ Main ═══

async function main() {
  console.log('🏥 Medic Position Monitor — checking position health...\n');
  
  // Ensure dirs exist
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  
  // Load ledger
  let ledger: any;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    console.error('❌ Cannot read paper-ledger.json');
    process.exit(1);
  }
  
  // Get current regime
  const currentRegime = getCurrentRegime(ledger);
  const currentParams = REGIME_PARAMS[currentRegime] || DEFAULT_REGIME_PARAMS;
  console.log(`Regime: ${currentRegime} | stop=${(currentParams.stop*100)}%, size=${currentParams.size}x, maxHold=${currentParams.maxHold}h`);
  
  // Load previous state
  let prevState: MedicState;
  try {
    prevState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    prevState = { lastRegime: currentRegime, lastFactorScore: 0, lastFactorGrade: 'LOW', positions: {}, previousStopBreaches: [], lastRunAt: '' };
    console.log('First run — no previous state. Creating baseline.\n');
  }
  
  // Load factor model output
  let factorScore = 0;
  let factorGrade = 'LOW';
  try {
    const factor = JSON.parse(fs.readFileSync(FACTOR_FILE, 'utf-8'));
    factorScore = factor.overallRisk?.score || 0;
    factorGrade = factor.overallRisk?.grade || 'LOW';
  } catch {
    console.log('No factor model output found — skipping Jinx escalation check.');
  }
  
  // Get active signals from ledger (same filter as Wren/Factor Model)
  const now = Date.now();
  
  // Build cooldown set: any coin+direction that was closed by Medic should not resurface
  const closedPairs = new Set<string>();
  for (const s of (ledger.signals || [])) {
    if (s.kelly_status === 'CLOSED' || s.medic_exit) {
      closedPairs.add(`${s.coin}_${s.direction}`);
    }
  }
  if (closedPairs.size > 0) {
    console.log(`Cooldown active: ${closedPairs.size} coin+direction pairs closed by Medic (${[...closedPairs].join(', ')})\n`);
  }
  
  const activeSignals = (ledger.signals || []).filter((s: any) => {
    const age = now - (s.unixMs || new Date(s.timestamp).getTime() || 0);
    if (age > MAX_SIGNAL_AGE_MS) return false;
    if (s.kelly_status === 'STALE' || s.kelly_status === 'SUPERSEDED' || s.kelly_status === 'CLOSED') return false;
    if (s.sentryBlocked) return false;
    if (s.kelly_action === 'SKIP' || s.kelly_action === 'BLOCKED') return false;
    if ((s.kelly_size || 0) <= 0) return false;
    // Cooldown: skip if Medic already closed another entry for this coin+direction
    if (closedPairs.has(`${s.coin}_${s.direction}`)) return false;
    return true;
  });
  
  console.log(`Active positions: ${activeSignals.length}\n`);
  
  // Fetch current prices and funding
  const [prices, funding] = await Promise.all([getCurrentPrices(), getCurrentFunding()]);
  
  // Build/update position state
  const newPositions: Record<string, PositionState> = {};
  for (const sig of activeSignals) {
    // Closed position gate (Oracle directive 2026-02-26)
    if (isClosedPosition(sig.coin, sig.direction)) {
      console.log(`🚫 ${sig.coin} ${sig.direction} — skipped (on closed position list)`);
      continue;
    }
    const key = `${sig.coin}_${sig.direction}_${sig.tool}`;
    if (prevState.positions[key]) {
      // Keep existing entry data
      newPositions[key] = prevState.positions[key];
    } else {
      // New position — record entry state
      newPositions[key] = {
        entryRegime: sig.regime || currentRegime,
        entryTime: sig.timestamp,
        entryPrice: sig.entryPrice || prices[sig.coin] || 0,
        entryFundingAPR: sig.annualizedRate ? sig.annualizedRate * 100 : (funding[sig.coin] || 0),
        entryParams: REGIME_PARAMS[sig.regime || currentRegime] || DEFAULT_REGIME_PARAMS,
      };
    }
  }
  
  // Run all checks
  const alerts: MedicAlert[] = [];
  
  // 1. Jinx escalation (portfolio-level)
  if (prevState.lastRunAt) {
    const jinxAlert = checkJinxEscalation(factorScore, factorGrade, prevState.lastFactorScore, prevState.lastFactorGrade);
    if (jinxAlert) alerts.push(jinxAlert);
  }
  
  // 2. Per-position checks
  for (const sig of activeSignals) {
    const key = `${sig.coin}_${sig.direction}_${sig.tool}`;
    const pos = newPositions[key];
    if (!pos) continue;
    
    const currentPrice = prices[sig.coin] || 0;
    const currentFundingAPR = funding[sig.coin] || 0;
    const holdHours = (now - new Date(pos.entryTime).getTime()) / (1000 * 60 * 60);
    
    // Regime shift
    const regimeAlert = checkRegimeShift(key, pos, currentRegime);
    if (regimeAlert) alerts.push(regimeAlert);
    
    // Stop breach/approaching
    const stopAlert = checkStopBreach(sig.coin, sig.direction, pos.entryPrice, currentPrice, currentParams);
    if (stopAlert) alerts.push(stopAlert);
    
    // Funding decay (only for Rei carry positions)
    if (sig.tool === 'rei-funding-carry') {
      const fundingAlert = checkFundingDecay(sig.coin, sig.direction, pos.entryFundingAPR, currentFundingAPR);
      if (fundingAlert) alerts.push(fundingAlert);
    }
    
    // Profitable extension
    if (sig.tool === 'rei-funding-carry') {
      const extAlert = checkExtension(sig.coin, sig.direction, pos.entryPrice, currentPrice, holdHours, currentFundingAPR, currentParams);
      if (extAlert) alerts.push(extAlert);
    }
  }
  
  // ═══ Auto-Close: tiered stop logic (Oracle directive 2026-02-27) ═══
  // - Breach >20% past stop → immediate close (no confirmation)
  // - Breach within 20% of stop → 2-cycle confirmation (wick protection)
  const IMMEDIATE_CLOSE_THRESHOLD = 0.20; // 20% past stop = instant close
  const currentStopBreaches: string[] = [];
  const autoClosedCoins: string[] = [];
  
  for (const a of alerts) {
    if (a.type === 'STOP_BREACH') {
      const breachKey = `${a.coin}_${a.direction}`;
      currentStopBreaches.push(breachKey);
      
      const pnlPct = Math.abs(a.details?.pnlPct || 0) / 100;
      const stopLevel = currentParams.stop;
      const breachExcess = (pnlPct - stopLevel) / stopLevel; // how far past stop as ratio
      
      const immediateClose = breachExcess > IMMEDIATE_CLOSE_THRESHOLD;
      const confirmedClose = (prevState.previousStopBreaches || []).includes(breachKey);
      
      if (immediateClose) {
        console.log(`⚡ IMMEDIATE CLOSE: ${a.coin} ${a.direction} — ${(breachExcess * 100).toFixed(0)}% past stop (>${(IMMEDIATE_CLOSE_THRESHOLD * 100)}% threshold)`);
      }
      
      // Close if immediate (blowout) OR confirmed (2nd consecutive cycle)
      if (immediateClose || confirmedClose) {
        // Find the signal in ledger and mark CLOSED
        const sigIndex = (ledger.signals || []).findIndex((s: any) => {
          const age = now - (s.unixMs || new Date(s.timestamp).getTime() || 0);
          if (age > MAX_SIGNAL_AGE_MS) return false;
          if (s.kelly_status === 'STALE' || s.kelly_status === 'SUPERSEDED' || s.kelly_status === 'CLOSED') return false;
          if (s.sentryBlocked) return false;
          if (s.kelly_action === 'SKIP' || s.kelly_action === 'BLOCKED') return false;
          if ((s.kelly_size || 0) <= 0) return false;
          return s.coin === a.coin && s.direction === a.direction;
        });
        
        if (sigIndex >= 0) {
          const sig = ledger.signals[sigIndex];
          const entryPrice = sig.entryPrice || 0;
          const stopLevel = currentParams.stop;
          const exitPrice = a.direction === 'SHORT' 
            ? entryPrice * (1 + stopLevel) 
            : entryPrice * (1 - stopLevel);
          
          sig.kelly_status = 'CLOSED';
          sig.medic_exit = {
            reason: 'AUTO_CLOSE_STOP_BREACH',
            exitPrice: +exitPrice.toFixed(6),
            exitTime: new Date().toISOString(),
            theoreticalPnlPct: -(stopLevel * 100),
            actualPnlPct: a.details?.pnlPct,
            note: `Auto-closed: past ${(stopLevel * 100)}% stop for >1 cycle (${prevState.lastRunAt} → now)`,
          };
          autoClosedCoins.push(`${a.coin} ${a.direction}`);
          console.log(`🔒 AUTO-CLOSED: ${a.coin} ${a.direction} — past stop for >1 cycle`);
        }
      }
    }
  }
  
  // Save ledger if any auto-closes happened
  if (autoClosedCoins.length > 0) {
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
    console.log(`\n🔒 Auto-closed ${autoClosedCoins.length} positions: ${autoClosedCoins.join(', ')}`);
  }
  
  // Deduplicate alerts by coin+type (keep highest severity)
  const alertMap = new Map<string, MedicAlert>();
  const sevRank: Record<string, number> = { CRITICAL: 3, WARNING: 2, INFO: 1 };
  for (const a of alerts) {
    const key = `${a.coin}_${a.type}`;
    const existing = alertMap.get(key);
    if (!existing || (sevRank[a.severity] || 0) > (sevRank[existing.severity] || 0)) {
      alertMap.set(key, a);
    }
  }
  const dedupedAlerts = [...alertMap.values()].sort((a, b) => (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0));
  
  // Build output
  const recommendedExits = [...new Set(dedupedAlerts.filter(a => a.action === 'EXIT_NOW' || a.action === 'EXIT').map(a => a.coin))];
  const recommendedExtensions = [...new Set(dedupedAlerts.filter(a => a.action === 'EXTEND').map(a => a.coin))];
  
  const output: MedicOutput = {
    timestamp: new Date().toISOString(),
    regime: currentRegime,
    previousRegime: prevState.lastRegime,
    regimeShifted: prevState.lastRegime !== currentRegime && prevState.lastRunAt !== '',
    alerts: dedupedAlerts,
    summary: {
      totalPositions: activeSignals.length,
      alertCount: dedupedAlerts.length,
      criticalCount: dedupedAlerts.filter(a => a.severity === 'CRITICAL').length,
      warningCount: dedupedAlerts.filter(a => a.severity === 'WARNING').length,
      recommendedExits,
      recommendedExtensions,
    },
  };
  
  // Print report
  console.log(formatOutput(output));
  
  // Save output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(REPORTS_DIR, `medic-${date}.json`), JSON.stringify(output, null, 2));
  
  // Save state for next cycle
  const newState: MedicState = {
    lastRegime: currentRegime,
    lastFactorScore: factorScore,
    lastFactorGrade: factorGrade,
    positions: newPositions,
    previousStopBreaches: currentStopBreaches,
    lastRunAt: new Date().toISOString(),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));
  
  console.log(`\n✅ Medic complete — ${dedupedAlerts.length} alerts (${output.summary.criticalCount} critical, ${output.summary.warningCount} warning)`);
  console.log(`State saved. ${Object.keys(newPositions).length} positions tracked.`);
}

main().catch(err => {
  console.error('❌ Medic failed:', err.message);
  process.exit(1);
});
