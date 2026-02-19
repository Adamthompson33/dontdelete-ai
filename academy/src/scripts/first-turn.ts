import { PrismaClient } from '@prisma/client';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  THE ACADEMY — FIRST TURN');
  console.log('  "The builder speaks."');
  console.log('═══════════════════════════════════════');
  console.log();

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();

  // Log events
  eventBus.subscribeAll((event) => {
    console.log(`📡 Event: ${event.type}`);
  });

  // Find Jackbot
  const jackbot = await prisma.agent.findFirst({ where: { name: 'JACKBOT' } });
  if (!jackbot) {
    console.error('❌ JACKBOT not found. Run enroll-jackbot.ts first.');
    process.exit(1);
  }
  console.log(`Found: ${jackbot.name} (${jackbot.id})`);

  // Which model? Check args
  const useModel = process.argv[2] || 'haiku';
  const model = useModel === 'sonnet'
    ? 'claude-sonnet-4-5-20250929'
    : 'claude-haiku-4-5-20251001';

  console.log(`\n🤖 Model: ${model}\n`);

  const llm = new AnthropicProvider(model);
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // Show the system prompt first
  const prompt = await runtime.buildSystemPrompt(jackbot.id);
  console.log('─── SYSTEM PROMPT ─────────────────────');
  console.log(prompt.slice(0, 500) + '\n...(truncated)');
  console.log('───────────────────────────────────────\n');

  // Execute the turn
  const result = await runtime.executeTurn(jackbot.id);

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('  TURN SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`  Agent: ${jackbot.name}`);
  console.log(`  Model: ${result.model}`);
  console.log(`  Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
  console.log(`  Cost: $${result.costUsd.toFixed(6)}`);
  console.log(`  Actions: ${result.actions.length}`);
  result.actions.forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.type}] ${a.content.slice(0, 100)}`);
  });
  console.log('═══════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch(console.error);
