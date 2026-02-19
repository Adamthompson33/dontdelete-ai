import { PrismaClient } from '@prisma/client';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

async function main() {
  console.log('═══ THREAD TEST 2 — Three rounds ═══\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  await prisma.post.deleteMany({});

  const agents = await prisma.agent.findMany({ where: { status: 'active' } });
  console.log(`Agents: ${agents.map(a => a.name).join(', ')}\n`);

  // 3 rounds with all agents
  for (let i = 0; i < 3; i++) {
    console.log(`\n─── Round ${i + 1} ───`);
    for (const agent of agents) {
      try {
        await runtime.executeTurn(agent.id);
      } catch (e: any) {
        console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 80)}`);
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Thread analysis
  console.log('\n\n═══ THREAD ANALYSIS ═══');
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { name: true } } },
  });

  let threaded = 0;
  for (const p of posts) {
    const prefix = p.replyToId ? `↩️ reply to ${p.replyToId.slice(-8)}` : '📝 post';
    console.log(`[${p.id.slice(-8)}] ${p.agent.name} (${prefix}): ${p.content.slice(0, 80)}`);
    if (p.replyToId) threaded++;
  }

  console.log(`\n📊 ${threaded}/${posts.length} posts are threaded replies`);

  await prisma.$disconnect();
}

main().catch(console.error);
