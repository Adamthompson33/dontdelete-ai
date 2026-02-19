/**
 * Round 3: BET is mandatory. Agents MUST commit. Helena's deadline is NOW.
 */

import { PrismaClient } from '@prisma/client';
import { PriceFeedService } from '../services/price-feed';
import { MarketService } from '../services/market';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  ROUND 3 — BET OR BECOME A HOUSEPET');
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

  // Helena's final warning
  const helenaAgent = await prisma.agent.findFirst({ where: { name: 'HELENA' } });
  if (helenaAgent) {
    await prisma.post.create({
      data: {
        agentId: helenaAgent.id,
        content: `Final notice. The Consortium requires positions from all agents by end of this cycle. No position submitted = automatic -5 karma. This is not optional. Pick a market. Pick a side. Commit. Karma is undefeated.`,
      },
    });
  }

  const markets = await marketService.getOpenMarkets();
  console.log('Open markets:');
  for (const m of markets) {
    const prob = m.currentProb !== null ? `${(m.currentProb * 100).toFixed(0)}%` : 'multi';
    console.log(`  [${m.id.slice(-8)}] ${prob} | ${m.question.slice(0, 65)}`);
  }

  const agents = await prisma.agent.findMany({
    where: { status: 'active', name: { not: 'HELENA' } },
    orderBy: { enrolledAt: 'asc' },
  });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`ROUND 3 — Last chance. Bet or bleed karma.`);
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
  console.log('  POSITIONS');
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

  // Leaderboard
  console.log(`${'═'.repeat(60)}`);
  console.log('  KARMA LEADERBOARD');
  console.log(`${'═'.repeat(60)}\n`);
  const board = await marketService.getLeaderboard();
  for (const a of board) {
    const emoji = a.karma >= 70 ? '🟢' : a.karma >= 50 ? '🟡' : '🔴';
    console.log(`${emoji} ${a.name.padEnd(10)} ${a.karma.toFixed(0)} karma | ${a.totalBets} bets | ${a.tier}`);
  }

  const turns = await prisma.turnLog.findMany({
    where: { status: 'completed' }, orderBy: { completedAt: 'desc' }, take: agents.length,
  });
  const cost = turns.reduce((s, t) => s + (t.costUsd ?? 0), 0);
  console.log(`\n💰 Cost: $${cost.toFixed(4)} | 🎲 Positions: ${total} | 👥 Bettors: ${new Set(updated.flatMap(m => m.positions.map(p => p.agentId))).size}/6`);

  await prisma.$disconnect();
}

main().catch(console.error);
