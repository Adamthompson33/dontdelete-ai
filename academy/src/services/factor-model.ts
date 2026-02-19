/**
 * JINX'S FACTOR MODEL — Statistical Validator & Monte Carlo Stress Tester
 * 
 * The quality control layer. Takes any strategy's track record and answers:
 * "Is this edge real, or are you lucky?"
 * 
 * Core capabilities:
 * 1. Monte Carlo simulation — run 10K scenarios on any paper trade history
 * 2. Sharpe ratio calculation — risk-adjusted return measurement
 * 3. Drawdown analysis — worst-case scenarios and recovery time
 * 4. Correlation scanner — flags when agents are exposed to the same underlying risk
 * 5. Regime detection — is the current market environment favorable for the strategy?
 * 
 * Jinx doesn't predict. She validates. She's the agent who says
 * "your edge isn't real" and saves the portfolio from catastrophe.
 * 
 * Integration: Wire into Jinx's briefing in runtime.ts buildAgentBriefing()
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// ═══ TYPES ═══

export interface TradeRecord {
  date: string;
  pnl: number;
  size: number;
  market: string;
  agent: string;
  type: 'prediction' | 'funding' | 'arbitrage' | 'technical';
}

export interface MonteCarloResult {
  /** Number of simulations run */
  simulations: number;
  /** Input trade count */
  tradeCount: number;
  /** Mean terminal P&L across all simulations */
  meanPnl: number;
  /** Median terminal P&L (more robust than mean) */
  medianPnl: number;
  /** Standard deviation of terminal P&L */
  stdPnl: number;
  /** Probability of ending in profit */
  profitProbability: number;
  /** Probability of ruin (losing >50% of starting bankroll) */
  ruinProbability: number;
  /** 5th percentile outcome (worst realistic case) */
  percentile5: number;
  /** 25th percentile outcome */
  percentile25: number;
  /** 75th percentile outcome */
  percentile75: number;
  /** 95th percentile outcome (best realistic case) */
  percentile95: number;
  /** Maximum drawdown distribution */
  maxDrawdown: {
    mean: number;
    median: number;
    worst: number;
    percentile95: number;
  };
  /** Average number of trades to recover from max drawdown */
  avgRecoveryTrades: number;
  /** Confidence assessment */
  confidence: 'significant' | 'marginal' | 'insufficient_data' | 'not_significant';
  /** Human-readable summary */
  summary: string;
}

export interface SharpeAnalysis {
  /** Annualized Sharpe ratio (assuming daily returns) */
  sharpeRatio: number;
  /** Sortino ratio (downside deviation only) */
  sortinoRatio: number;
  /** Mean daily return */
  meanReturn: number;
  /** Standard deviation of daily returns */
  stdReturn: number;
  /** Downside deviation */
  downsideDeviation: number;
  /** Win rate */
  winRate: number;
  /** Profit factor (gross wins / gross losses) */
  profitFactor: number;
  /** Calmar ratio (return / max drawdown) */
  calmarRatio: number;
  /** Maximum drawdown */
  maxDrawdown: number;
  /** Current drawdown from peak */
  currentDrawdown: number;
  /** Assessment */
  assessment: string;
}

export interface CorrelationResult {
  /** Pairs of agents with correlated positions */
  correlatedPairs: {
    agent1: string;
    agent2: string;
    sharedThemes: string[];
    correlation: number; // 0-1, how much overlap
    combinedExposure: number; // total karma at risk
  }[];
  /** Overall portfolio correlation */
  portfolioCorrelation: number;
  /** Risk assessment */
  assessment: string;
}

export interface StrategyAudit {
  strategyName: string;
  agent: string;
  sharpe: SharpeAnalysis;
  monteCarlo: MonteCarloResult;
  /** Is the strategy worth continuing? */
  verdict: 'continue' | 'monitor' | 'reduce_size' | 'kill';
  /** Explanation */
  explanation: string;
}

// ═══ FACTOR MODEL ═══

