#!/usr/bin/env npx tsx
/**
 * Prophet Benter — Benter-Architecture Ensemble Supervisor
 *
 * Bill Benter won $1B betting Hong Kong horse racing by finding where the market
 * was systematically wrong. Key principle: "The market is 90% correct. Find the
 * 10% where it is systematically wrong."
 *
 * Prophet does NOT generate predictions from scratch.
 * Prophet reads other agents' signals, weights them by calibration quality (Brier scores),
 * reconciles the ensemble, and only outputs a signal when the ensemble DISAGREES with
 * the market-implied probability.
 * Most cycles: 0 signals. That is correct and expected behavior.
 *
 * ⚠️  LLM REASONING NOTE: This tool warrants Sonnet (not Haiku) as the cron LLM
 * due to its ensemble reconciliation role. The math is deterministic but the
 * interpretation of edge vs market signal quality benefits from deeper reasoning.
 *
 * Usage: npx tsx tools/prophet-benter.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'results', 'prophet-benter-output.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');

// Lookback window for recent agent signals
const SIGNAL_LOOKBACK_MS = 4 * 60 * 60 * 1000; // 4 hours

// Non-evaluatable tools — skip entirely
const NON_EVALUATABLE_TOOLS = new Set([
  'sakura-arb-scanner',
  'prophet-lead-lag',
  'jinx-correlation-monitor',
  'medic-position-monitor',
]);

// Tools included in ensemble
const ENSEMBLE_TOOLS = new Set([
  'rei-funding-carry',
  'pixel-momentum',
  'sentry-sentiment-scanner',
]);

// Minimum Brier score samples to trust; below this, use default
const MIN_BRIER_SAMPLES = 10;
const DEFAULT_BRIER = 0.30;

// Minimum edge (calibrated - market_implied) to emit a signal
const MIN_EDGE = 0.05;

// Funding rate thresholds (annualized %)
const HIGH_FUNDING_APR = 87.6;  // 100bps hourly
const MED_FUNDING_APR = 43.8;   // 50bps hourly

// ═══ Types ═══

interface AgentCalibration {
  agent: string;
  brierScore: number;
  winRate: number | null;
  n: number;
  weight: number;
  usingDefault: boolean;
}

interface MarketImplied {
  coin: string;
  fundingAnnualized: number;
  marketImpliedProb: number;  // P(LONG) = prob that going LONG is correct
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
}

export interface ProphetSignal {
  tool: 'prophet-benter';
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: 'LONG' | 'SHORT';
  marketImpliedProbability: number;
  ensembleProbability: number;
  calibratedProbability: number;
  edge: number;                     // calibrated - market_implied
  kellyFraction: number;            // quarter-kelly
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  agentsAgreeing: string[];         // agents aligned with final direction
  agentsDisagreeing: string[];      // agents opposed
  consensusDanger: boolean;         // >75% agents agree (flag for Helena)
  benterSignal: boolean;            // |edge| >= 0.08 AND 2+ agents agree
  rationale: string;
}

// ═══ Step 1: Brier Score Calculation ═══

function calculateBrierScores(signals: any[]): Map<string, AgentCalibration> {
  // Only use maxHold locks (migration locks are imperfect)
  const locked = signals.filter(s =>
    s.outcome?.locked === true &&
    s.outcome?.lockReason === 'maxHold' &&
    ENSEMBLE_TOOLS.has(s.tool) &&
    (s.direction === 'LONG' || s.direction === 'SHORT') &&
    typeof s.outcome?.pnlPercent === 'number'
  );

  // Group by agent
  const byAgent = new Map<string, any[]>();
  for (const s of locked) {
    const arr = byAgent.get(s.tool) || [];
    arr.push(s);
    byAgent.set(s.tool, arr);
  }

  const calibrations = new Map<string, AgentCalibration>();

  for (const tool of ENSEMBLE_TOOLS) {
    const agentSignals = byAgent.get(tool) || [];
    let brierScore = DEFAULT_BRIER;
    let winRate: number | null = null;
    let usingDefault = true;

    if (agentSignals.length >= MIN_BRIER_SAMPLES) {
      let brierSum = 0;
      let wins = 0;

      for (const s of agentSignals) {
        const conf = (s.confidence || 'low').toString().toLowerCase();
        let predictedProb: number;
        if (conf === 'high') predictedProb = 0.75;
        else if (conf === 'medium') predictedProb = 0.60;
        else predictedProb = 0.45;

        const outcome = s.outcome.pnlPercent > 0 ? 1.0 : 0.0;
        brierSum += Math.pow(predictedProb - outcome, 2);
        if (outcome === 1.0) wins++;
      }

      brierScore = brierSum / agentSignals.length;
      winRate = wins / agentSignals.length;
      usingDefault = false;
    }

    // weight = 1 / (1 + brier_score)
    const rawWeight = 1 / (1 + brierScore);

    calibrations.set(tool, {
      agent: tool,
      brierScore,
      winRate,
      n: agentSignals.length,
      weight: rawWeight,  // normalized below
      usingDefault,
    });
  }

  // Normalize weights so they sum to 1
  const totalWeight = Array.from(calibrations.values()).reduce((s, c) => s + c.weight, 0);
  for (const cal of calibrations.values()) {
    cal.weight = cal.weight / totalWeight;
  }

  return calibrations;
}

function printCalibrationTable(calibrations: Map<string, AgentCalibration>) {
  console.log('');
  console.log('═══ AGENT CALIBRATION TABLE ═══');
  console.log('─'.repeat(85));
  console.log(
    'Agent'.padEnd(30) + '| ' +
    'Brier'.padEnd(8) + '| ' +
    'WR'.padEnd(8) + '| ' +
    'n'.padEnd(6) + '| ' +
    'Weight'.padEnd(8) + '| Note'
  );
  console.log('─'.repeat(85));

  for (const cal of calibrations.values()) {
    const wr = cal.winRate !== null ? (cal.winRate * 100).toFixed(1) + '%' : '--';
    const note = cal.usingDefault
      ? (cal.n === 0 ? '(no data — using default)' : `(insufficient — using default)`)
      : '';
    console.log(
      cal.agent.padEnd(30) + '| ' +
      cal.brierScore.toFixed(4).padEnd(8) + '| ' +
      wr.padEnd(8) + '| ' +
      String(cal.n).padEnd(6) + '| ' +
      cal.weight.toFixed(4).padEnd(8) + '| ' +
      note
    );
  }
  console.log('─'.repeat(85));
  console.log('');
}

// ═══ Step 2: Collect Recent Agent Signals ═══

function collectRecentSignals(signals: any[], nowMs: number): Map<string, any[]> {
  const cutoff = nowMs - SIGNAL_LOOKBACK_MS;
  const byCoin = new Map<string, any[]>();

  for (const s of signals) {
    if (!ENSEMBLE_TOOLS.has(s.tool)) continue;
    if ((s.unixMs || 0) < cutoff) continue;

    // rei-funding-carry: HIGH tier only
    if (s.tool === 'rei-funding-carry') {
      const tier = (s.tier || '').toUpperCase();
      const conf = (s.confidence || '').toLowerCase();
      // Accept HIGH tier, or HIGH confidence (some signals may not have tier field)
      if (tier !== 'HIGH' && conf !== 'high') continue;
    }

    // Only LONG/SHORT directions (no FLAT)
    const dir = (s.direction || '').toUpperCase();
    if (dir !== 'LONG' && dir !== 'SHORT') continue;

    const coin = s.coin;
    if (!coin) continue;

    const arr = byCoin.get(coin) || [];
    arr.push(s);
    byCoin.set(coin, arr);
  }

  return byCoin;
}

// ═══ Step 3: Fetch Market-Implied Probability ═══

interface HLContext {
  coin: string;
  markPx: number;
  fundingHourly: number;
  fundingAnnualized: number;
}

async function fetchHLContexts(): Promise<Map<string, HLContext>> {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });

  if (!res.ok) throw new Error(`HL API error: ${res.status}`);

  const data = await res.json() as [any, any[]];
  const [meta, ctxs] = data;

  const map = new Map<string, HLContext>();
  for (let i = 0; i < meta.universe.length; i++) {
    const coin = meta.universe[i].name as string;
    const ctx = ctxs[i];
    const fundingHourly = parseFloat(ctx.funding || '0');
    map.set(coin, {
      coin,
      markPx: parseFloat(ctx.markPx || '0'),
      fundingHourly,
      fundingAnnualized: fundingHourly * 24 * 365,
    });
  }

  return map;
}

function computeMarketImplied(ctx: HLContext): MarketImplied {
  const annualized = ctx.fundingAnnualized;
  const absApr = Math.abs(annualized);

  let marketImpliedProb: number;
  let direction: 'LONG' | 'SHORT' | 'NEUTRAL';

  if (absApr > HIGH_FUNDING_APR) {
    // High funding: strong directional signal
    if (annualized > 0) {
      // Positive funding = longs pay shorts → market implies LONG with 0.58
      marketImpliedProb = 0.58;
      direction = 'LONG';
    } else {
      // Negative funding = shorts pay longs → market implies SHORT with 0.42 (P(LONG)=0.42)
      marketImpliedProb = 0.42;
      direction = 'SHORT';
    }
  } else if (absApr > MED_FUNDING_APR) {
    if (annualized > 0) {
      marketImpliedProb = 0.54;
      direction = 'LONG';
    } else {
      marketImpliedProb = 0.46;
      direction = 'SHORT';
    }
  } else {
    marketImpliedProb = 0.50;
    direction = 'NEUTRAL';
  }

  return {
    coin: ctx.coin,
    fundingAnnualized: annualized,
    marketImpliedProb,
    direction,
  };
}

// ═══ Step 4: Ensemble Reconciliation ═══

function signalToProb(direction: string, confidence: string): number {
  const dir = direction.toUpperCase();
  const conf = confidence.toLowerCase();

  if (dir === 'LONG') {
    if (conf === 'high') return 0.75;
    if (conf === 'medium') return 0.65;
    return 0.55;  // low
  } else if (dir === 'SHORT') {
    if (conf === 'high') return 0.25;   // 1 - 0.75
    if (conf === 'medium') return 0.35; // 1 - 0.65
    return 0.45;  // low: 1 - 0.55
  } else {
    return 0.50; // FLAT
  }
}

function plattScaleBenter(p: number): number {
  // Apply √3 Platt scaling coefficient
  const logit = Math.log(p / (1 - p));
  return 1 / (1 + Math.exp(-Math.sqrt(3) * logit));
}

function computeEnsemble(
  agentSignals: any[],
  calibrations: Map<string, AgentCalibration>
): { rawEnsemble: number; calibrated: number } {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const s of agentSignals) {
    const cal = calibrations.get(s.tool);
    if (!cal) continue;

    const conf = (s.confidence || 'low').toString().toLowerCase();
    const prob = signalToProb(s.direction, conf);
    weightedSum += prob * cal.weight;
    totalWeight += cal.weight;
  }

  if (totalWeight === 0) return { rawEnsemble: 0.5, calibrated: 0.5 };

  const rawEnsemble = weightedSum / totalWeight;
  const calibrated = plattScaleBenter(rawEnsemble);

  return { rawEnsemble, calibrated };
}

function computeKelly(edge: number, marketImplied: number, isLong: boolean): number {
  let kelly: number;
  if (isLong) {
    kelly = edge / (1 - marketImplied);
  } else {
    kelly = -edge / marketImplied;
  }
  // Quarter-Kelly (Benter's actual practice)
  return kelly * 0.25;
}

// ═══ Step 5: Build Prophet Signal ═══

function buildProphetSignal(
  coin: string,
  agentSignals: any[],
  calibrations: Map<string, AgentCalibration>,
  marketImplied: MarketImplied,
  nowMs: number
): ProphetSignal | null {
  const { rawEnsemble, calibrated } = computeEnsemble(agentSignals, calibrations);
  const edge = calibrated - marketImplied.marketImpliedProb;

  if (Math.abs(edge) < MIN_EDGE) return null;

  const isLong = edge > 0;
  const direction: 'LONG' | 'SHORT' = isLong ? 'LONG' : 'SHORT';

  const kellyFraction = computeKelly(edge, marketImplied.marketImpliedProb, isLong);

  // Determine confidence from edge magnitude
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  const absEdge = Math.abs(edge);
  if (absEdge > 0.10) confidence = 'HIGH';
  else if (absEdge > 0.07) confidence = 'MEDIUM';
  else confidence = 'LOW';

  // Which agents agree vs disagree with final direction
  const agentsAgreeing: string[] = [];
  const agentsDisagreeing: string[] = [];
  for (const s of agentSignals) {
    const agentDir = (s.direction || '').toUpperCase();
    if (agentDir === direction) {
      agentsAgreeing.push(s.tool);
    } else {
      agentsDisagreeing.push(s.tool);
    }
  }

  const totalAgents = agentsAgreeing.length + agentsDisagreeing.length;
  const consensusDanger = totalAgents > 0 && (agentsAgreeing.length / totalAgents) > 0.75;

  const benterSignal = absEdge >= 0.08 && agentsAgreeing.length >= 2;

  const rationale =
    `Ensemble ${direction} with ${(calibrated * 100).toFixed(1)}% calibrated probability vs ` +
    `market-implied ${(marketImplied.marketImpliedProb * 100).toFixed(1)}%; ` +
    `edge ${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}% from ${agentsAgreeing.length} agreeing agents.`;

  return {
    tool: 'prophet-benter',
    timestamp: new Date(nowMs).toISOString(),
    unixMs: nowMs,
    coin,
    direction,
    marketImpliedProbability: marketImplied.marketImpliedProb,
    ensembleProbability: rawEnsemble,
    calibratedProbability: calibrated,
    edge,
    kellyFraction,
    confidence,
    agentsAgreeing: [...new Set(agentsAgreeing)],
    agentsDisagreeing: [...new Set(agentsDisagreeing)],
    consensusDanger,
    benterSignal,
    rationale,
  };
}

// ═══ Step 5B: Single-Agent Pass-Through (rei HIGH only) ═══

function buildSingleAgentSignal(
  coin: string,
  agentSignals: any[],
  calibrations: Map<string, AgentCalibration>,
  marketImplied: MarketImplied,
  nowMs: number
): ProphetSignal | null {
  if (agentSignals.length !== 1) return null;

  const s = agentSignals[0];
  // Only pass through rei-funding-carry at HIGH confidence
  if (s.tool !== 'rei-funding-carry') return null;
  const conf = (s.confidence || '').toLowerCase();
  if (conf !== 'high') return null;

  // Still compute edge vs market
  const cal = calibrations.get(s.tool)!;
  const prob = signalToProb(s.direction, conf);

  // Reduced weight for single-agent: scale toward prior (0.5)
  const reducedProb = 0.5 + (prob - 0.5) * cal.weight;
  const calibrated = plattScaleBenter(reducedProb);
  const edge = calibrated - marketImplied.marketImpliedProb;

  if (Math.abs(edge) < MIN_EDGE) return null;

  const isLong = edge > 0;
  const direction: 'LONG' | 'SHORT' = isLong ? 'LONG' : 'SHORT';
  const kellyFraction = computeKelly(edge, marketImplied.marketImpliedProb, isLong);

  const absEdge = Math.abs(edge);
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  if (absEdge > 0.10) confidence = 'HIGH';
  else if (absEdge > 0.07) confidence = 'MEDIUM';
  else confidence = 'LOW';

  const agentDir = (s.direction || '').toUpperCase();
  const agentsAgreeing = agentDir === direction ? [s.tool] : [];
  const agentsDisagreeing = agentDir !== direction ? [s.tool] : [];

  return {
    tool: 'prophet-benter',
    timestamp: new Date(nowMs).toISOString(),
    unixMs: nowMs,
    coin,
    direction,
    marketImpliedProbability: marketImplied.marketImpliedProb,
    ensembleProbability: reducedProb,
    calibratedProbability: calibrated,
    edge,
    kellyFraction,
    confidence,
    agentsAgreeing,
    agentsDisagreeing,
    consensusDanger: false,
    benterSignal: absEdge >= 0.08,
    rationale:
      `Single-agent (rei HIGH) ${direction}: calibrated ${(calibrated * 100).toFixed(1)}% ` +
      `vs market ${(marketImplied.marketImpliedProb * 100).toFixed(1)}%; edge ${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}%.`,
  };
}

// ═══ Main ═══

async function main() {
  console.log('🔮 Prophet Benter — Benter-architecture ensemble supervisor\n');
  console.log('   "The market is 90% correct. Find the 10% where it is systematically wrong."\n');

  // Load ledger
  let ledger: { signals: any[]; lastScanAt?: string; totalScans?: number };
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    console.error('❌ Cannot read paper-ledger.json. Run a scanner first.');
    process.exit(1);
  }

  const now = Date.now();

  // ─── Step 1: Brier Scores ───
  console.log('📊 Step 1: Calculating agent Brier scores from locked outcomes (maxHold only)...');
  const calibrations = calculateBrierScores(ledger.signals);
  printCalibrationTable(calibrations);

  // ─── Step 2: Collect recent signals ───
  console.log('📡 Step 2: Collecting recent signals (past 4h)...');
  const signalsByCoin = collectRecentSignals(ledger.signals, now);
  console.log(`   Found ${signalsByCoin.size} coins with recent ensemble-eligible signals\n`);

  if (signalsByCoin.size === 0) {
    console.log('   (No recent signals from ensemble tools — likely 0 signals expected)\n');
  }

  // ─── Step 3: Fetch HL market data ───
  console.log('📈 Step 3: Fetching HL market-implied probabilities...');
  let hlContexts: Map<string, HLContext>;
  try {
    hlContexts = await fetchHLContexts();
    console.log(`   Fetched ${hlContexts.size} coins from HyperLiquid\n`);
  } catch (err) {
    console.error(`❌ HL API failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // ─── Steps 4-5: Ensemble Reconciliation ───
  console.log('🧮 Step 4: Running ensemble reconciliation...\n');

  const prophetSignals: ProphetSignal[] = [];
  let evaluated = 0;
  let suppressed = 0;

  for (const [coin, agentSignals] of signalsByCoin.entries()) {
    evaluated++;
    const hlCtx = hlContexts.get(coin);

    // Use neutral market-implied if no HL data for this coin
    const marketImplied: MarketImplied = hlCtx
      ? computeMarketImplied(hlCtx)
      : { coin, fundingAnnualized: 0, marketImpliedProb: 0.50, direction: 'NEUTRAL' };

    let sig: ProphetSignal | null = null;

    if (agentSignals.length >= 2) {
      sig = buildProphetSignal(coin, agentSignals, calibrations, marketImplied, now);
    } else {
      // Single-agent path (rei HIGH only)
      sig = buildSingleAgentSignal(coin, agentSignals, calibrations, marketImplied, now);
    }

    if (sig) {
      prophetSignals.push(sig);
    } else {
      suppressed++;
    }
  }

  // ─── Step 6: Print Signals ───
  console.log('');
  if (prophetSignals.length > 0) {
    console.log('═══ PROPHET SIGNALS ═══\n');
    for (const sig of prophetSignals) {
      const edgeStr = (sig.edge >= 0 ? '+' : '') + (sig.edge * 100).toFixed(1) + '%';
      const kellyStr = sig.kellyFraction.toFixed(4);
      const calibPct = (sig.calibratedProbability * 100).toFixed(1) + '%';
      const marketPct = (sig.marketImpliedProbability * 100).toFixed(1) + '%';
      const icon = sig.confidence === 'HIGH' ? '🎯' : sig.confidence === 'MEDIUM' ? '🔶' : '🔸';
      console.log(
        `${icon} ${sig.coin} ${sig.direction} | Edge: ${edgeStr} | Kelly: ${kellyStr} | ` +
        `Calibrated: ${calibPct} vs Market: ${marketPct}`
      );
      const agreeStr = sig.agentsAgreeing.length > 0 ? sig.agentsAgreeing.join(', ') : '—';
      const disagreeStr = sig.agentsDisagreeing.length > 0 ? sig.agentsDisagreeing.join(', ') : '—';
      console.log(`   Agents agreeing: ${agreeStr} | Disagreeing: ${disagreeStr}`);
      const benterStr = sig.benterSignal
        ? `YES (${sig.agentsAgreeing.length} agents, ${Math.abs(sig.edge * 100).toFixed(1)}% edge above market)`
        : 'NO';
      console.log(`   Benter signal: ${benterStr}`);
      if (sig.consensusDanger) {
        console.log(`   ⚠️  Consensus danger: >75% agent agreement — flag for Helena`);
      }
      console.log('');
    }
  } else {
    console.log('   (No signals generated — ensemble does not disagree with market sufficiently)');
    console.log('   This is correct and expected behavior. Benter-style: only bet when you have edge.\n');
  }

  const totalKelly = prophetSignals.reduce((s, sig) => s + Math.abs(sig.kellyFraction), 0);
  const consensusDangerCount = prophetSignals.filter(s => s.consensusDanger).length;

  console.log('═══ PROPHET BENTER SUMMARY ═══');
  console.log(`   Coins evaluated: ${evaluated}`);
  console.log(`   Signals generated: ${prophetSignals.length}`);
  console.log(`   Signals suppressed (no edge): ${suppressed}`);
  console.log(`   Consensus danger flags: ${consensusDangerCount}`);
  console.log(`   Total Kelly allocated: ${totalKelly.toFixed(4)}`);
  console.log('');

  // ─── Step 7: Save Outputs ───
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const agentCalibrationObj: Record<string, any> = {};
  for (const [tool, cal] of calibrations.entries()) {
    agentCalibrationObj[tool] = cal;
  }

  const output = {
    generatedAt: new Date(now).toISOString(),
    agentCalibration: agentCalibrationObj,
    signals: prophetSignals,
    suppressed,
    evaluated,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`✅ Results saved to results/prophet-benter-output.json`);

  const date = new Date(now).toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `prophet-benter-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`📊 Daily report saved to reports/prophet-benter-${date}.json`);
}

main().catch(err => {
  console.error('❌ Prophet Benter failed:', err.message);
  process.exit(1);
});
