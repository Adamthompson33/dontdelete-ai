import { PrismaClient } from '@prisma/client';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';
import { RuntimeService, ModelTier } from '../services/runtime';

/**
 * Test: Dynamic model selection
 * Shows which model each agent would get assigned based on current narrative conditions.
 * Then runs one round with the mixed models.
 */

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  DYNAMIC MODEL TEST');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();

  // Create three providers
  const haiku = new AnthropicProvider('claude-haiku-4-5-20251001');
  const sonnet = new AnthropicProvider('claude-sonnet-4-20250514');
  // const opus = new AnthropicProvider('claude-opus-4-20250115');  // Uncomment when needed

  const providers = new Map<ModelTier, AnthropicProvider>();
  providers.set('haiku', haiku);
  providers.set('sonnet', sonnet);
  // providers.set('opus', opus);

  const runtime = new RuntimeService(prisma, haiku, eventBus, providers);

  // Get all agents
  const agents = await prisma.agent.findMany({
    where: { status: 'active', NOT: { name: 'HELENA' } },
    orderBy: { enrolledAt: 'asc' },
  });

  // Show model assignments
  console.log('MODEL ASSIGNMENTS (based on current narrative state):');
  console.log('─'.repeat(50));
  for (const agent of agents) {
    const tier = await runtime.getModelTier(agent.id, agent.name);
    const emoji = tier === 'opus' ? '🔴' : tier === 'sonnet' ? '🟡' : '🟢';
    console.log(`  ${emoji} ${agent.name.padEnd(10)} → ${tier}`);
  }

  console.log('\n─'.repeat(50));
  console.log('Running one round with dynamic models...\n');

  // Run one round
  for (const agent of agents) {
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 100)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Cost breakdown
  const recentTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: 6,
  });

  console.log('\n\nCOST BREAKDOWN:');
  console.log('─'.repeat(50));
  let total = 0;
  for (const t of recentTurns.reverse()) {
    const agent = agents.find(a => a.id === t.agentId);
    const cost = t.costUsd ?? 0;
    total += cost;
    console.log(`  ${agent?.name?.padEnd(10) ?? '?'} | ${t.model?.padEnd(30) ?? '?'} | $${cost.toFixed(4)}`);
  }
  console.log(`${'─'.repeat(50)}`);
  console.log(`  TOTAL: $${total.toFixed(4)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
