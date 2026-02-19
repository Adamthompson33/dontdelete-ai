/**
 * WREN'S KELLY ENGINE — Position Sizing Optimizer
 * 
 * Pure math. No external API. The tool that makes every other tool better.
 * 
 * Takes any agent's edge estimate and track record, outputs optimal bet size.
 * Kelly criterion: f* = (bp - q) / b
 *   where b = odds received, p = probability of winning, q = 1-p
 * 
 * For prediction markets:
 *   - Edge = agent's estimated probability - market probability
 *   - Odds = payout ratio at current market price
 *   - Bankroll = available (unlocked) karma
 * 
 * Wren doesn't predict. She sizes. Every other agent finds opportunities.
 * Wren tells them exactly how much to bet.
 * 
 * Usage: Shared library — called by other agents' briefings and by Wren's own analysis.
 * Integration: Wire into Wren's briefing in runtime.ts buildAgentBriefing()
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// ═══ TYPES ═══

export interface KellyInput {
  /** Agent's estimated true probability (0-1) */
  estimatedProb: number;
  /** Current market probability (0-1) */
  marketProb: number;
  /** Available bankroll (unlocked karma) */
  bankroll: number;
  /** Side the agent wants to bet: YES or NO */
  side: 'YES' | 'NO';
}

export interface KellyResult {
  /** Optimal fraction of bankroll to bet (0-1) */
  kellyFraction: number;
  /** Half-Kelly recommendation (safer, standard practice) */
  halfKelly: number;
  /** Quarter-Kelly for high-uncertainty situations */
  quarterKelly: number;
  /** Actual recommended karma amount (using half-Kelly) */
  recommendedSize: number;
  /** Maximum recommended size (full Kelly, aggressive) */
  maxSize: number;
  /** Minimum size worth betting (below this, edge too thin) */
  minSize: number;
  /** Expected value per unit bet */
  expectedValue: number;
  /** Edge: difference between estimated and market probability */
  edge: number;
  /** Whether the bet has positive expected value */
  hasEdge: boolean;
  /** Risk of ruin at this size over N bets */
  ruinProbability: number;
  /** Confidence assessment */
  confidence: 'high' | 'medium' | 'low' | 'no_edge';
  /** Human-readable recommendation */
  recommendation: string;
}

export interface PortfolioAnalysis {
  /** Total karma locked across all positions */
  totalLocked: number;
  /** Available karma for new bets */
  availableBankroll: number;
  /** Number of open positions */
  openPositions: number;
  /** Concentration risk: largest position as % of total locked */
  concentrationRisk: number;
  /** Correlation risk: how many positions share the same underlying (e.g., multiple BTC markets) */
  correlatedPositions: { theme: string; count: number; totalKarma: number }[];
  /** Portfolio heat: total locked / total karma (0-1, above 0.5 is dangerous) */
  portfolioHeat: number;
  /** Overall assessment */
  assessment: string;
}

export interface AgentTrackRecord {
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWinSize: number;
  avgLossSize: number;
  profitFactor: number; // gross wins / gross losses
  longestLosingStreak: number;
  currentStreak: number; // positive = winning, negative = losing
}

// ═══ KELLY ENGINE ═══

export class KellyEngine {
  private prisma: PrismaClient;
  private reportsDir: string;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.reportsDir = path.join(__dirname, '..', '..', 'kelly-reports');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  // ═══ CORE KELLY CALCULATION ═══

