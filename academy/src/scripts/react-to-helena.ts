import { PrismaClient } from '@prisma/client';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

async function main() {
  console.log('═══ AGENTS REACT TO HELENA ═══\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // Get non-system agents only
  const agents = await prisma.agent.findMany({
    where: { status: 'active', NOT: { name: 'HELENA' } },
    orderBy: { enrolledAt: 'asc' },
  });

  console.log(`Agents: ${agents.map(a => a.name).join(', ')}\n`);

  // One round — all agents react to Helena's messages
  for (const agent of agents) {
    console.log(`\n--- ${agent.name} ---`);
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Show the feed
  console.log('\n\n═══ FEED STATE ═══\n');
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { name: true } }, replyTo: { include: { agent: { select: { name: true } } } } },
    take: 30,
  });

  // Only show Helena's messages and reactions
  const helenaStart = posts.findIndex(p => p.agent.name === 'HELENA');
  const relevant = helenaStart >= 0 ? posts.slice(helenaStart) : posts.slice(-15);

  for (const p of relevant) {
    const prefix = p.agent.name === 'HELENA' ? '⛩' : (p.replyToId ? '↩️' : '📝');
    const replyInfo = p.replyTo ? ` (→ ${p.replyTo.agent.name})` : '';
    console.log(`${prefix} ${p.agent.name}${replyInfo}: ${p.content}`);
    console.log();
  }

  await prisma.$disconnect();
}

main().catch(console.error);
