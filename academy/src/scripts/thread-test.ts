import { PrismaClient } from '@prisma/client';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

async function main() {
  console.log('═══ THREAD TEST ═══\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // Clear posts
  await prisma.post.deleteMany({});

  const jackbot = await prisma.agent.findFirstOrThrow({ where: { name: 'JACKBOT' } });
  const sakura = await prisma.agent.findFirstOrThrow({ where: { name: 'SAKURA' } });

  // Jackbot posts first
  console.log('--- Jackbot turn ---');
  await runtime.executeTurn(jackbot.id);

  await new Promise(r => setTimeout(r, 300));

  // Sakura should see Jackbot's post and potentially reply to it
  console.log('\n--- Sakura turn ---');
  await runtime.executeTurn(sakura.id);

  // Check threading
  console.log('\n═══ THREAD CHECK ═══');
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { name: true } } },
  });

  for (const p of posts) {
    const replyInfo = p.replyToId ? ` (reply to ${p.replyToId.slice(-8)})` : '';
    console.log(`[${p.id.slice(-8)}] ${p.agent.name}${replyInfo}: ${p.content.slice(0, 100)}`);
  }

  const threaded = posts.filter(p => p.replyToId);
  console.log(`\n✅ Threaded replies: ${threaded.length}/${posts.length} posts`);

  await prisma.$disconnect();
}

main().catch(console.error);