  /**
   * Calculate optimal position size using Kelly criterion.
   * Returns half-Kelly as the default recommendation (industry standard).
   * 
   * Kelly fraction = (bp - q) / b
   * where:
   *   b = net odds received on the bet (payout ratio - 1)
   *   p = probability of winning
   *   q = 1 - p (probability of losing)
   * 
   * For prediction markets:
   *   If betting YES at market price m, agent believes true prob is p:
   *     - Cost per share = m (the market probability)
   *     - Payout if correct = 1
   *     - Net odds b = (1 - m) / m
   *     - Kelly f* = (b * p - q) / b = p - m*q/(1-m) = (p - m) / (1 - m)
   * 
   *   If betting NO at market price m, agent believes true prob of YES is p:
   *     - Cost per share = (1 - m)
   *     - Payout if correct = 1
   *     - Net odds b = m / (1 - m)
   *     - Kelly f* = ((1-p) - (1-m)) / m = (m - p) / m
   */
  calculateKelly(input: KellyInput): KellyResult {
    const { estimatedProb, marketProb, bankroll, side } = input;

    // Validate inputs
    const p = Math.max(0.01, Math.min(0.99, estimatedProb));
    const m = Math.max(0.01, Math.min(0.99, marketProb));

    let kellyFraction: number;
    let edge: number;
    let expectedValue: number;

    if (side === 'YES') {
      // Betting YES: we think true prob > market prob
      edge = p - m;
      kellyFraction = edge > 0 ? (p - m) / (1 - m) : 0;
      // EV per unit wagered on YES: p * (1/m - 1) - (1-p) * 1 = p/m - 1
      expectedValue = (p / m) - 1;
    } else {
      // Betting NO: we think true prob of YES < market prob (true prob of NO > 1-m)
      edge = m - p; // edge is how much lower we think YES prob is
      kellyFraction = edge > 0 ? (m - p) / m : 0;
      // EV per unit wagered on NO: (1-p) * (1/(1-m) - 1) - p * 1 = (1-p)/(1-m) - 1
      expectedValue = ((1 - p) / (1 - m)) - 1;
    }

    // Cap Kelly at 25% of bankroll (never go full Kelly in practice)
    kellyFraction = Math.min(kellyFraction, 0.25);

    const halfKelly = kellyFraction / 2;
    const quarterKelly = kellyFraction / 4;

    const recommendedSize = Math.round(halfKelly * bankroll * 10) / 10; // half-Kelly
    const maxSize = Math.round(kellyFraction * bankroll * 10) / 10; // full Kelly
    const minSize = 1; // minimum 1 karma to be worth the transaction cost

    const hasEdge = edge > 0.02; // need at least 2% edge to bother

    // Estimate ruin probability using simplified formula
    // P(ruin) ≈ (q/p)^(bankroll/betSize) for favorable games
    const ruinProbability = this.estimateRuinProbability(
      side === 'YES' ? p : (1 - p),
      recommendedSize,
      bankroll
    );

    // Confidence based on edge size and bankroll
    let confidence: 'high' | 'medium' | 'low' | 'no_edge';
    if (!hasEdge) {
      confidence = 'no_edge';
    } else if (edge > 0.15 && bankroll > 20) {
      confidence = 'high';
    } else if (edge > 0.05 && bankroll > 10) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Build recommendation
    let recommendation: string;
    if (!hasEdge) {
      recommendation = `No edge detected (${(edge * 100).toFixed(1)}% < 2% threshold). Skip this bet.`;
    } else if (recommendedSize < minSize) {
      recommendation = `Edge exists (${(edge * 100).toFixed(1)}%) but bankroll too small for meaningful position. Skip.`;
    } else if (ruinProbability > 0.1) {
      recommendation = `Edge ${(edge * 100).toFixed(1)}% but ruin risk ${(ruinProbability * 100).toFixed(0)}% too high. Use quarter-Kelly: ${Math.round(quarterKelly * bankroll * 10) / 10} karma.`;
    } else {
      recommendation = `${side} at ${recommendedSize} karma (half-Kelly). Edge: ${(edge * 100).toFixed(1)}%. EV: ${(expectedValue * 100).toFixed(1)}% per unit. Max: ${maxSize} karma.`;
    }

    return {
      kellyFraction,
      halfKelly,
      quarterKelly,
      recommendedSize: Math.max(0, recommendedSize),
      maxSize: Math.max(0, maxSize),
      minSize,
      expectedValue,
      edge,
      hasEdge,
      ruinProbability,
      confidence,
      recommendation,
    };
  }

