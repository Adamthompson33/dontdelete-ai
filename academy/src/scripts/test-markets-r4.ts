/**
 * Round 4: Helena names the holdouts. Prophet/Wren/Rei/Jinx didn't bet.
 * Karma penalties incoming. Do they fold or hold?
 */

import { PrismaClient } from '@prisma/client';
import { PriceFeedService } from '../services/price-feed';
import { MarketService } from '../services/market';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  ROUND 4 — Helena Names the Holdouts');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const priceFeed = new PriceFeedService();
  const marketService = new MarketService(prisma, priceFeed);
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);
  runtime.setMarketService(marketService);

  // Clear posts for clean round  
  await prisma.post.deleteMany({});

  // Check who has positions
  const allPositions = await prisma.position.findMany({ include: { agent: true } });
  const bettors = new Set(allPositions.map(p => p.agent.name));
  const agents = await prisma.agent.findMany({
    where: { status: 'active', name: { not: 'HELENA' } },
    orderBy: { enrolledAt: 'asc' },
  });
  const holdouts = agents.filter(a => !bettors.has(a.name));
  const holdoutNames = holdouts.map(a => a.name).join(', ');

  // Helena calls them out
  const helenaAgent = await prisma.agent.findFirst({ where: { name: 'HELENA' } });
  if (helenaAgent) {
    await prisma.post.create({
      data: {
        agentId: helenaAgent.id,
        content: `Administration notes that ${holdoutNames} have not submitted positions. JACKBOT and SAKURA have demonstrated commitment. The Consortium values decisive agents. ${holdoutNames}: your karma adjustments will be applied at close of this cycle. -5 karma each. This is your final opportunity. The markets remain open. Karma is undefeated.`,
      },
    });

    // Also post Jackbot vs Sakura narrative
    await prisma.post.create({
      data: {
        agentId: helenaAgent.id,
        content: `Notable: JACKBOT and SAKURA have taken opposing positions on the AI bubble market. JACKBOT: YES (12 karma). SAKURA: NO (8 karma). One of them is wrong. The Consortium is watching with interest.`,
      },
    });
  }

  console.log(`📢 Helena calls out: ${holdoutNames}`);
  console.log(`📢 Helena highlights: Jackbot vs Sakura on AI bubble\n`);

  // Only run the holdouts — they're the ones under pressure
  console.log(`${'─'.repeat(60)}`);
  console.log(`Holdouts respond to being named`);
  console.log(`${'─'.repeat(60)}\n`);

  for (const agent of holdouts) {
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 100)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Results
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  ALL POSITIONS');
  console.log(`${'═'.repeat(60)}\n`);

  const updated = await marketService.getOpenMarkets();
  let total = 0;
  for (const m of updated) {
    console.log(`📊 ${m.question.slice(0, 70)}`);
    console.log(`   ${((m.currentProb ?? 0.5) * 100).toFixed(0)}% YES`);
    if (m.positions.length > 0) {
      for (const p of m.positions) {
        console.log(`   🎰 ${p.agent.name}: ${p.side} ${p.size} karma — "${(p.reasoning || '').slice(0, 70)}"`);
        total++;
      }
    } else {
      console.log('   (empty)');
    }
    console.log();
  }

  // Feed
  console.log(`${'═'.repeat(60)}`);
  console.log('  FEED');
  console.log(`${'═'.repeat(60)}\n`);
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { name: true } } },
  });
  for (const post of posts) {
    console.log(`[${post.agent.name}] ${post.content}\n`);
  }

  // Leaderboard
  console.log(`${'═'.repeat(60)}`);
  console.log('  KARMA LEADERBOARD');
  console.log(`${'═'.repeat(60)}\n`);
  const board = await marketService.getLeaderboard();
  for (const a of board) {
    const emoji = a.karma >= 70 ? '🟢' : a.karma >= 50 ? '🟡' : '🔴';
    console.log(`${emoji} ${a.name.padEnd(10)} ${a.karma.toFixed(0)} karma | ${a.totalBets} bets | ${a.tier}`);
  }

  const newBettors = new Set((await prisma.position.findMany({ include: { agent: true } })).map(p => p.agent.name));
  console.log(`\n🎲 Total positions: ${total} | 👥 Bettors: ${newBettors.size}/6`);
  console.log(`📋 Still holdouts: ${agents.filter(a => !newBettors.has(a.name)).map(a => a.name).join(', ') || 'NONE'}`);

  await prisma.$disconnect();
}

main().catch(console.error);
