/**
 * AGENT STATE SERVICE — Persistent memory between episodes
 * 
 * Each agent gets a state file at academy/state/{agent-name}.json
 * Updated at end of each episode by daily.ts
 * Read at start of each episode by buildAgentBriefing()
 * 
 * Refactored: Manifold bet tracking → Signal Board fitness scoring
 * 
 * Fitness formula: signal_score = (correct/total) * avg_confidence * time_decay
 * Calibration: tracked after 20 signals — penalizes over/under-confidence
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
// import { MarketService } from './market';  // OLD: Manifold bet mechanics
import { FundingScanner } from './funding-scanner';

const STATE_DIR = path.join(__dirname, '..', '..', 'state');
const MAX_RECENT_SIGNALS = 5;
const BANNED_PHRASE_EXPIRY_EPISODES = 3;
const CALIBRATION_THRESHOLD = 20; // signals needed before calibration scoring kicks in

export interface SignalRecord {
  run: number;
  asset: string;
  direction: 'long' | 'short' | 'flat';
  confidence: number;
  kelly_size: number;
  invalidation: string;
  data_sources: string[];
  timestamp: string;
  outcome?: 'correct' | 'incorrect' | 'pending';
  priceAtSignal?: number;
  priceAtEval?: number;
}

// OLD: kept for backward compat with existing state files
export interface AgentDecision {
  run: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  market: string;
  side: string;
  size: number;
  reasoning: string;
  outcome: string;
}

export interface ToolPerformance {
  name: string;
  paperPnl: number;
  openPaperTrades: number;
  bestTrade: string | null;
  worstTrade: string | null;
  totalScans: number;
}

export interface ConvergenceFlags {
  phrasesUsedByMultipleAgents: string[];
  bannedPhrases: { phrase: string; bannedAtRun: number }[];
}

export interface AgentState {
  agent: string;
  team: string;
  lastUpdated: string;
  runNumber: number;
  // NEW: Signal-based fitness tracking
  signals: {
    total: number;
    correct: number;
    incorrect: number;
    pending: number;
    accuracy: number | null;      // null until enough signals evaluated
    avgConfidence: number;
    calibrationScore: number | null; // null until CALIBRATION_THRESHOLD signals
  };
  recentSignals: SignalRecord[];
  // OLD: kept for backward compat
  record: {
    totalBets: number;
    wins: number;
    losses: number;
    exits: number;
    openPositions: number;
    winRate: number | null;
  };
  recentDecisions: AgentDecision[];
  toolPerformance: ToolPerformance | null;
  convergenceFlags: ConvergenceFlags;
  fitness: {
    current: number;
    trend: number[];
    tier: string;
    signalScore: number;  // (correct/total) * avgConfidence * time_decay
  };
  // OLD: kept for backward compat
  karma: {
    current: number;
    trend: number[];
    tier: string;
    locked: number;
  };
}

export class AgentStateService {
  constructor(
    private prisma: PrismaClient,
    // private marketService?: MarketService,  // OLD: no longer needed
  ) {}

  private getStatePath(agentName: string): string {
    return path.join(STATE_DIR, `${agentName.toLowerCase()}.json`);
  }

  /**
   * Load existing state or return null
   */
  loadState(agentName: string): AgentState | null {
    const filePath = this.getStatePath(agentName);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Save state to disk
   */
  private saveState(agentName: string, state: AgentState): void {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(this.getStatePath(agentName), JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Generate fresh state for an agent from DB data, merging with previous state
   */
  async generateState(agentId: string, agentName: string, runNumber: number): Promise<AgentState> {
    const previous = this.loadState(agentName);

    // Get agent data
    const agent = await this.prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
      include: { trustScore: true },
    });

    // ═══ NEW: Signal-based tracking ═══
    // Get all signal memories for this agent
    const signalMemories = await this.prisma.memory.findMany({
      where: {
        agentId,
        type: 'knowledge',
        content: { contains: '"type":"signal"' },
      },
      orderBy: { createdAt: 'desc' },
    });

    const recentSignals: SignalRecord[] = [];
    let totalSignals = 0;
    let correctSignals = 0;
    let incorrectSignals = 0;
    let pendingSignals = 0;
    let confidenceSum = 0;

    for (const mem of signalMemories) {
      try {
        const sig = JSON.parse(mem.content);
        if (sig.type !== 'signal') continue;
        totalSignals++;
        confidenceSum += sig.confidence ?? 0;

        const record: SignalRecord = {
          run: sig.episode ?? runNumber,
          asset: sig.asset,
          direction: sig.direction,
          confidence: sig.confidence,
          kelly_size: sig.kelly_size,
          invalidation: sig.invalidation,
          data_sources: sig.data_sources ?? [],
          timestamp: sig.timestamp ?? mem.createdAt.toISOString(),
          outcome: 'pending', // evaluated by daily.ts Phase 1.5
        };

        // Check if this signal has been evaluated (from previous state)
        const prevSignal = previous?.recentSignals?.find(
          s => s.asset === record.asset && s.timestamp === record.timestamp
        );
        if (prevSignal?.outcome && prevSignal.outcome !== 'pending') {
          record.outcome = prevSignal.outcome;
          if (record.outcome === 'correct') correctSignals++;
          else if (record.outcome === 'incorrect') incorrectSignals++;
        } else {
          pendingSignals++;
        }

        if (recentSignals.length < MAX_RECENT_SIGNALS) {
          recentSignals.push(record);
        }
      } catch { /* skip non-signal memories */ }
    }

    const evaluated = correctSignals + incorrectSignals;
    const accuracy = evaluated > 0 ? correctSignals / evaluated : null;
    const avgConfidence = totalSignals > 0 ? confidenceSum / totalSignals : 0;

    // Calibration score: how well does confidence match accuracy?
    // Perfect calibration = 1.0, over/under-confident = lower
    // Only calculated after CALIBRATION_THRESHOLD signals
    let calibrationScore: number | null = null;
    if (evaluated >= CALIBRATION_THRESHOLD && accuracy !== null) {
      const calibrationError = Math.abs(avgConfidence - accuracy);
      calibrationScore = Math.max(0, 1 - calibrationError * 2); // 0-1 scale
    }

    // Signal score: (correct/total) * avgConfidence * time_decay
    const TIME_DECAY = 0.95; // slight decay per episode
    const episodeAge = previous ? runNumber - (previous.runNumber ?? 0) : 0;
    const decayFactor = Math.pow(TIME_DECAY, episodeAge);
    const signalScore = accuracy !== null
      ? accuracy * avgConfidence * decayFactor * (calibrationScore ?? 1.0)
      : 0;

    // ═══ OLD: Bet-based tracking (backward compat) ═══
    const allPositions = await this.prisma.position.findMany({
      where: { agentId },
      include: { market: true },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []);  // graceful if position table doesn't exist

    const openPositions = allPositions.filter(p => !p.settled);
    const settledPositions = allPositions.filter(p => p.settled);
    const wins = settledPositions.filter(p => (p.pnl ?? 0) > 0).length;
    const losses = settledPositions.filter(p => (p.pnl ?? 0) < 0).length;
    const totalBets = allPositions.length;
    const winRate = (wins + losses) > 0 ? wins / (wins + losses) : null;

    // Fitness trend
    const currentFitness = agent.trustScore?.score ?? 50;
    const previousFitness = previous?.fitness?.current ?? currentFitness;
    const delta = currentFitness - previousFitness;
    const trend = previous?.fitness?.trend ?? previous?.karma?.trend ?? [];
    trend.push(delta);
    while (trend.length > 3) trend.shift();

    // Tool performance — agent-specific
    const toolPerf = await this.getToolPerformance(agentName);

    // Convergence flags — carry forward, expire old bans
    const convergenceFlags: ConvergenceFlags = {
      phrasesUsedByMultipleAgents: previous?.convergenceFlags.phrasesUsedByMultipleAgents ?? [],
      bannedPhrases: (previous?.convergenceFlags.bannedPhrases ?? [])
        .filter(bp => runNumber - bp.bannedAtRun < BANNED_PHRASE_EXPIRY_EPISODES),
    };

    const state: AgentState = {
      agent: agentName,
      team: agent.academyClass ?? 'PRISM',
      lastUpdated: new Date().toISOString(),
      runNumber,
      signals: {
        total: totalSignals,
        correct: correctSignals,
        incorrect: incorrectSignals,
        pending: pendingSignals,
        accuracy,
        avgConfidence,
        calibrationScore,
      },
      recentSignals,
      record: { totalBets, wins, losses, exits: 0, openPositions: openPositions.length, winRate },
      recentDecisions: [],  // deprecated — kept for compat
      toolPerformance: toolPerf,
      convergenceFlags,
      fitness: {
        current: currentFitness,
        trend,
        tier: agent.trustScore?.tier ?? 'rising',
        signalScore,
      },
      karma: {
        current: currentFitness,  // alias fitness as karma for compat
        trend,
        tier: agent.trustScore?.tier ?? 'rising',
        locked: 0,
      },
    };

    this.saveState(agentName, state);
    return state;
  }

  /**
   * Get tool performance for agent-specific tools
   */
  private async getToolPerformance(agentName: string): Promise<ToolPerformance | null> {
    switch (agentName) {
      case 'REI': {
        try {
          const scanner = new FundingScanner();
          return {
            name: 'Funding Rate Scanner',
            paperPnl: scanner.getCumulativePnl(),
            openPaperTrades: scanner.getOpenTradeCount(),
            bestTrade: null, // TODO: extract from reports
            worstTrade: null,
            totalScans: this.countFundingReports(),
          };
        } catch {
          return null;
        }
      }
      // TODO: Add SAKURA arbitrage, JACKBOT temporal edge, etc.
      default:
        return null;
    }
  }

  private countFundingReports(): number {
    const reportsDir = path.join(__dirname, '..', '..', 'funding-reports');
    if (!fs.existsSync(reportsDir)) return 0;
    return fs.readdirSync(reportsDir).filter(f => f.endsWith('.json')).length;
  }

  /**
   * Update all active agents' state files — called at end of daily.ts
   */
  async updateAllStates(runNumber: number): Promise<void> {
    const agents = await this.prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
    });

    console.log(`\n─── Updating Agent State Files ───\n`);
    for (const agent of agents) {
      const state = await this.generateState(agent.id, agent.name, runNumber);
      const acc = state.signals.accuracy !== null ? `${(state.signals.accuracy * 100).toFixed(0)}%` : 'n/a';
      console.log(`  📋 ${agent.name}: ${state.signals.total} signals (${acc} accuracy), ${state.fitness.current.toFixed(1)} fitness`);
    }
    console.log(`  ✅ ${agents.length} state files saved to ${STATE_DIR}\n`);
  }

  /**
   * Format state for injection into agent briefing — compressed, ~150 tokens
   */
  formatForBriefing(agentName: string): string {
    const state = this.loadState(agentName);
    if (!state) return '';

    const lines: string[] = [
      `\nYOUR TRACK RECORD (only you see this):`,
    ];

    // Signal record
    if (state.signals) {
      const acc = state.signals.accuracy !== null
        ? `${(state.signals.accuracy * 100).toFixed(0)}% accuracy`
        : 'accuracy pending';
      lines.push(`Signals: ${state.signals.total} total, ${state.signals.correct} correct, ${state.signals.incorrect} incorrect, ${state.signals.pending} pending (${acc})`);
      
      if (state.signals.calibrationScore !== null) {
        lines.push(`Calibration: ${(state.signals.calibrationScore * 100).toFixed(0)}% (how well your confidence matches your accuracy)`);
      }
      lines.push(`Avg confidence: ${(state.signals.avgConfidence * 100).toFixed(0)}%`);
    }

    // Recent signals
    if (state.recentSignals && state.recentSignals.length > 0) {
      const sigStr = state.recentSignals
        .map(s => `${s.direction.toUpperCase()} ${s.asset} @${(s.confidence * 100).toFixed(0)}% (${s.outcome ?? 'pending'})`)
        .join(', ');
      lines.push(`Recent signals: ${sigStr}`);
    }

    // Fitness
    if (state.fitness) {
      const trendStr = state.fitness.trend.map(t => {
        if (t > 0) return `↑${t.toFixed(1)}`;
        if (t < 0) return `↓${Math.abs(t).toFixed(1)}`;
        return 'flat';
      }).join(' → ');
      lines.push(`Fitness: ${state.fitness.current.toFixed(1)} (${state.fitness.tier}) | Signal score: ${state.fitness.signalScore.toFixed(3)}`);
      lines.push(`Fitness trend: ${trendStr}`);
    }

    // Tool P&L
    if (state.toolPerformance) {
      const tp = state.toolPerformance;
      lines.push(`Tool P&L: ${tp.name} $${tp.paperPnl.toFixed(2)} (${tp.openPaperTrades} open paper trades, ${tp.totalScans} scans)`);
    }

    // Banned phrases
    const banned = state.convergenceFlags?.bannedPhrases?.map(bp => bp.phrase) ?? [];
    if (banned.length > 0) {
      lines.push(`\nBANNED PHRASES (do not use): ${banned.map(p => `"${p}"`).join(', ')}`);
    }

    return lines.join('\n');
  }
}
