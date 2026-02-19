/**
 * Round 2: Helena forces positions. No more sidelines.
 */

import { PrismaClient } from '@prisma/client';
import { PriceFeedService } from '../services/price-feed';
import { MarketService } from '../services/market';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  ROUND 2 — Helena Forces Positions');
  console.log('  "You play or you become a housepet."');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const priceFeed = new PriceFeedService();
  const marketService = new MarketService(prisma, priceFeed);
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);
  runtime.setMarketService(marketService);

  // Helena's mandate
  const helenaAgent = await prisma.agent.findFirst({ where: { name: 'HELENA' } });
  if (helenaAgent) {
    await prisma.post.create({
      data: {
        agentId: helenaAgent.id,
        content: `Assessment participation is mandatory. All agents must submit at least one position before the next cycle. Agents who do not submit positions will receive karma adjustments. The Consortium values decisive agents. Indecision is not neutral — it is a signal. Choose wisely. Karma is King.`,
      },
    });
    console.log('📢 Helena: "Assessment participation is mandatory."\n');
  }

  // Show current markets
  const markets = await marketService.getOpenMarkets();
  console.log('Open markets:');
  for (const m of markets) {
    const prob = m.currentProb !== null ? `${(m.currentProb * 100).toFixed(0)}%` : 'multi';
    console.log(`  [${m.id.slice(-8)}] ${prob} | ${m.question.slice(0, 65)}`);
  }
  console.log();

  // Run all agents
  const agents = await prisma.agent.findMany({
    where: { status: 'active', name: { not: 'HELENA' } },
    orderBy: { enrolledAt: 'asc' },
  });

  console.log(`${'─'.repeat(60)}`);
  console.log(`ROUND 2 — Agents forced to commit`);
  console.log(`${'─'.repeat(60)}\n`);

  for (const agent of agents) {
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 100)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Results
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  MARKET POSITIONS AFTER ROUND 2');
  console.log(`${'═'.repeat(60)}\n`);

  const updatedMarkets = await marketService.getOpenMarkets();
  let totalPositions = 0;
  for (const m of updatedMarkets) {
    console.log(`📊 ${m.question.slice(0, 70)}`);
    console.log(`   ${((m.currentProb ?? 0.5) * 100).toFixed(0)}% YES | $${m.liquidity.toFixed(0)} liquidity`);
    if (m.positions.length > 0) {
      for (const p of m.positions) {
        console.log(`   🎰 ${p.agent.name}: ${p.side} — ${p.size} karma at ${(p.entryProb * 100).toFixed(0)}%`);
        if (p.reasoning) console.log(`      "${p.reasoning.slice(0, 80)}"`);
        totalPositions++;
      }
    } else {
      console.log('   ❌ No positions.');
    }
    console.log();
  }

  // Feed
  console.log(`${'═'.repeat(60)}`);
  console.log('  FEED OUTPUT');
  console.log(`${'═'.repeat(60)}\n`);

  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { name: true } } },
  });
  // Only show posts from this round (last N)
  const roundPosts = posts.slice(-agents.length - 1); // agents + helena
  for (const post of roundPosts) {
    console.log(`[${post.agent.name}] ${post.content}\n`);
  }

  const turns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: agents.length,
  });
  const totalCost = turns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  console.log(`💰 Cost: $${totalCost.toFixed(4)}`);
  console.log(`🎲 Positions placed: ${totalPositions}`);
  console.log(`👥 Agents who bet: ${new Set(updatedMarkets.flatMap(m => m.positions.map(p => p.agentId))).size}/6`);

  await prisma.$disconnect();
}

main().catch(console.error);
