#!/usr/bin/env npx tsx
/**
 * Wren Kelly Sizer — Bot Challenge Tool
 * 
 * Meta-tool that reads signals from the paper ledger and calculates
 * optimal position sizes using the Kelly Criterion. Wren doesn't find
 * edges — she sizes them. Every signal passes through Wren before
 * becoming a position.
 * 
 * Usage: npx tsx tools/wren-kelly-sizer.ts
 * 
 * Calculates:
 * - Full Kelly fraction per signal
 * - Half-Kelly (conservative) recommendation
 * - Portfolio-level max drawdown estimate
 * - Position sizes in USD given a bankroll
 * - Risk-adjusted ranking of all active signals
 * 
 * Output: sized positions to paper-ledger.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══ Types ═══

interface LedgerSignal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  confidence: number | string;
  entryPrice: number;
  reasoning: string;
  invalidation: string;
  kelly_size?: number;
  annualizedRate?: number;
  portfolioRiskScore?: number;
  [key: string]: any;
}

interface PaperLedgerEntry {
  signals: LedgerSignal[];
  lastScanAt: string;
  totalScans: number;
}

interface SizedPosition {
  coin: string;
  direction: 'LONG' | 'SHORT';
  sourceTool: string;
  confidence: number;
  entryPrice: number;
  fullKelly: number;      // fraction of bankroll (0-1)
  halfKelly: number;      // conservative sizing
  quarterKelly: number;   // ultra-conservative
  usdSize: number;        // at half-Kelly with given bankroll
  expectedEdge: number;   // estimated edge percentage
  riskReward: number;     // estimated risk/reward ratio
  ranking: number;        // 1 = best risk-adjusted signal
  reasoning: string;
}

interface KellyReport {
  tool: string;
  timestamp: string;
  unixMs: number;
  bankroll: number;
  maxPositions: number;
  signalsAnalyzed: number;
  positionsSized: number;
  totalExposure: number;    // sum of all USD positions
  exposureRatio: number;    // total exposure / bankroll
  maxDrawdownEstimate: number;
  positions: SizedPosition[];
  recommendation: string;
}

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const PAPER_BANKROLL = 1000; // $1K paper trading bankroll
const MAX_POSITIONS = 5;     // max concurrent positions
const MAX_SINGLE_POSITION = 0.25; // no single position > 25% of bankroll
const STALE_HOURS = 24;
const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';

// ═══ Kelly Criterion ═══

/**
 * Kelly fraction = (bp - q) / b
 * where:
 *   b = net odds (reward/risk ratio)
 *   p = probability of winning
 *   q = 1 - p
 * 
 * We estimate p from confidence score and historical tool accuracy.
 * We estimate b from the signal characteristics.
 */

function kellyFraction(winProb: number, rewardRiskRatio: number): number {
  const q = 1 - winProb;
  const kelly = (rewardRiskRatio * winProb - q) / rewardRiskRatio;
  return Math.max(0, Math.min(1, kelly)); // clamp 0-1
}

// ═══ Edge Estimation ═══

// Historical win rates by tool type (bootstrapped from backtest data)
// These get updated as real Bot Challenge data comes in
const TOOL_BASE_WIN_RATES: Record<string, number> = {
  'rei-funding-carry': 0.55,       // carry trades: slight positive edge
  'jackbot-temporal-edge': 0.52,   // temporal patterns: marginal edge
  'sakura-arb-scanner': 0.60,      // arb: higher base rate
  'jinx-correlation-monitor': 0.50, // meta-tool, doesn't signal
  'wren-kelly-sizer': 0.50,        // meta-tool, doesn't signal
  'default': 0.50,
};

// Reward/risk estimates by signal type
const TOOL_REWARD_RISK: Record<string, number> = {
  'rei-funding-carry': 1.5,       // carry: small steady gains, occasional blowup
  'jackbot-temporal-edge': 2.0,   // temporal: higher reward when right
  'sakura-arb-scanner': 1.2,      // arb: tight spreads, lower R:R
  'default': 1.5,
};

function estimateWinProbability(signal: LedgerSignal): number {
  const baseRate = TOOL_BASE_WIN_RATES[signal.tool] || TOOL_BASE_WIN_RATES['default'];
  
  // Adjust by confidence
  let conf: number;
  if (typeof signal.confidence === 'number') {
    conf = signal.confidence;
  } else if (signal.confidence === 'high') {
    conf = 0.75;
  } else if (signal.confidence === 'medium') {
    conf = 0.55;
  } else {
    conf = 0.40;
  }
  
  // Blend base rate with confidence (50/50 weight)
  return (baseRate + conf) / 2;
}

function estimateRewardRisk(signal: LedgerSignal): number {
  return TOOL_REWARD_RISK[signal.tool] || TOOL_REWARD_RISK['default'];
}

// ═══ Volatility for Drawdown Estimation ═══

async function fetchCurrentPrices(coins: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  try {
    const res = await fetch(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });
    if (!res.ok) return prices;
    const data = await res.json() as Record<string, string>;
    for (const coin of coins) {
      if (data[coin]) prices.set(coin, parseFloat(data[coin]));
    }
  } catch {}
  return prices;
}

