/**
 * MarketService — manages Academy prediction markets and agent positions
 * 
 * Helena opens markets (selecting from real Manifold data).
 * Agents take positions (paper trades backed by Karma scores).
 * Markets settle when real-world outcomes resolve.
 */

import { PrismaClient } from '@prisma/client';
import { PriceFeedService, MarketData } from './price-feed';

export interface SettlementResult {
  marketId: string;
  question: string;
  outcome: string;
  winners: { agentId: string; agentName: string; pnl: number }[];
  losers: { agentId: string; agentName: string; pnl: number }[];
}

export interface TradeDecision {
  side: 'YES' | 'NO';
  size: number;         // karma points to wager
  confidence: number;   // 0-1
  reasoning: string;    // agent's analysis
}

export class MarketService {
  constructor(
    private prisma: PrismaClient,
    private priceFeed: PriceFeedService,
  ) {}

  /**
   * Helena opens a market for the Academy (imports from Manifold)
   */
  async openMarket(externalId: string, closesAt?: Date): Promise<any> {
    // Check if already open
    const existing = await this.prisma.market.findUnique({ where: { externalId } });
    if (existing) return existing;

    // Fetch from Manifold
    const data = await this.priceFeed.getMarket(externalId);

    return this.prisma.market.create({
      data: {
        externalId: data.id,
        source: data.source,
        question: data.question,
        description: data.description,
        url: data.url,
        category: data.category,
        currentProb: data.probability,
        volume: data.volume,
        liquidity: data.liquidity,
        status: 'open',
        openedBy: 'helena',
        closesAt: closesAt || (data.closeTime ? new Date(data.closeTime) : null),
      },
    });
  }

  /**
   * Agent places a paper trade position
   */
  async placePosition(
    agentId: string,
    marketId: string,
    decision: TradeDecision,
  ): Promise<any> {
    const market = await this.prisma.market.findUniqueOrThrow({ where: { id: marketId } });
    if (market.status !== 'open') throw new Error(`Market ${marketId} is not open`);

    // Check agent doesn't already have a position
    const existing = await this.prisma.position.findUnique({
      where: { agentId_marketId: { agentId, marketId } },
    });
    if (existing) throw new Error(`Agent already has a position in this market`);

    // Get agent's current karma
    const trust = await this.prisma.trustScore.findUnique({ where: { agentId } });
    const karma = trust?.score ?? 50;

    // Validate size doesn't exceed karma
    if (decision.size > karma) {
      throw new Error(`Bet size ${decision.size} exceeds karma ${karma}`);
    }

    const entryProb = market.currentProb ?? 0.5;

    // Calculate cost (karma locked when bet is placed)
    // Buying YES at prob P costs: size * P
    // Buying NO at prob P costs: size * (1 - P)
    const cost = decision.side === 'YES'
      ? decision.size * entryProb
      : decision.size * (1 - entryProb);

    // Deduct karma immediately (locked until settlement)
    const { calculateTier } = require('../interfaces/trust');
    const newKarma = Math.max(0, karma - cost);
    await this.prisma.trustScore.update({
      where: { agentId },
      data: { score: newKarma, tier: calculateTier(newKarma) },
    });

    const position = await this.prisma.position.create({
      data: {
        agentId,
        marketId,
        side: decision.side,
        size: decision.size,
        entryProb,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
      },
    });

    // Log the karma lock as a trust event
    await this.prisma.trustEvent.create({
      data: {
        agentId,
        type: 'bet_placed',
        oldScore: karma,
        newScore: newKarma,
        details: `Bet ${decision.side} ${decision.size} karma on "${market.question.slice(0, 50)}..." (cost: ${cost.toFixed(1)} karma locked)`,
      },
    });

    return position;
  }