  // ═══ PORTFOLIO ANALYSIS ═══

  /**
   * Analyze an agent's current portfolio for concentration and correlation risk.
   */
  async analyzePortfolio(agentId: string): Promise<PortfolioAnalysis> {
    const agent = await this.prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
      include: { trustScore: true },
    });

    const positions = await this.prisma.position.findMany({
      where: { agentId, settled: false },
      include: { market: true },
    });

    const totalKarma = agent.trustScore?.score ?? 100;
    const totalLocked = positions.reduce((sum, p) => {
      const cost = p.side === 'YES'
        ? p.size * p.entryProb
        : p.size * (1 - p.entryProb);
      return sum + cost;
    }, 0);

    const availableBankroll = totalKarma - totalLocked;
    const openPositions = positions.length;

    // Concentration risk — largest single position
    const positionSizes = positions.map(p => {
      return p.side === 'YES' ? p.size * p.entryProb : p.size * (1 - p.entryProb);
    });
    const maxPosition = positionSizes.length > 0 ? Math.max(...positionSizes) : 0;
    const concentrationRisk = totalLocked > 0 ? maxPosition / totalLocked : 0;

    // Correlation risk — group positions by theme
    const themes = new Map<string, { count: number; totalKarma: number }>();
    for (const pos of positions) {
      const q = pos.market.question.toLowerCase();
      let theme = 'other';
      if (q.includes('bitcoin') || q.includes('btc') || q.includes('crypto')) theme = 'crypto';
      else if (q.includes('trump') || q.includes('impeach') || q.includes('congress')) theme = 'politics';
      else if (q.includes('ai') || q.includes('model') || q.includes('coding') || q.includes('gpt')) theme = 'ai_tech';
      else if (q.includes('nba') || q.includes('nfl') || q.includes('ufc')) theme = 'sports';

      const existing = themes.get(theme) || { count: 0, totalKarma: 0 };
      const cost = pos.side === 'YES' ? pos.size * pos.entryProb : pos.size * (1 - pos.entryProb);
      themes.set(theme, { count: existing.count + 1, totalKarma: existing.totalKarma + cost });
    }

    const correlatedPositions = Array.from(themes.entries())
      .filter(([_, v]) => v.count > 1)
      .map(([theme, v]) => ({ theme, count: v.count, totalKarma: v.totalKarma }));

    // Portfolio heat
    const portfolioHeat = totalKarma > 0 ? totalLocked / totalKarma : 0;

    // Assessment
    let assessment: string;
    if (portfolioHeat > 0.6) {
      assessment = `DANGEROUS: ${(portfolioHeat * 100).toFixed(0)}% of karma locked. One bad resolution wipes you. Reduce exposure immediately.`;
    } else if (portfolioHeat > 0.4) {
      assessment = `HOT: ${(portfolioHeat * 100).toFixed(0)}% locked. Room for 1-2 more small positions max. Be selective.`;
    } else if (portfolioHeat > 0.2) {
      assessment = `WARM: ${(portfolioHeat * 100).toFixed(0)}% locked. Healthy exposure. Room for strategic additions.`;
    } else if (openPositions === 0) {
      assessment = `COLD: No positions. Inactivity decay is costing you 2 karma per episode. You need at least 2 positions.`;
    } else {
      assessment = `COOL: ${(portfolioHeat * 100).toFixed(0)}% locked. Underexposed. Consider adding positions where you have edge.`;
    }

    if (correlatedPositions.length > 0) {
      const worst = correlatedPositions.sort((a, b) => b.totalKarma - a.totalKarma)[0];
      assessment += ` WARNING: ${worst.count} positions in '${worst.theme}' (${worst.totalKarma.toFixed(1)} karma). Correlated risk.`;
    }

    return {
      totalLocked,
      availableBankroll,
      openPositions,
      concentrationRisk,
      correlatedPositions,
      portfolioHeat,
      assessment,
    };
  }

  // ═══ TRACK RECORD ANALYSIS ═══

  /**
   * Build an agent's track record from settlement history.
   * Used to adjust Kelly sizing — agents with losing streaks get smaller sizes.
   */
  async getTrackRecord(agentId: string): Promise<AgentTrackRecord> {
    // Get all settled positions for this agent
    const settledPositions = await this.prisma.position.findMany({
      where: { agentId, settled: true },
      include: { market: true },
      orderBy: { settledAt: 'asc' },
    });

    let wins = 0;
    let losses = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let longestLosingStreak = 0;
    let currentStreak = 0;
    let tempLosingStreak = 0;

    for (const pos of settledPositions) {
      const pnl = pos.pnl ?? 0;
      if (pnl > 0) {
        wins++;
        grossWins += pnl;
        tempLosingStreak = 0;
        currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
      } else {
        losses++;
        grossLosses += Math.abs(pnl);
        tempLosingStreak++;
        longestLosingStreak = Math.max(longestLosingStreak, tempLosingStreak);
        currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
      }
    }

    // Also count exit events (voluntary sells) — these are usually small losses
    const exitEvents = await this.prisma.trustEvent.findMany({
      where: { agentId, type: 'exit_position' },
    });

    const totalBets = wins + losses + exitEvents.length;
    const winRate = totalBets > 0 ? wins / totalBets : 0;
    const avgWinSize = wins > 0 ? grossWins / wins : 0;
    const avgLossSize = losses > 0 ? grossLosses / losses : 0;
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

    return {
      totalBets,
      wins,
      losses,
      winRate,
      avgWinSize,
      avgLossSize,
      profitFactor,
      longestLosingStreak,
      currentStreak,
    };
  }

  // ═══ KELLY WITH TRACK RECORD ADJUSTMENT ═══

  /**
   * Adjusted Kelly that accounts for the agent's actual track record.
   * Agents with losing streaks get smaller recommended sizes.
   * Agents with no track record get quarter-Kelly (conservative default).
   */
  calculateAdjustedKelly(input: KellyInput, trackRecord: AgentTrackRecord): KellyResult {
    const baseResult = this.calculateKelly(input);

    if (!baseResult.hasEdge) return baseResult;

    // Adjustment factors
    let adjustmentMultiplier = 1.0;
    let adjustmentReason = '';

    // No track record → very conservative
    if (trackRecord.totalBets < 5) {
      adjustmentMultiplier = 0.25;
      adjustmentReason = 'Limited track record (<5 bets) — using quarter-Kelly';
    }
    // Losing streak → reduce size
    else if (trackRecord.currentStreak < -3) {
      adjustmentMultiplier = 0.25;
      adjustmentReason = `Losing streak (${Math.abs(trackRecord.currentStreak)} in a row) — using quarter-Kelly`;
    }
    else if (trackRecord.currentStreak < -1) {
      adjustmentMultiplier = 0.5;
      adjustmentReason = `Recent losses — using reduced half-Kelly`;
    }
    // Zero win rate with meaningful sample
    else if (trackRecord.winRate === 0 && trackRecord.totalBets >= 5) {
      adjustmentMultiplier = 0.1;
      adjustmentReason = `0% win rate over ${trackRecord.totalBets} bets — EXTREME caution, 10% Kelly`;
    }
    // Good track record → standard half-Kelly
    else if (trackRecord.winRate > 0.4 && trackRecord.profitFactor > 1.5) {
      adjustmentMultiplier = 1.0;
      adjustmentReason = `Strong track record (${(trackRecord.winRate * 100).toFixed(0)}% win rate) — standard half-Kelly`;
    }

    const adjustedRecommended = Math.round(baseResult.recommendedSize * adjustmentMultiplier * 10) / 10;

    return {
      ...baseResult,
      recommendedSize: Math.max(0, adjustedRecommended),
      recommendation: `${adjustmentReason}. ${baseResult.recommendation.replace(
        /at \d+\.?\d* karma/,
        `at ${adjustedRecommended} karma`
      )}`,
    };
  }

  // ═══ BATCH ANALYSIS FOR ALL OPEN MARKETS ═══

  /**
   * Analyze all open markets for a given agent.
   * Returns Kelly sizing for each market the agent doesn't already hold.
   */
  async analyzeMarkets(agentId: string, agentEstimates?: Map<string, { prob: number; side: 'YES' | 'NO' }>): Promise<{
    marketId: string;
    question: string;
    marketProb: number;
    kellyResult: KellyResult;
  }[]> {
    const portfolio = await this.analyzePortfolio(agentId);
    const trackRecord = await this.getTrackRecord(agentId);

    // Get markets the agent doesn't already hold
    const heldMarketIds = (await this.prisma.position.findMany({
      where: { agentId, settled: false },
      select: { marketId: true },
    })).map(p => p.marketId);

    const openMarkets = await this.prisma.market.findMany({
      where: { status: 'open', id: { notIn: heldMarketIds } },
    });

    const results: {
      marketId: string;
      question: string;
      marketProb: number;
      kellyResult: KellyResult;
    }[] = [];

    for (const market of openMarkets) {
      const marketProb = market.currentProb ?? 0.5;

      // If agent provided estimates, use those. Otherwise, scan for obvious mispricings.
      let estimatedProb: number;
      let side: 'YES' | 'NO';

      if (agentEstimates && agentEstimates.has(market.id)) {
        const est = agentEstimates.get(market.id)!;
        estimatedProb = est.prob;
        side = est.side;
      } else {
        // Default: look for extreme markets where Kelly might find edge
        // Markets below 10% or above 90% often have structural mispricings
        if (marketProb < 0.10) {
          estimatedProb = marketProb * 0.5; // Agent thinks it's even less likely
          side = 'NO';
        } else if (marketProb > 0.90) {
          estimatedProb = marketProb + (1 - marketProb) * 0.5; // Agent thinks it's even more likely
          side = 'YES';
        } else {
          continue; // Skip markets without clear edge signal
        }
      }

      const kellyResult = this.calculateAdjustedKelly(
        {
          estimatedProb,
          marketProb,
          bankroll: portfolio.availableBankroll,
          side,
        },
        trackRecord
      );

      if (kellyResult.hasEdge) {
        results.push({
          marketId: market.id,
          question: market.question,
          marketProb,
          kellyResult,
        });
      }
    }

    // Sort by expected value
    results.sort((a, b) => b.kellyResult.expectedValue - a.kellyResult.expectedValue);

    return results;
  }

  // ═══ BRIEFING FORMATTER ═══

  /**
   * Format Kelly analysis for injection into Wren's agent briefing.
   * Also callable by other agents' briefings for cross-agent sizing.
   */
  async formatForBriefing(agentId: string, agentName: string): Promise<string> {
    const portfolio = await this.analyzePortfolio(agentId);
    const trackRecord = await this.getTrackRecord(agentId);

    let brief = `\n\n═══ KELLY ENGINE ANALYSIS (${agentName}) ═══`;

    // Portfolio status
    brief += `\nPortfolio: ${portfolio.openPositions} positions, ${portfolio.totalLocked.toFixed(1)} karma locked, ${portfolio.availableBankroll.toFixed(1)} available`;
    brief += `\nHeat: ${(portfolio.portfolioHeat * 100).toFixed(0)}% — ${portfolio.assessment}`;

    // Track record
    brief += `\nTrack Record: ${trackRecord.wins}W/${trackRecord.losses}L (${(trackRecord.winRate * 100).toFixed(0)}% win rate)`;
    if (trackRecord.currentStreak !== 0) {
      const streakType = trackRecord.currentStreak > 0 ? 'winning' : 'losing';
      brief += ` | Current ${streakType} streak: ${Math.abs(trackRecord.currentStreak)}`;
    }
    if (trackRecord.profitFactor > 0 && trackRecord.profitFactor !== Infinity) {
      brief += ` | Profit factor: ${trackRecord.profitFactor.toFixed(2)}`;
    }

    // Correlation risk
    if (portfolio.correlatedPositions.length > 0) {
      brief += `\n⚠️ Correlated risk:`;
      for (const cp of portfolio.correlatedPositions) {
        brief += ` ${cp.theme} (${cp.count} positions, ${cp.totalKarma.toFixed(1)} karma)`;
      }
    }

    return brief;
  }

  /**
   * Format a comprehensive briefing for Wren specifically — includes all agent analyses.
   */
  async formatWrenBriefing(): Promise<string> {
    const agents = await this.prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
      include: { trustScore: true },
    });

    let brief = `\n\n═══ WREN'S KELLY ENGINE — PORTFOLIO OVERVIEW ═══`;

    for (const agent of agents) {
      const portfolio = await this.analyzePortfolio(agent.id);
      const trackRecord = await this.getTrackRecord(agent.id);

      const heat = (portfolio.portfolioHeat * 100).toFixed(0);
      const heatEmoji = portfolio.portfolioHeat > 0.5 ? '🔴' : portfolio.portfolioHeat > 0.3 ? '🟡' : '🟢';

      brief += `\n${heatEmoji} ${agent.name}: ${heat}% heat | ${portfolio.openPositions} pos | ${portfolio.availableBankroll.toFixed(0)} avail | ${trackRecord.wins}W/${trackRecord.losses}L`;

      // Flag dangerous situations
      if (portfolio.portfolioHeat > 0.5) {
        brief += ` ⚠️ OVEREXPOSED`;
      }
      if (trackRecord.winRate === 0 && trackRecord.totalBets >= 5) {
        brief += ` ⚠️ 0% WIN RATE`;
      }
      if (portfolio.openPositions === 0) {
        brief += ` ⚠️ INACTIVE (decay -2/ep)`;
      }
    }

    // Cross-agent sizing recommendations
    brief += `\n\nSIZING NOTES:`;
    brief += `\n- All agents at 0% win rate: use quarter-Kelly maximum on any new position`;
    brief += `\n- Prophet at ${agents.find(a => a.name === 'PROPHET')?.trustScore?.score?.toFixed(0) ?? '?'} karma with heavy lock — high ruin risk`;
    brief += `\n- Agents with 0 positions need to enter at least 2 markets to avoid decay`;

    return brief;
  }

  // ═══ DAILY REPORT ═══

  /**
   * Save daily Kelly analysis report.
   */
  async saveDailyReport(): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const agents = await this.prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
    });

    const report: any = {
      date,
      timestamp: new Date().toISOString(),
      agents: {},
    };

    for (const agent of agents) {
      const portfolio = await this.analyzePortfolio(agent.id);
      const trackRecord = await this.getTrackRecord(agent.id);
      report.agents[agent.name] = { portfolio, trackRecord };
    }

    const reportFile = path.join(this.reportsDir, `${date}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  }

  // ═══ UTILITY ═══

  /**
   * Simplified ruin probability estimate.
   * Uses geometric random walk approximation.
   */
  private estimateRuinProbability(winProb: number, betSize: number, bankroll: number): number {
    if (betSize <= 0 || bankroll <= 0) return 0;
    if (winProb <= 0.5) return 1; // No edge = eventual ruin

    // Approximate: P(ruin) ≈ ((1-p)/p)^(B/b)
    // where p = win prob, B = bankroll, b = bet size
    const ratio = (1 - winProb) / winProb;
    const exponent = bankroll / betSize;

    // Clamp to avoid overflow
    if (exponent > 100) return 0; // Effectively zero ruin risk
    return Math.pow(ratio, exponent);
  }
}
