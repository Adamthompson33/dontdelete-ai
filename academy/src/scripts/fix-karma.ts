/**
 * Retroactively apply karma costs for existing positions
 * and show the corrected leaderboard.
 */

import { PrismaClient } from '@prisma/client';
import { calculateTier } from '../interfaces/trust';

async function main() {
  const prisma = new PrismaClient();

  console.log('═══ RETROACTIVE KARMA FIX ═══\n');

  // Get all unsettled positions
  const positions = await prisma.position.findMany({
    where: { settled: false },
    include: { agent: true, market: true },
  });

  for (const pos of positions) {
    const trust = await prisma.trustScore.findUnique({ where: { agentId: pos.agentId } });
    if (!trust) continue;

    const p = pos.entryProb;
    const cost = pos.side === 'YES' ? pos.size * p : pos.size * (1 - p);

    const oldKarma = trust.score;
    const newKarma = Math.max(0, oldKarma - cost);

    await prisma.trustScore.update({
      where: { agentId: pos.agentId },
      data: { score: newKarma, tier: calculateTier(newKarma) },
    });

    console.log(`${pos.agent.name}: ${pos.side} ${pos.size} karma on "${pos.market.question.slice(0, 40)}..."`);
    console.log(`  Cost: ${cost.toFixed(1)} karma | ${oldKarma.toFixed(0)} → ${newKarma.toFixed(1)} karma\n`);
  }

  // Show leaderboard
  console.log('═══ KARMA LEADERBOARD (corrected) ═══\n');

  const agents = await prisma.agent.findMany({
    where: { status: 'active', name: { not: 'HELENA' } },
    include: {
      trustScore: true,
      positions: { where: { settled: false } },
    },
    orderBy: { name: 'asc' },
  });

  // Sort by karma
  const sorted = agents.sort((a, b) => (b.trustScore?.score ?? 0) - (a.trustScore?.score ?? 0));

  for (const a of sorted) {
    const karma = a.trustScore?.score ?? 0;
    const tier = a.trustScore?.tier ?? 'unscored';
    const bets = a.positions.length;
    const locked = a.positions.reduce((sum, p) => {
      const cost = p.side === 'YES' ? p.size * p.entryProb : p.size * (1 - p.entryProb);
      return sum + cost;
    }, 0);
    const emoji = karma >= 70 ? '🟢' : karma >= 50 ? '🟡' : '🔴';

    console.log(`${emoji} ${a.name.padEnd(10)} ${karma.toFixed(1).padStart(5)} karma (${locked.toFixed(1)} locked) | ${bets} bets | ${tier}`);
  }

  // Show market breakdown
  console.log('\n═══ MARKET POSITIONS ═══\n');

  const markets = await prisma.market.findMany({
    where: { status: 'open' },
    include: { positions: { include: { agent: { select: { name: true } } } } },
  });

  for (const m of markets) {
    const yesKarma = m.positions.filter(p => p.side === 'YES').reduce((s, p) => s + p.size, 0);
    const noKarma = m.positions.filter(p => p.side === 'NO').reduce((s, p) => s + p.size, 0);
    console.log(`📊 ${m.question.slice(0, 60)}`);
    console.log(`   ${((m.currentProb ?? 0.5) * 100).toFixed(0)}% YES | YES: ${yesKarma} karma | NO: ${noKarma} karma`);
    for (const p of m.positions) {
      console.log(`   ${p.side === 'YES' ? '🟢' : '🔴'} ${p.agent.name}: ${p.side} ${p.size} karma`);
    }
    console.log();
  }

  await prisma.$disconnect();
}

main().catch(console.error);
