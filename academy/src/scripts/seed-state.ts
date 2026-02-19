/**
 * ONE-TIME SEED SCRIPT — Backfill agent state files from existing DB history
 * 
 * Pulls all positions, settlements, exits, and karma from Prisma
 * and writes initial state files so Run 7 starts with real track records.
 * 
 * Usage: npx tsx src/scripts/seed-state.ts
 * Run once. Then delete or ignore.
 */

import { PrismaClient } from '@prisma/client';
import { AgentStateService } from '../services/agent-state';
import { MarketService } from '../services/market';
import { PriceFeedService } from '../services/price-feed';

const CURRENT_RUN = 6; // We've done 6 runs, next is 7

async function main() {
  const prisma = new PrismaClient();
  const priceFeed = new PriceFeedService();
  const marketService = new MarketService(prisma, priceFeed);
  const stateService = new AgentStateService(prisma, marketService);

  const agents = await prisma.agent.findMany({
    where: { status: 'active', name: { not: 'HELENA' } },
    include: { trustScore: true },
  });

  console.log('═══ SEEDING AGENT STATE FILES ═══\n');

  for (const agent of agents) {
    // Get full position history
    const allPositions = await prisma.position.findMany({
      where: { agentId: agent.id },
      include: { market: true },
      orderBy: { createdAt: 'desc' },
    });

    const openPositions = allPositions.filter(p => !p.settled);
    const settledPositions = allPositions.filter(p => p.settled);
    const wins = settledPositions.filter(p => (p.pnl ?? 0) > 0).length;
    const losses = settledPositions.filter(p => (p.pnl ?? 0) < 0).length;

    // Count exits (sold positions vs resolved)
    const exitEvents = await prisma.trustEvent.count({
      where: { agentId: agent.id, type: 'exit_position' },
    });

    // Build recent decisions from actual position history
    const recentDecisions = allPositions.slice(0, 5).map(pos => ({
      run: CURRENT_RUN, // approximate — we don't track per-position run
      action: (pos.settled ? 'SELL' : 'BUY') as 'BUY' | 'SELL' | 'HOLD',
      market: pos.market.question.slice(0, 60),
      side: pos.side,
      size: pos.size,
      reasoning: (pos as any).reasoning?.slice(0, 100) ?? '',
      outcome: pos.settled
        ? `${(pos.pnl ?? 0) >= 0 ? '+' : ''}${(pos.pnl ?? 0).toFixed(1)} karma`
        : 'open',
    }));

    // Calculate locked karma
    const lockedKarma = openPositions.reduce((sum, p) => {
      const cost = p.side === 'YES'
        ? p.size * p.entryProb
        : p.size * (1 - p.entryProb);
      return sum + cost;
    }, 0);

    // Get karma history for trend
    const karmaEvents = await prisma.trustEvent.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    const trend = karmaEvents.map(e => e.newScore - e.oldScore).reverse();

    const currentKarma = agent.trustScore?.score ?? 50;
    const totalBets = allPositions.length;
    const winRate = (wins + losses) > 0 ? wins / (wins + losses) : null;

    // Generate and save state
    const state = await stateService.generateState(agent.id, agent.name, CURRENT_RUN);

    // Override with our more accurate backfilled data
    state.record = {
      totalBets,
      wins,
      losses,
      exits: exitEvents,
      openPositions: openPositions.length,
      winRate,
    };
    state.recentDecisions = recentDecisions;
    state.karma.trend = trend.length > 0 ? trend : [0];
    state.karma.current = currentKarma;
    state.karma.locked = lockedKarma;

    // Save the corrected state
    const fs = require('fs');
    const path = require('path');
    const stateDir = path.join(__dirname, '..', '..', 'state');
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, `${agent.name.toLowerCase()}.json`),
      JSON.stringify(state, null, 2),
      'utf-8'
    );

    console.log(`📋 ${agent.name}:`);
    console.log(`   Record: ${wins}W / ${losses}L / ${exitEvents} exits / ${openPositions.length} open`);
    console.log(`   Karma: ${currentKarma.toFixed(1)} (${agent.trustScore?.tier ?? '?'})`);
    console.log(`   Locked: ${lockedKarma.toFixed(1)} karma`);
    console.log(`   Decisions: ${recentDecisions.length} backfilled`);
    console.log(`   Win rate: ${winRate !== null ? (winRate * 100).toFixed(0) + '%' : 'N/A'}`);
    console.log('');
  }

  console.log('✅ All state files seeded. Ready for Run 7.');
  await prisma.$disconnect();
}

main().catch(console.error);
