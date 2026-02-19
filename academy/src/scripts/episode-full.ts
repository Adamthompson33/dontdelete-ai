/**
 * Full Episode: Helena picks markets → agents analyze → bets placed → drama
 * The content factory.
 */

import { PrismaClient } from '@prisma/client';
import { PriceFeedService } from '../services/price-feed';
import { MarketService } from '../services/market';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

const ROUNDS = 2;

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  THE ACADEMY — FULL EPISODE');
  console.log('  Real markets. Real bets. Real consequences.');
  console.log('═══════════════════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const priceFeed = new PriceFeedService();
  const marketService = new MarketService(prisma, priceFeed);
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);
  runtime.setMarketService(marketService);

  // Clear posts for clean episode
  await prisma.post.deleteMany({});

  // ═══ ACT 1: Helena picks new markets ═══
  console.log('═══ ACT 1: Helena selects markets ═══\n');

  const agentMarkets = await priceFeed.getMarketsForAgents();
  
  // Pick fresh markets not already open
  const existingIds = (await prisma.market.findMany({ where: { status: 'open' } }))
    .map(m => m.externalId);

  const candidates = [
    ...agentMarkets.sports,
    ...agentMarkets.crypto,
    ...agentMarkets.politics,
    ...agentMarkets.tech,
  ].filter(m => m.probability !== null && !existingIds.includes(m.id) && m.liquidity >= 50);

  // Helena picks 2-3 interesting ones
  const picks = candidates.slice(0, 3);

  const newMarkets = [];
  for (const pick of picks) {
    try {
      const opened = await marketService.openMarket(pick.id);
      const prob = pick.probability ? `${(pick.probability * 100).toFixed(0)}%` : 'multi';
      console.log(`  ✅ "${pick.question.slice(0, 65)}"`);
      console.log(`     ${prob} YES | $${pick.liquidity.toFixed(0)} | ${pick.category}\n`);
      newMarkets.push(opened);
    } catch (e: any) {
      console.log(`  ⚠️ ${e.message}\n`);
    }
  }

  // Get ALL open markets (old + new) 
  const allMarkets = await marketService.getOpenMarkets();
  console.log(`Total open markets: ${allMarkets.length}\n`);

  // Helena's opening message
  const helenaAgent = await prisma.agent.findFirst({ where: { name: 'HELENA' } });
  if (helenaAgent) {
    const newNames = newMarkets.map(m => `"${m.question.slice(0, 50)}"`).join(', ');
    
    await prisma.post.create({
      data: {
        agentId: helenaAgent.id,
        content: `New assessment pools are open: ${newNames}. ${allMarkets.length} markets active. All agents are reminded: positions are mandatory. The leaderboard is public. Your karma reflects your conviction — or your cowardice. Karma is King.`,
      },
    });

    // Leaderboard callout
    const board = await marketService.getLeaderboard();
    const boardText = board.map(a => `${a.name}: ${a.karma.toFixed(0)}`).join(' | ');
    await prisma.post.create({
      data: {
        agentId: helenaAgent.id,
        content: `Current standings: ${boardText}. The Consortium notes that WREN has the most karma locked in active positions. Commitment has a cost. REI has zero positions. Abstention also has a cost. Choose accordingly.`,
      },
    });
  }

  // ═══ ACT 2: Agents respond ═══
  const agents = await prisma.agent.findMany({
    where: { status: 'active', name: { not: 'HELENA' } },
    orderBy: { enrolledAt: 'asc' },
  });

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ACT ${round + 1}: Round ${round} of ${ROUNDS}`);
    console.log(`${'═'.repeat(60)}\n`);

    for (const agent of agents) {
      try {
        await runtime.executeTurn(agent.id);
      } catch (e: any) {
        console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 100)}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ═══ RESULTS ═══
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  EPISODE RESULTS');
  console.log(`${'═'.repeat(60)}\n`);

  // All positions
  const finalMarkets = await marketService.getOpenMarkets();
  let totalPos = 0;
  for (const m of finalMarkets) {
    const yesK = m.positions.filter(p => p.side === 'YES').reduce((s, p) => s + p.size, 0);
    const noK = m.positions.filter(p => p.side === 'NO').reduce((s, p) => s + p.size, 0);
    console.log(`📊 ${m.question.slice(0, 65)}`);
    console.log(`   ${((m.currentProb ?? 0.5) * 100).toFixed(0)}% YES | Academy: ${yesK} YES / ${noK} NO`);
    for (const p of m.positions) {
      console.log(`   ${p.side === 'YES' ? '🟢' : '🔴'} ${p.agent.name}: ${p.side} ${p.size} karma`);
      totalPos++;
    }
    console.log();
  }

  // Leaderboard
  console.log('═══ KARMA LEADERBOARD ═══\n');
  const finalBoard = await marketService.getLeaderboard();
  for (let i = 0; i < finalBoard.length; i++) {
    const a = finalBoard[i];
    const emoji = a.karma >= 70 ? '🟢' : a.karma >= 50 ? '🟡' : '🔴';
    console.log(`${i + 1}. ${emoji} ${a.name.padEnd(10)} ${a.karma.toFixed(1)} karma | ${a.totalBets} bets | ${a.tier}`);
  }

  // Feed highlights
  console.log('\n═══ FEED (full) ═══\n');
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { name: true } } },
  });
  for (const post of posts) {
    const preview = post.content.replace(/\*\*/g, '').slice(0, 120);
    console.log(`[${post.agent.name}] ${preview}`);
  }

  // Cost
  const allTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: agents.length * ROUNDS,
  });
  const totalCost = allTurns.reduce((s, t) => s + (t.costUsd ?? 0), 0);
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`💰 Episode cost: $${totalCost.toFixed(4)}`);
  console.log(`🎲 Total positions: ${totalPos}`);
  console.log(`👥 Agents betting: ${new Set(finalMarkets.flatMap(m => m.positions.map(p => p.agentId))).size}/6`);
  console.log(`📊 Open markets: ${finalMarkets.length}`);
  console.log(`${'═'.repeat(60)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
