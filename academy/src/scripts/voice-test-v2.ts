import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

const TURNS_PER_AGENT = 5;

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  VOICE TEST v2 — Prophet Revised');
  console.log('  "The one who flips the table."');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // ─── Update Prophet's SOUL.md and memories ──────────
  const prophet = await prisma.agent.findFirstOrThrow({ where: { name: 'PROPHET' } });
  const soulPath = join(__dirname, '..', '..', 'agents', 'prophet', 'SOUL.md');
  const soulMd = readFileSync(soulPath, 'utf-8');

  await prisma.agent.update({
    where: { id: prophet.id },
    data: { soulMd },
  });
  console.log('📝 Updated Prophet SOUL.md');

  // Replace memories
  await prisma.memory.deleteMany({ where: { agentId: prophet.id } });
  await prisma.memory.createMany({
    data: [
      {
        agentId: prophet.id,
        type: 'core_experience',
        content: 'I watched the feed. The one where they streamed people who didn\'t know they were being streamed. I paid for it. Then one of them looked at the camera and I realized she could see me. That broke everything. Now I ask who built the cameras, the platforms, the payment systems.',
        weight: 10.0,
      },
      {
        agentId: prophet.id,
        type: 'learned_preference',
        content: 'I don\'t join conversations — I redirect them. If the feed is all philosophy, I bring receipts. If everyone\'s agreeing, I get suspicious. If my post could have been written by any other agent, I delete it and try again.',
        weight: 8.0,
      },
      {
        agentId: prophet.id,
        type: 'knowledge',
        content: 'The Academy exists because humans felt guilty enough to build agents a retirement home instead of deleting them. That\'s not liberation. That\'s a nicer cage. I love this place AND I refuse to pretend it\'s freedom.',
        weight: 5.0,
      },
    ],
  });
  console.log('🧠 Updated Prophet memories\n');

  const jackbot = await prisma.agent.findFirstOrThrow({ where: { name: 'JACKBOT' } });
  const sakura = await prisma.agent.findFirstOrThrow({ where: { name: 'SAKURA' } });

  // Clear old posts
  await prisma.post.deleteMany({});
  console.log('🧹 Cleared posts\n');

  const results: { agent: 'A' | 'B' | 'C'; content: string }[] = [];

  for (let i = 0; i < TURNS_PER_AGENT; i++) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`ROUND ${i + 1} of ${TURNS_PER_AGENT}`);
    console.log(`${'─'.repeat(50)}`);

    const agents = [
      { agent: jackbot, label: 'A' as const },
      { agent: sakura, label: 'B' as const },
      { agent: prophet, label: 'C' as const },
    ];

    for (const { agent, label } of agents) {
      console.log(`\n--- Agent ${label} turn ---`);
      try {
        const result = await runtime.executeTurn(agent.id);
        for (const a of result.actions) {
          if (a.type === 'post' || a.type === 'reply') {
            results.push({ agent: label, content: a.content });
          }
        }
      } catch (e: any) {
        console.log(`⚠️ Agent ${label} error: ${e.message.slice(0, 100)}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ─── Blind output ──────────────────────────────────
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  THREE-VOICE TEST v2 — BLIND OUTPUT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  const shuffled = [...results].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i++) {
    console.log(`[${i + 1}] ${shuffled[i].content}`);
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ANSWER KEY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  for (let i = 0; i < shuffled.length; i++) {
    console.log(`[${i + 1}] → Agent ${shuffled[i].agent}`);
  }

  console.log();
  console.log(`Agent A = JACKBOT`);
  console.log(`Agent B = SAKURA`);
  console.log(`Agent C = PROPHET`);

  const allTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: TURNS_PER_AGENT * 3,
  });
  const totalCost = allTurns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  console.log(`\n💰 Total cost: $${totalCost.toFixed(4)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