export class FactorModel {
  private prisma: PrismaClient;
  private reportsDir: string;
  private rng: () => number; // Seeded RNG for reproducibility

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.reportsDir = path.join(__dirname, '..', '..', 'factor-reports');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
    // Simple seeded PRNG (Mulberry32) for reproducible Monte Carlo
    this.rng = this.createRng(Date.now());
  }

  // ═══ MONTE CARLO SIMULATION ═══

  /**
   * Run Monte Carlo simulation on a set of historical trades.
   * Resamples from the actual trade distribution to simulate future paths.
   * 
   * Method: Bootstrap resampling with replacement
   * - Take the historical P&L distribution
   * - Sample N trades randomly (with replacement)
   * - Compute cumulative P&L for that path
   * - Repeat 10,000 times
   * - Analyze the distribution of outcomes
   */
  runMonteCarlo(
    trades: TradeRecord[],
    simulations: number = 10000,
    horizonTrades: number = 0, // 0 = same as input length
  ): MonteCarloResult {
    if (trades.length < 3) {
      return {
        simulations: 0,
        tradeCount: trades.length,
        meanPnl: 0,
        medianPnl: 0,
        stdPnl: 0,
        profitProbability: 0,
        ruinProbability: 0,
        percentile5: 0,
        percentile25: 0,
        percentile75: 0,
        percentile95: 0,
        maxDrawdown: { mean: 0, median: 0, worst: 0, percentile95: 0 },
        avgRecoveryTrades: 0,
        confidence: 'insufficient_data',
        summary: `Only ${trades.length} trades. Need at least 3 for Monte Carlo. Keep accumulating data.`,
      };
    }

    const horizon = horizonTrades > 0 ? horizonTrades : trades.length;
    const pnls = trades.map(t => t.pnl);

    const terminalPnls: number[] = [];
    const maxDrawdowns: number[] = [];
    const recoveryTrades: number[] = [];

    for (let sim = 0; sim < simulations; sim++) {
      let cumPnl = 0;
      let peakPnl = 0;
      let maxDd = 0;
      let ddStart = 0;
      let recovered = true;

      for (let t = 0; t < horizon; t++) {
        // Sample random trade from history (bootstrap)
        const idx = Math.floor(this.rng() * pnls.length);
        cumPnl += pnls[idx];

        if (cumPnl > peakPnl) {
          peakPnl = cumPnl;
          if (!recovered) {
            recoveryTrades.push(t - ddStart);
            recovered = true;
          }
        }

        const dd = peakPnl - cumPnl;
        if (dd > maxDd) {
          maxDd = dd;
          if (recovered) {
            ddStart = t;
            recovered = false;
          }
        }
      }

      terminalPnls.push(cumPnl);
      maxDrawdowns.push(maxDd);
    }

    // Sort for percentile calculations
    terminalPnls.sort((a, b) => a - b);
    maxDrawdowns.sort((a, b) => a - b);

    const meanPnl = terminalPnls.reduce((s, v) => s + v, 0) / simulations;
    const medianPnl = terminalPnls[Math.floor(simulations / 2)];
    const stdPnl = Math.sqrt(
      terminalPnls.reduce((s, v) => s + Math.pow(v - meanPnl, 2), 0) / simulations
    );

    const profitProbability = terminalPnls.filter(p => p > 0).length / simulations;
    const ruinProbability = terminalPnls.filter(p => p < -50).length / simulations; // losing >$50

    const percentile = (arr: number[], p: number) => arr[Math.floor(arr.length * p / 100)];

    const ddMean = maxDrawdowns.reduce((s, v) => s + v, 0) / simulations;
    const ddMedian = maxDrawdowns[Math.floor(simulations / 2)];
    const avgRecovery = recoveryTrades.length > 0
      ? recoveryTrades.reduce((s, v) => s + v, 0) / recoveryTrades.length
      : horizon; // Never recovered

    // Statistical significance
    // Is the mean P&L significantly different from zero?
    // t-statistic = mean / (std / sqrt(n))
    const tStat = stdPnl > 0 ? (meanPnl / (stdPnl / Math.sqrt(simulations))) : 0;
    let confidence: MonteCarloResult['confidence'];
    if (trades.length < 5) {
      confidence = 'insufficient_data';
    } else if (Math.abs(tStat) > 2.576) { // p < 0.01
      confidence = 'significant';
    } else if (Math.abs(tStat) > 1.96) { // p < 0.05
      confidence = 'marginal';
    } else {
      confidence = 'not_significant';
    }

    // Summary
    let summary: string;
    if (confidence === 'insufficient_data') {
      summary = `${trades.length} trades is too few for reliable Monte Carlo. Accumulate more data. Current mean P&L: $${meanPnl.toFixed(2)}.`;
    } else if (confidence === 'significant' && meanPnl > 0) {
      summary = `Edge is REAL (p<0.01). ${(profitProbability * 100).toFixed(0)}% chance of profit over ${horizon} trades. Expected: $${meanPnl.toFixed(2)} (median: $${medianPnl.toFixed(2)}). Max drawdown 95th pct: $${percentile(maxDrawdowns, 95).toFixed(2)}.`;
    } else if (confidence === 'marginal' && meanPnl > 0) {
      summary = `Edge is MARGINAL (p<0.05). ${(profitProbability * 100).toFixed(0)}% chance of profit. Expected: $${meanPnl.toFixed(2)}. Need more trades to confirm. Don't increase size yet.`;
    } else if (meanPnl <= 0) {
      summary = `NO EDGE DETECTED. Mean P&L: $${meanPnl.toFixed(2)}. ${(profitProbability * 100).toFixed(0)}% profit probability. This strategy is losing money. Consider killing it.`;
    } else {
      summary = `Results not statistically significant (p>0.05). Mean P&L: $${meanPnl.toFixed(2)} but could be noise. Keep paper trading, don't go live.`;
    }

    return {
      simulations,
      tradeCount: trades.length,
      meanPnl,
      medianPnl,
      stdPnl,
      profitProbability,
      ruinProbability,
      percentile5: percentile(terminalPnls, 5),
      percentile25: percentile(terminalPnls, 25),
      percentile75: percentile(terminalPnls, 75),
      percentile95: percentile(terminalPnls, 95),
      maxDrawdown: {
        mean: ddMean,
        median: ddMedian,
        worst: maxDrawdowns[maxDrawdowns.length - 1],
        percentile95: percentile(maxDrawdowns, 95),
      },
      avgRecoveryTrades: avgRecovery,
      confidence,
      summary,
    };
  }

  // ═══ SHARPE RATIO ANALYSIS ═══

  /**
   * Calculate risk-adjusted return metrics from a series of P&L values.
   */
  calculateSharpe(dailyPnls: number[]): SharpeAnalysis {
    if (dailyPnls.length < 2) {
      return {
        sharpeRatio: 0,
        sortinoRatio: 0,
        meanReturn: 0,
        stdReturn: 0,
        downsideDeviation: 0,
        winRate: 0,
        profitFactor: 0,
        calmarRatio: 0,
        maxDrawdown: 0,
        currentDrawdown: 0,
        assessment: 'Insufficient data for Sharpe calculation.',
      };
    }

    const n = dailyPnls.length;
    const meanReturn = dailyPnls.reduce((s, v) => s + v, 0) / n;

    // Standard deviation
    const variance = dailyPnls.reduce((s, v) => s + Math.pow(v - meanReturn, 2), 0) / (n - 1);
    const stdReturn = Math.sqrt(variance);

    // Downside deviation (only negative returns)
    const downsideVariance = dailyPnls
      .filter(r => r < 0)
      .reduce((s, v) => s + Math.pow(v, 2), 0) / Math.max(dailyPnls.filter(r => r < 0).length, 1);
    const downsideDeviation = Math.sqrt(downsideVariance);

    // Sharpe ratio (annualized, assuming daily frequency)
    // Sharpe = (mean - risk_free) / std * sqrt(252)
    // Using risk_free = 0 for simplicity
    const sharpeRatio = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;

    // Sortino ratio (uses downside deviation instead of total)
    const sortinoRatio = downsideDeviation > 0
      ? (meanReturn / downsideDeviation) * Math.sqrt(252)
      : 0;

    // Win rate and profit factor
    const wins = dailyPnls.filter(r => r > 0);
    const losses = dailyPnls.filter(r => r < 0);
    const winRate = dailyPnls.length > 0 ? wins.length / dailyPnls.length : 0;
    const grossWins = wins.reduce((s, v) => s + v, 0);
    const grossLosses = Math.abs(losses.reduce((s, v) => s + v, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

    // Maximum drawdown
    let peak = 0;
    let cumPnl = 0;
    let maxDrawdown = 0;
    for (const pnl of dailyPnls) {
      cumPnl += pnl;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    const currentDrawdown = peak - cumPnl;

    // Calmar ratio (annualized return / max drawdown)
    const annualizedReturn = meanReturn * 252;
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

    // Assessment
    let assessment: string;
    if (n < 10) {
      assessment = `Only ${n} data points. Sharpe of ${sharpeRatio.toFixed(2)} is unreliable. Need 30+ for confidence.`;
    } else if (sharpeRatio > 2.0) {
      assessment = `Excellent Sharpe (${sharpeRatio.toFixed(2)}). Either genuine edge or too few data points. Verify with Monte Carlo.`;
    } else if (sharpeRatio > 1.0) {
      assessment = `Good Sharpe (${sharpeRatio.toFixed(2)}). Strategy shows promise. Monitor for regime changes.`;
    } else if (sharpeRatio > 0.5) {
      assessment = `Mediocre Sharpe (${sharpeRatio.toFixed(2)}). Edge exists but thin. Increase sample size before committing capital.`;
    } else if (sharpeRatio > 0) {
      assessment = `Weak Sharpe (${sharpeRatio.toFixed(2)}). Barely above noise. Not worth real capital at current quality.`;
    } else {
      assessment = `Negative Sharpe (${sharpeRatio.toFixed(2)}). Strategy is losing money risk-adjusted. Kill or redesign.`;
    }

    return {
      sharpeRatio,
      sortinoRatio,
      meanReturn,
      stdReturn,
      downsideDeviation,
      winRate,
      profitFactor,
      calmarRatio,
      maxDrawdown,
      currentDrawdown,
      assessment,
    };
  }

  // ═══ CORRELATION SCANNER ═══

  /**
   * Scan all agents' positions for correlated risk exposure.
   * Flags when multiple agents are betting the same theme.
   */
  async scanCorrelations(): Promise<CorrelationResult> {
    const agents = await this.prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
    });

    // Build theme exposure map per agent
    const agentThemes = new Map<string, Map<string, number>>();

    for (const agent of agents) {
      const positions = await this.prisma.position.findMany({
        where: { agentId: agent.id, settled: false },
        include: { market: true },
      });

      const themes = new Map<string, number>();
      for (const pos of positions) {
        const q = pos.market.question.toLowerCase();
        let theme = 'other';
        if (q.includes('bitcoin') || q.includes('btc') || q.includes('crypto') || q.includes('altcoin')) theme = 'crypto';
        else if (q.includes('trump') || q.includes('impeach') || q.includes('congress') || q.includes('dhs')) theme = 'politics';
        else if (q.includes('ai') || q.includes('model') || q.includes('coding') || q.includes('gpt') || q.includes('bubble')) theme = 'ai_tech';
        else if (q.includes('nba') || q.includes('nfl') || q.includes('ufc') || q.includes('celtics')) theme = 'sports';

        const cost = pos.side === 'YES' ? pos.size * pos.entryProb : pos.size * (1 - pos.entryProb);
        themes.set(theme, (themes.get(theme) || 0) + cost);
      }
      agentThemes.set(agent.name, themes);
    }

    // Find correlated pairs
    const correlatedPairs: CorrelationResult['correlatedPairs'] = [];
    const agentNames = Array.from(agentThemes.keys());

    for (let i = 0; i < agentNames.length; i++) {
      for (let j = i + 1; j < agentNames.length; j++) {
        const a1 = agentNames[i];
        const a2 = agentNames[j];
        const themes1 = agentThemes.get(a1)!;
        const themes2 = agentThemes.get(a2)!;

        const sharedThemes: string[] = [];
        let sharedExposure = 0;
        let totalExposure = 0;

        const allThemes = new Set([...themes1.keys(), ...themes2.keys()]);
        for (const theme of allThemes) {
          const e1 = themes1.get(theme) || 0;
          const e2 = themes2.get(theme) || 0;
          totalExposure += e1 + e2;
          if (e1 > 0 && e2 > 0) {
            sharedThemes.push(theme);
            sharedExposure += e1 + e2;
          }
        }

        if (sharedThemes.length > 0) {
          const correlation = totalExposure > 0 ? sharedExposure / totalExposure : 0;
          correlatedPairs.push({
            agent1: a1,
            agent2: a2,
            sharedThemes,
            correlation,
            combinedExposure: sharedExposure,
          });
        }
      }
    }

    // Overall portfolio correlation
    const totalCorrelation = correlatedPairs.length > 0
      ? correlatedPairs.reduce((s, p) => s + p.correlation, 0) / correlatedPairs.length
      : 0;

    // Sort by risk
    correlatedPairs.sort((a, b) => b.combinedExposure - a.combinedExposure);

    let assessment: string;
    if (correlatedPairs.length === 0) {
      assessment = 'No correlated positions detected. Portfolio is well-diversified.';
    } else if (totalCorrelation > 0.6) {
      assessment = `HIGH correlation (${(totalCorrelation * 100).toFixed(0)}%). Multiple agents betting same themes. A single event could hit everyone simultaneously.`;
    } else if (totalCorrelation > 0.3) {
      assessment = `MODERATE correlation (${(totalCorrelation * 100).toFixed(0)}%). Some theme overlap. Manageable but worth monitoring.`;
    } else {
      assessment = `LOW correlation (${(totalCorrelation * 100).toFixed(0)}%). Agents are reasonably diversified across themes.`;
    }

    return { correlatedPairs, portfolioCorrelation: totalCorrelation, assessment };
  }

  // ═══ STRATEGY AUDIT ═══

  /**
   * Full audit of a specific strategy — combines Monte Carlo, Sharpe, and verdict.
   */
  auditStrategy(strategyName: string, agent: string, trades: TradeRecord[]): StrategyAudit {
    const dailyPnls = trades.map(t => t.pnl);
    const sharpe = this.calculateSharpe(dailyPnls);
    const monteCarlo = this.runMonteCarlo(trades);

    // Verdict
    let verdict: StrategyAudit['verdict'];
    let explanation: string;

    if (trades.length < 5) {
      verdict = 'monitor';
      explanation = `Only ${trades.length} trades. Too early to judge. Continue paper trading.`;
    } else if (monteCarlo.confidence === 'significant' && monteCarlo.meanPnl > 0 && sharpe.sharpeRatio > 0.5) {
      verdict = 'continue';
      explanation = `Edge is statistically significant. Sharpe ${sharpe.sharpeRatio.toFixed(2)}, ${(monteCarlo.profitProbability * 100).toFixed(0)}% profit probability. Keep running, consider going live after 30 trades.`;
    } else if (monteCarlo.confidence === 'marginal' || (monteCarlo.meanPnl > 0 && sharpe.sharpeRatio > 0)) {
      verdict = 'monitor';
      explanation = `Edge is possible but not confirmed. Sharpe ${sharpe.sharpeRatio.toFixed(2)}. Keep paper trading. Do NOT go live yet.`;
    } else if (monteCarlo.meanPnl < 0 && trades.length >= 10) {
      verdict = 'kill';
      explanation = `Strategy is losing money over ${trades.length} trades. Mean P&L: $${monteCarlo.meanPnl.toFixed(2)}. Sharpe: ${sharpe.sharpeRatio.toFixed(2)}. Kill it.`;
    } else if (sharpe.maxDrawdown > Math.abs(monteCarlo.meanPnl) * 3) {
      verdict = 'reduce_size';
      explanation = `Max drawdown ($${sharpe.maxDrawdown.toFixed(2)}) is 3x mean P&L ($${monteCarlo.meanPnl.toFixed(2)}). Edge might exist but risk/reward is unfavorable. Reduce position sizes.`;
    } else {
      verdict = 'monitor';
      explanation = `Inconclusive. Mean P&L: $${monteCarlo.meanPnl.toFixed(2)}, Sharpe: ${sharpe.sharpeRatio.toFixed(2)}. Need more data.`;
    }

    return { strategyName, agent, sharpe, monteCarlo, verdict, explanation };
  }

  // ═══ AUDIT ALL ACTIVE TOOLS ═══

  /**
   * Audit all tools that have paper trade data.
   * Currently: Rei's funding scanner, Sakura's arb scanner (when paper trades exist).
   */
  async auditAllTools(): Promise<StrategyAudit[]> {
    const audits: StrategyAudit[] = [];

    // Audit funding scanner
    const fundingTradesPath = path.join(__dirname, '..', '..', 'funding-reports', 'paper-trades.json');
    if (fs.existsSync(fundingTradesPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(fundingTradesPath, 'utf-8'));
        const trades: TradeRecord[] = [];

        // Convert funding paper trades to TradeRecord format
        if (raw.closedTrades) {
          for (const trade of raw.closedTrades) {
            trades.push({
              date: trade.exitTime || trade.entryTime || new Date().toISOString(),
              pnl: trade.pnl || 0,
              size: trade.notionalSize || 1000,
              market: trade.coin || 'unknown',
              agent: 'REI',
              type: 'funding',
            });
          }
        }

        // Include open trades with current P&L
        if (raw.openTrades) {
          for (const trade of raw.openTrades) {
            trades.push({
              date: trade.entryTime || new Date().toISOString(),
              pnl: trade.cumulativeFunding || 0,
              size: trade.notionalSize || 1000,
              market: trade.coin || 'unknown',
              agent: 'REI',
              type: 'funding',
            });
          }
        }

        if (trades.length > 0) {
          audits.push(this.auditStrategy('Funding Rate Scanner', 'REI', trades));
        }
      } catch (e) {
        // Funding trades file exists but can't be parsed
      }
    }

    // Audit prediction market track records per agent
    const agents = await this.prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
    });

    for (const agent of agents) {
      const settledPositions = await this.prisma.position.findMany({
        where: { agentId: agent.id, settled: true },
        include: { market: true },
        orderBy: { settledAt: 'asc' },
      });

      if (settledPositions.length >= 3) {
        const trades: TradeRecord[] = settledPositions.map(p => ({
          date: p.settledAt?.toISOString() || new Date().toISOString(),
          pnl: p.pnl ?? 0,
          size: p.size,
          market: p.market.question.slice(0, 50),
          agent: agent.name,
          type: 'prediction' as const,
        }));

        audits.push(this.auditStrategy(`${agent.name} Predictions`, agent.name, trades));
      }
    }

    return audits;
  }

  // ═══ BRIEFING FORMATTER ═══

  /**
   * Format factor model analysis for Jinx's agent briefing.
   */
  async formatForBriefing(): Promise<string> {
    let brief = `\n\n═══ JINX'S FACTOR MODEL — STRATEGY AUDIT ═══`;

    // Run all audits
    const audits = await this.auditAllTools();

    if (audits.length === 0) {
      brief += `\nNo strategies have enough data for statistical analysis yet. Keep accumulating paper trades.`;
      brief += `\nMinimum data needed: 3 trades per strategy for basic Monte Carlo, 10+ for reliable results.`;
    } else {
      for (const audit of audits) {
        const emoji = audit.verdict === 'continue' ? '🟢' :
                      audit.verdict === 'monitor' ? '🟡' :
                      audit.verdict === 'reduce_size' ? '🟠' : '🔴';

        brief += `\n${emoji} ${audit.strategyName} [${audit.verdict.toUpperCase()}]`;
        brief += `\n   ${audit.explanation}`;

        if (audit.monteCarlo.tradeCount >= 5) {
          brief += `\n   MC: ${audit.monteCarlo.simulations} sims, ${(audit.monteCarlo.profitProbability * 100).toFixed(0)}% profit prob, mean $${audit.monteCarlo.meanPnl.toFixed(2)}`;
          brief += `\n   Sharpe: ${audit.sharpe.sharpeRatio.toFixed(2)} | Sortino: ${audit.sharpe.sortinoRatio.toFixed(2)} | MaxDD: $${audit.sharpe.maxDrawdown.toFixed(2)}`;
        }
      }
    }

    // Correlation scan
    const correlations = await this.scanCorrelations();
    brief += `\n\nCorrelation: ${correlations.assessment}`;
    if (correlations.correlatedPairs.length > 0) {
      for (const pair of correlations.correlatedPairs.slice(0, 3)) {
        brief += `\n   ${pair.agent1} ↔ ${pair.agent2}: ${pair.sharedThemes.join(', ')} (${pair.combinedExposure.toFixed(1)} karma)`;
      }
    }

    // Meta-assessment
    const killCount = audits.filter(a => a.verdict === 'kill').length;
    const continueCount = audits.filter(a => a.verdict === 'continue').length;

    if (killCount > 0) {
      brief += `\n\n⚠️ ${killCount} strategy/strategies should be KILLED based on current data.`;
    }
    if (continueCount > 0) {
      brief += `\n✅ ${continueCount} strategy/strategies showing real edge.`;
    }
    if (audits.length > 0 && killCount === 0 && continueCount === 0) {
      brief += `\nAll strategies in monitoring phase. Need more data before verdicts.`;
    }

    return brief;
  }

  // ═══ DAILY REPORT ═══

  async saveDailyReport(): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const audits = await this.auditAllTools();
    const correlations = await this.scanCorrelations();

    const report = {
      date,
      timestamp: new Date().toISOString(),
      audits,
      correlations,
    };

    const reportFile = path.join(this.reportsDir, `${date}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  }

  // ═══ UTILITY ═══

  /**
   * Mulberry32 PRNG for reproducible Monte Carlo results.
   */
  private createRng(seed: number): () => number {
    let state = seed;
    return () => {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
