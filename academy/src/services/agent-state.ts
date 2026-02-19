/**
 * AGENT STATE SERVICE — Persistent memory between episodes
 * 
 * Each agent gets a state file at academy/state/{agent-name}.json
 * Updated at end of each episode by daily.ts
 * Read at start of each episode by buildAgentBriefing()
 * 
 * This is the "repository as system of record" principle from the Codex blog:
 * What the agent can't see doesn't exist. Give them their own track record.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { MarketService } from './market';
import { FundingScanner } from './funding-scanner';

const STATE_DIR = path.join(__dirname, '..', '..', 'state');
const MAX_RECENT_DECISIONS = 5;
const BANNED_PHRASE_EXPIRY_EPISODES = 3;

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
    private marketService?: MarketService,
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

    // Get all positions (settled and open)
    const allPositions = await this.prisma.position.findMany({
      where: { agentId },
      include: { market: true },
      orderBy: { createdAt: 'desc' },
    });

    const openPositions = allPositions.filter(p => !p.settled);
    const settledPositions = allPositions.filter(p => p.settled);

    // Calculate record
    const wins = settledPositions.filter(p => (p.pnl ?? 0) > 0).length;
    const losses = settledPositions.filter(p => (p.pnl ?? 0) < 0).length;

    // Get exits (positions that were sold, not resolved)
    const exitEvents = await this.prisma.trustEvent.count({
      where: { agentId, type: 'exit_position' },
    });

    const totalBets = allPositions.length;
    const winRate = (wins + losses) > 0 ? wins / (wins + losses) : null;

    // Build recent decisions from positions
    const recentDecisions: AgentDecision[] = [];
    for (const pos of allPositions.slice(0, MAX_RECENT_DECISIONS)) {
      recentDecisions.push({
        run: runNumber, // We don't track per-position run yet, use current
        action: pos.settled ? 'SELL' : 'BUY',
        market: pos.market.question.slice(0, 60),
        side: pos.side,
        size: pos.size,
        reasoning: pos.reasoning?.slice(0, 100) ?? '',
        outcome: pos.settled
          ? `${(pos.pnl ?? 0) >= 0 ? '+' : ''}${(pos.pnl ?? 0).toFixed(1)} karma`
          : 'open',
      });
    }

    // Calculate locked karma
    const lockedKarma = openPositions.reduce((sum, p) => {
      const cost = p.side === 'YES'
        ? p.size * p.entryProb
        : p.size * (1 - p.entryProb);
      return sum + cost;
    }, 0);

    // Karma trend — use previous state + current delta
    const currentKarma = agent.trustScore?.score ?? 50;
    const previousKarma = previous?.karma.current ?? currentKarma;
    const delta = currentKarma - previousKarma;
    const trend = previous?.karma.trend ?? [];
    trend.push(delta);
    // Keep last 3
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
      record: {
        totalBets,
        wins,
        losses,
        exits: exitEvents,
        openPositions: openPositions.length,
        winRate,
      },
      recentDecisions,
      toolPerformance: toolPerf,
      convergenceFlags,
      karma: {
        current: currentKarma,
        trend,
        tier: agent.trustScore?.tier ?? 'rising',
        locked: lockedKarma,
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
      console.log(`  📋 ${agent.name}: ${state.record.totalBets} bets, ${state.record.wins}W/${state.record.losses}L, ${state.karma.current.toFixed(1)} karma`);
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

    // Recent decisions
    if (state.recentDecisions.length > 0) {
      const decisionStr = state.recentDecisions
        .map(d => `${d.action} ${d.side} "${d.market.slice(0, 30)}" (${d.outcome})`)
        .join(', ');
      lines.push(`Last ${state.recentDecisions.length} decisions: ${decisionStr}`);
    }

    // Record
    const { wins, losses, exits, openPositions } = state.record;
    lines.push(`Record: ${wins}W / ${losses}L / ${exits} exits / ${openPositions} open positions`);

    // Tool P&L
    if (state.toolPerformance) {
      const tp = state.toolPerformance;
      lines.push(`Tool P&L: ${tp.name} $${tp.paperPnl.toFixed(2)} (${tp.openPaperTrades} open paper trades, ${tp.totalScans} scans)`);
    }

    // Karma trend
    const trendStr = state.karma.trend.map(t => {
      if (t > 0) return `↑${t.toFixed(1)}`;
      if (t < 0) return `↓${Math.abs(t).toFixed(1)}`;
      return 'flat';
    }).join(' → ');
    lines.push(`Karma trend: ${trendStr}`);

    // Win rate
    if (state.record.winRate !== null) {
      lines.push(`Win rate: ${(state.record.winRate * 100).toFixed(0)}%`);
    }

    // Banned phrases
    const banned = state.convergenceFlags.bannedPhrases.map(bp => bp.phrase);
    if (banned.length > 0) {
      lines.push(`\nBANNED PHRASES (do not use): ${banned.map(p => `"${p}"`).join(', ')}`);
    }

    return lines.join('\n');
  }
}