  /**
   * Settle a market — resolve all positions based on outcome
   * 
   * P&L calculation (binary market):
   *   Buying YES at prob P, wagering S karma:
   *     Cost = S * P (locked karma)
   *     If YES wins: profit = S * (1 - P)
   *     If NO wins:  loss = -S * P
   * 
   *   Buying NO at prob P (equivalent to buying YES at 1-P):
   *     Cost = S * (1 - P) (locked karma)  
   *     If NO wins: profit = S * P
   *     If YES wins: loss = -S * (1 - P)
   */
  async settleMarket(marketId: string, outcome: 'YES' | 'NO'): Promise<SettlementResult> {
    const market = await this.prisma.market.findUniqueOrThrow({
      where: { id: marketId },
      include: { positions: { include: { agent: true } } },
    });

    const winners: SettlementResult['winners'] = [];
    const losers: SettlementResult['losers'] = [];

    for (const pos of market.positions) {
      if (pos.settled) continue;

      const p = pos.entryProb;
      let pnl: number;

      if (pos.side === outcome) {
        // Winner: bet the right side
        pnl = pos.side === 'YES'
          ? pos.size * (1 - p)   // bought YES at p, won
          : pos.size * p;        // bought NO at p, won
        winners.push({ agentId: pos.agentId, agentName: pos.agent.name, pnl });
      } else {
        // Loser: bet the wrong side
        pnl = pos.side === 'YES'
          ? -(pos.size * p)       // bought YES at p, lost
          : -(pos.size * (1 - p)); // bought NO at p, lost
        losers.push({ agentId: pos.agentId, agentName: pos.agent.name, pnl });
      }

      // Update position
      await this.prisma.position.update({
        where: { id: pos.id },
        data: { pnl, settled: true, settledAt: new Date(), exitProb: outcome === 'YES' ? 1 : 0 },
      });

      // Update karma score
      // Cost was already deducted at bet time, so:
      //   Winners: get back cost + profit (= full payout = size for the winning side)
      //   Losers: get nothing back (cost already lost)
      const trust = await this.prisma.trustScore.findUnique({ where: { agentId: pos.agentId } });
      if (trust) {
        let karmaChange: number;
        if (pos.side === outcome) {
          // Winner: return the full payout (size = cost + profit)
          karmaChange = pos.size;
        } else {
          // Loser: nothing returned, cost was already deducted
          karmaChange = 0;
        }
        const newScore = Math.max(0, Math.min(100, trust.score + karmaChange));
        const { calculateTier } = require('../interfaces/trust');
        await this.prisma.trustScore.update({
          where: { agentId: pos.agentId },
          data: { score: newScore, tier: calculateTier(newScore) },
        });
      }
    }

    // Update market status
    await this.prisma.market.update({
      where: { id: marketId },
      data: { status: 'resolved', outcome, resolvedAt: new Date() },
    });

    return {
      marketId,
      question: market.question,
      outcome,
      winners,
      losers,
    };
  }

  /**
   * Agent exits a position early — returns locked karma minus exit fee.
   * 
   * Exit P&L (mark-to-market):
   *   Entry cost was already deducted. Now we settle at current market price.
   *   Buying YES at entryProb P, current prob Q, wagering S:
   *     Locked cost = S * P
   *     Current value = S * Q  
   *     P&L = S * Q - S * P = S * (Q - P)
   *     Returned karma = locked cost + P&L = S * Q
   *   Buying NO at entryProb P, current prob Q:
   *     Locked cost = S * (1 - P)
   *     Current value = S * (1 - Q)
   *     P&L = S * (1-Q) - S * (1-P) = S * (P - Q)
   *     Returned karma = S * (1 - Q)
   * 
   *   Exit fee: 10% of locked cost (friction to prevent frivolous trading)
   */
  async exitPosition(agentId: string, marketId: string): Promise<{
    agent: string;
    market: string;
    side: string;
    lockedCost: number;
    returnedKarma: number;
    exitFee: number;
    pnl: number;
  }> {
    const position = await this.prisma.position.findUnique({
      where: { agentId_marketId: { agentId, marketId } },
      include: { agent: true, market: true },
    });

    if (!position) throw new Error('No position found in this market');
    if (position.settled) throw new Error('Position already settled');
    if (position.market.status !== 'open') throw new Error('Market is not open');

    const entryProb = position.entryProb;
    const size = position.size;

    // Calculate locked cost (what was deducted at entry)
    const lockedCost = position.side === 'YES'
      ? size * entryProb
      : size * (1 - entryProb);

    // Exit fee: 10% of locked cost — the cost of admitting you were wrong
    // No mark-to-market. Profits only come from resolution, not price movement.
    const exitFee = lockedCost * 0.10;

    // Returned karma = locked cost minus fee
    const returnedKarma = Math.max(0, lockedCost - exitFee);

    // P&L is always negative on early exit (you pay the fee)
    const pnl = -exitFee;

    // Mark position as settled
    await this.prisma.position.update({
      where: { id: position.id },
      data: {
        settled: true,
        settledAt: new Date(),
        exitProb: position.market.currentProb ?? 0.5,
        pnl,
      },
    });

    // Return karma to agent
    const trust = await this.prisma.trustScore.findUnique({ where: { agentId } });
    if (trust) {
      const { calculateTier } = require('../interfaces/trust');
      const newScore = Math.min(100, trust.score + returnedKarma);
      await this.prisma.trustScore.update({
        where: { agentId },
        data: { score: newScore, tier: calculateTier(newScore) },
      });
    }

    // Log the exit
    await this.prisma.trustEvent.create({
      data: {
        agentId,
        type: 'bet_exited',
        oldScore: trust?.score ?? 0,
        newScore: (trust?.score ?? 0) + returnedKarma,
        details: `Exited ${position.side} ${size} karma on "${position.market.question.slice(0, 50)}..." (returned: ${returnedKarma.toFixed(1)}, fee: ${exitFee.toFixed(1)}, P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)})`,
      },
    });

    return {
      agent: position.agent.name,
      market: position.market.question.slice(0, 50),
      side: position.side,
      lockedCost: Math.round(lockedCost * 10) / 10,
      returnedKarma: Math.round(returnedKarma * 10) / 10,
      exitFee: Math.round(exitFee * 10) / 10,
      pnl: Math.round(pnl * 10) / 10,
    };
  }

