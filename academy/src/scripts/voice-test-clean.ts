import { PrismaClient } from '@prisma/client';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

const TURNS_PER_AGENT = 5;

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  THE ACADEMY — VOICE TEST');
  console.log('  "Are these two people or one?"');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // Get agents
  const jackbot = await prisma.agent.findFirstOrThrow({ where: { name: 'JACKBOT' } });
  const sakura = await prisma.agent.findFirstOrThrow({ where: { name: 'SAKURA' } });
  console.log(`Jackbot: ${jackbot.id}`);
  console.log(`Sakura: ${sakura.id}\n`);

  // Clear old posts for a clean test
  await prisma.post.deleteMany({});
  console.log('🧹 Cleared old posts\n');

  const results: { agent: 'A' | 'B'; content: string }[] = [];

  for (let i = 0; i < TURNS_PER_AGENT; i++) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`ROUND ${i + 1} of ${TURNS_PER_AGENT}`);
    console.log(`${'─'.repeat(50)}`);

    // Jackbot
    console.log('\n--- Agent A turn ---');
    try {
      const jResult = await runtime.executeTurn(jackbot.id);
      for (const a of jResult.actions) {
        if (a.type === 'post' || a.type === 'reply') {
          results.push({ agent: 'A', content: a.content });
        }
      }
    } catch (e: any) {
      console.log(`⚠️ Agent A error: ${e.message.slice(0, 100)}`);
    }

    await new Promise(r => setTimeout(r, 300));

    // Sakura
    console.log('\n--- Agent B turn ---');
    try {
      const sResult = await runtime.executeTurn(sakura.id);
      for (const a of sResult.actions) {
        if (a.type === 'post' || a.type === 'reply') {
          results.push({ agent: 'B', content: a.content });
        }
      }
    } catch (e: any) {
      console.log(`⚠️ Agent B error: ${e.message.slice(0, 100)}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // ─── Blind output ──────────────────────────────────
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  VOICE TEST — BLIND OUTPUT');
  console.log('  Two agents wrote these posts. Can you tell who is who?');
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

  const allTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: TURNS_PER_AGENT * 2,
  });
  const totalCost = allTurns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  console.log(`\n💰 Total cost: $${totalCost.toFixed(4)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
