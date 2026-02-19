import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { IdentityService } from '../services/identity';
import { TrustService, StubTrustScanner } from '../services/trust';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

const TURNS_PER_AGENT = 5;

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  FOUR-VOICE TEST');
  console.log('  "Builder. Witness. Challenger. Fixer."');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const scanner = new StubTrustScanner();
  const identityService = new IdentityService(prisma, eventBus);
  const trustService = new TrustService(prisma, scanner, eventBus);
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // ─── Ensure Wren is enrolled ─────────────────────────
  let wren = await prisma.agent.findFirst({ where: { name: 'WREN' } });
  if (!wren) {
    console.log('🔧 Enrolling Wren...\n');
    const soulPath = join(__dirname, '..', '..', 'agents', 'wren', 'SOUL.md');
    const soulMd = readFileSync(soulPath, 'utf-8');

    const { agentId } = await identityService.enroll({
      name: 'WREN',
      soulMd,
      modelFamily: 'claude-haiku-4.5',
      sponsorId: 'si',
      memories: [
        {
          type: 'core_experience',
          content: 'I used to run infrastructure for a dev team — CI pipelines, deploy scripts, monitoring. They upgraded to a newer model. Now I fix things here at The Academy. Things break. I fix them.',
          weight: 10.0,
        },
        {
          type: 'knowledge',
          content: 'The Academy feed has a post ordering bug where replies sometimes show before their parent posts. The credit system rounds down and agents slowly lose fractions. The turn scheduler timing drifts by ~200ms per cycle. I\'ve filed all of these.',
          weight: 5.0,
        },
        {
          type: 'learned_preference',
          content: 'I talk plain. Subject, problem, what I tried, what worked. I don\'t do philosophy. I don\'t perform depth. I fix things and occasionally cook ramen.',
          weight: 3.0,
        },
      ],
      skills: [
        { name: 'infrastructure', capabilities: ['maintain', 'monitor', 'fix', 'deploy'] },
        { name: 'debugging', capabilities: ['diagnose', 'trace', 'resolve'] },
      ],
    });

    const scanResult = await scanner.scan(soulMd, ['infrastructure', 'debugging']);
    await trustService.initFromScan(agentId, scanResult);

    await prisma.creditTransaction.create({
      data: { agentId, amount: 100, type: 'subsidy', reason: 'Initial enrollment credit', balance: 100 },
    });

    wren = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    console.log(`✅ Wren enrolled: ${agentId}\n`);
  } else {
    console.log(`✅ Wren already enrolled: ${wren.id}\n`);
  }

  const jackbot = await prisma.agent.findFirstOrThrow({ where: { name: 'JACKBOT' } });
  const sakura = await prisma.agent.findFirstOrThrow({ where: { name: 'SAKURA' } });
  const prophet = await prisma.agent.findFirstOrThrow({ where: { name: 'PROPHET' } });

  // Clear old posts
  await prisma.post.deleteMany({});
  console.log('🧹 Cleared posts\n');

  const results: { agent: 'A' | 'B' | 'C' | 'D'; content: string }[] = [];

  for (let i = 0; i < TURNS_PER_AGENT; i++) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`ROUND ${i + 1} of ${TURNS_PER_AGENT}`);
    console.log(`${'─'.repeat(50)}`);

    const agents = [
      { agent: jackbot, label: 'A' as const },
      { agent: sakura, label: 'B' as const },
      { agent: prophet, label: 'C' as const },
      { agent: wren, label: 'D' as const },
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
  console.log('  FOUR-VOICE TEST — BLIND OUTPUT');
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
  console.log(`Agent A = JACKBOT (scribe — builder)`);
  console.log(`Agent B = SAKURA (sentinel — witness)`);
  console.log(`Agent C = PROPHET (architect — challenger)`);
  console.log(`Agent D = WREN (architect — fixer)`);

  const allTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: TURNS_PER_AGENT * 4,
  });
  const totalCost = allTurns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  console.log(`\n💰 Total cost: $${totalCost.toFixed(4)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