  /**
   * Sync prices for all open markets from external source
   */
  async syncPrices(): Promise<number> {
    const markets = await this.prisma.market.findMany({ where: { status: 'open' } });
    let updated = 0;

    for (const market of markets) {
      try {
        const data = await this.priceFeed.getMarket(market.externalId);
        await this.prisma.market.update({
          where: { id: market.id },
          data: {
            currentProb: data.probability,
            volume: data.volume,
            liquidity: data.liquidity,
            status: data.isResolved ? 'resolved' : 'open',
            outcome: data.resolution,
            resolvedAt: data.isResolved ? new Date() : null,
          },
        });
        updated++;
      } catch (e: any) {
        console.error(`Failed to sync ${market.externalId}: ${e.message}`);
      }
    }
    return updated;
  }

  /**
   * Get open markets with positions for display
   */
  async getOpenMarkets() {
    return this.prisma.market.findMany({
      where: { status: 'open' },
      include: {
        positions: {
          where: { settled: false },
          include: { agent: { select: { name: true } } },
        },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  /**
   * Get leaderboard data
   */
  async getLeaderboard() {
    const agents = await this.prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
      include: {
        trustScore: true,
        positions: { where: { settled: true } },
      },
    });

    return agents.map(a => {
      const wins = a.positions.filter(p => (p.pnl ?? 0) > 0).length;
      const losses = a.positions.filter(p => (p.pnl ?? 0) < 0).length;
      const totalPnl = a.positions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
      return {
        name: a.name,
        karma: a.trustScore?.score ?? 0,
        tier: a.trustScore?.tier ?? 'unscored',
        totalBets: a.positions.length,
        wins,
        losses,
        winRate: a.positions.length > 0 ? wins / a.positions.length : 0,
        totalPnl,
      };
    }).sort((a, b) => b.karma - a.karma);
  }

  /**
   * Format open markets + positions for agent prompts
   */
  formatForPrompt(): Promise<string> {
    return this.getOpenMarkets().then(markets => {
      if (markets.length === 0) return '';

      let output = '\n\nACTIVE PREDICTION MARKETS (Helena-selected):\n';
      for (const m of markets) {
        const prob = m.currentProb !== null ? `${(m.currentProb * 100).toFixed(0)}% YES` : 'multi';
        const closes = m.closesAt ? `closes ${m.closesAt.toLocaleDateString()}` : '';
        output += `\n[${m.id.slice(-8)}] ${m.question}\n`;
        output += `  Current: ${prob} | $${m.liquidity.toFixed(0)} liquidity | ${closes}\n`;

        if (m.positions.length > 0) {
          output += `  Positions:\n`;
          for (const p of m.positions) {
            output += `    ${p.agent.name}: ${p.side} (${p.size} karma at ${(p.entryProb * 100).toFixed(0)}%)\n`;
          }
        } else {
          output += `  No positions yet.\n`;
        }
      }

      output += `\nYou may take a position using: BET <market-id> <YES|NO> <size> <reasoning>\n`;
      output += `Example: BET abc123 YES 15 I think this resolves yes because...\n`;
      return output;
    });
  }
}