// ═══ Helpers ═══

function getActiveSignals(ledger: PaperLedgerEntry): LedgerSignal[] {
  const now = Date.now();
  const cutoff = now - STALE_HOURS * 60 * 60 * 1000;
  
  const latest = new Map<string, LedgerSignal>();
  for (const sig of ledger.signals) {
    // Skip meta-tool entries
    if (sig.tool === 'jinx-correlation-monitor' || sig.tool === 'wren-kelly-sizer') continue;
    if (sig.direction === 'FLAT') continue;
    
    const key = `${sig.tool}:${sig.coin}`;
    const existing = latest.get(key);
    if (!existing || sig.unixMs > existing.unixMs) {
      latest.set(key, sig);
    }
  }
  
  return Array.from(latest.values()).filter(sig => sig.unixMs >= cutoff);
}

function getPortfolioRisk(ledger: PaperLedgerEntry): number | null {
  // Find most recent Jinx correlation report
  const jinxSignals = ledger.signals
    .filter(s => s.tool === 'jinx-correlation-monitor')
    .sort((a, b) => b.unixMs - a.unixMs);
  
  return jinxSignals.length > 0 ? (jinxSignals[0].portfolioRiskScore ?? null) : null;
}

// ═══ Main ═══

async function main() {
  console.log('📐 Wren Kelly Sizer — reading paper ledger...\n');
  
  // Load paper ledger
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    console.log('⚠️  No paper ledger found. Nothing to size.');
    process.exit(0);
  }
  
  const active = getActiveSignals(ledger);
  console.log(`Ledger: ${ledger.signals.length} total signals | Active: ${active.length}\n`);
  
  if (active.length === 0) {
    console.log('⚠️  No active signals to size. Run signal tools first.');
    process.exit(0);
  }
  
  // Get Jinx's portfolio risk assessment if available
  const portfolioRisk = getPortfolioRisk(ledger);
  if (portfolioRisk !== null) {
    console.log(`🔗 Jinx portfolio risk: ${portfolioRisk}/100`);
  }
  
  // Fetch current prices
  const coins = [...new Set(active.map(s => s.coin))];
  console.log(`💰 Fetching current prices for ${coins.length} coins...`);
  const currentPrices = await fetchCurrentPrices(coins);
  
  // Size each position
  const positions: SizedPosition[] = [];
  
  for (const sig of active) {
    const winProb = estimateWinProbability(sig);
    const rr = estimateRewardRisk(sig);
    const fullKelly = kellyFraction(winProb, rr);
    
    // If Kelly says 0 (no edge), skip
    if (fullKelly <= 0.001) {
      console.log(`   SKIP ${sig.coin} (${sig.tool}): Kelly = 0 (no edge at estimated parameters)`);
      continue;
    }
    
    const halfKelly = fullKelly / 2;
    const quarterKelly = fullKelly / 4;
    
    // Cap at max single position
    const cappedHalfKelly = Math.min(halfKelly, MAX_SINGLE_POSITION);
    const usdSize = Math.round(cappedHalfKelly * PAPER_BANKROLL * 100) / 100;
    
    // Expected edge = kelly * reward/risk (simplified)
    const expectedEdge = (winProb * rr - (1 - winProb)) / rr;
    
    const currentPrice = currentPrices.get(sig.coin) || sig.entryPrice;
    const priceMove = sig.entryPrice > 0 && currentPrice > 0
      ? ((currentPrice - sig.entryPrice) / sig.entryPrice * 100)
      : 0;
    
    positions.push({
      coin: sig.coin,
      direction: sig.direction as 'LONG' | 'SHORT',
      sourceTool: sig.tool,
      confidence: typeof sig.confidence === 'number' ? sig.confidence : 0.5,
      entryPrice: sig.entryPrice,
      fullKelly: parseFloat(fullKelly.toFixed(4)),
      halfKelly: parseFloat(cappedHalfKelly.toFixed(4)),
      quarterKelly: parseFloat(quarterKelly.toFixed(4)),
      usdSize,
      expectedEdge: parseFloat((expectedEdge * 100).toFixed(2)),
      riskReward: rr,
      ranking: 0, // filled after sorting
      reasoning: `Win prob: ${(winProb * 100).toFixed(0)}%, R:R: ${rr.toFixed(1)}, Kelly: ${(fullKelly * 100).toFixed(1)}%. Current price: $${currentPrice?.toFixed(2) || '?'} (${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(1)}% from entry)`,
    });
  }
  
  // Rank by expected edge * confidence (risk-adjusted)
  positions.sort((a, b) => (b.expectedEdge * b.confidence) - (a.expectedEdge * a.confidence));
  positions.forEach((p, i) => p.ranking = i + 1);
  
  // Limit to max positions
  const selected = positions.slice(0, MAX_POSITIONS);
  const totalExposure = selected.reduce((sum, p) => sum + p.usdSize, 0);
  const exposureRatio = totalExposure / PAPER_BANKROLL;
  
  // Drawdown estimate (rough: assume worst case = 2x average position loss)
  const avgPosition = totalExposure / (selected.length || 1);
  const maxDrawdownEstimate = Math.min(100, parseFloat((avgPosition / PAPER_BANKROLL * 200).toFixed(1)));
  
  // Apply Jinx risk adjustment
  let recommendation: string;
  if (portfolioRisk !== null && portfolioRisk >= 70) {
    recommendation = `JINX WARNING: Portfolio risk ${portfolioRisk}/100. Reduce all positions to quarter-Kelly. Total exposure $${totalExposure.toFixed(0)} (${(exposureRatio * 100).toFixed(0)}% of bankroll).`;
  } else if (exposureRatio > 0.8) {
    recommendation = `OVEREXPOSED: Total exposure $${totalExposure.toFixed(0)} is ${(exposureRatio * 100).toFixed(0)}% of bankroll. Consider dropping lowest-ranked position.`;
  } else if (selected.length === 0) {
    recommendation = 'NO POSITIONS: No signals have positive Kelly fraction. Stand aside.';
  } else {
    recommendation = `SIZED: ${selected.length} positions, $${totalExposure.toFixed(0)} total (${(exposureRatio * 100).toFixed(0)}% of $${PAPER_BANKROLL} bankroll). Max estimated drawdown: ${maxDrawdownEstimate}%.`;
  }
  
  // Build report
  const report: KellyReport = {
    tool: 'wren-kelly-sizer',
    timestamp: new Date().toISOString(),
    unixMs: Date.now(),
    bankroll: PAPER_BANKROLL,
    maxPositions: MAX_POSITIONS,
    signalsAnalyzed: active.length,
    positionsSized: selected.length,
    totalExposure,
    exposureRatio: parseFloat(exposureRatio.toFixed(4)),
    maxDrawdownEstimate,
    positions: selected,
    recommendation,
  };
  
  // Print results
  console.log('\n════════════════════════════════════════');
  console.log('  WREN KELLY POSITION SIZING');
  console.log('════════════════════════════════════════\n');
  
  console.log(`💰 Bankroll: $${PAPER_BANKROLL} | Max positions: ${MAX_POSITIONS}`);
  console.log(`📊 ${recommendation}\n`);
  
  if (selected.length > 0) {
    console.log('📋 Sized Positions (ranked by risk-adjusted edge):');
    for (const pos of selected) {
      const icon = pos.ranking <= 2 ? '🟢' : pos.ranking <= 4 ? '🟡' : '⚪';
      console.log(`\n   ${icon} #${pos.ranking} ${pos.coin} ${pos.direction}`);
      console.log(`      Source: ${pos.sourceTool}`);
      console.log(`      Entry: $${pos.entryPrice?.toFixed(2) || '?'}`);
      console.log(`      Full Kelly: ${(pos.fullKelly * 100).toFixed(1)}% | Half: ${(pos.halfKelly * 100).toFixed(1)}% | Quarter: ${(pos.quarterKelly * 100).toFixed(1)}%`);
      console.log(`      USD Size (½K): $${pos.usdSize.toFixed(2)}`);
      console.log(`      Edge: ${pos.expectedEdge.toFixed(1)}% | R:R: ${pos.riskReward.toFixed(1)}`);
      console.log(`      ${pos.reasoning}`);
    }
    
    if (positions.length > MAX_POSITIONS) {
      console.log(`\n   ⏸️  ${positions.length - MAX_POSITIONS} additional signals below position limit:`);
      for (const pos of positions.slice(MAX_POSITIONS)) {
        console.log(`      ${pos.coin} ${pos.direction} (${pos.sourceTool}) — Kelly: ${(pos.fullKelly * 100).toFixed(1)}%, Edge: ${pos.expectedEdge.toFixed(1)}%`);
      }
    }
  }
  
  console.log('');
  
  // Log to paper ledger
  ledger.signals.push({
    tool: 'wren-kelly-sizer',
    timestamp: report.timestamp,
    unixMs: report.unixMs,
    coin: 'PORTFOLIO',
    direction: 'FLAT' as const,
    confidence: 1,
    entryPrice: 0,
    reasoning: `Sized ${selected.length} positions. Total exposure: $${totalExposure.toFixed(0)} (${(exposureRatio * 100).toFixed(0)}%). Max drawdown est: ${maxDrawdownEstimate}%. ${recommendation}`,
    invalidation: 'Next sizing run supersedes.',
    positionCount: selected.length,
    totalExposure,
    exposureRatio,
  } as any);
  
  ledger.lastScanAt = new Date().toISOString();
  ledger.totalScans++;
  
  const resultsDir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`✅ Logged sizing to paper-ledger.json (scan #${ledger.totalScans})`);
  
  // Save daily report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `wren-kelly-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`📊 Full report saved to reports/wren-kelly-${date}.json`);
}

main().catch(err => {
  console.error('❌ Kelly sizing failed:', err.message);
  process.exit(1);
});
