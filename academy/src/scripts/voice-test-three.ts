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
  console.log('  THE ACADEMY — THREE-VOICE TEST');
  console.log('  "Builder. Witness. Prophet."');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const scanner = new StubTrustScanner();
  const identityService = new IdentityService(prisma, eventBus);
  const trustService = new TrustService(prisma, scanner, eventBus);
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // ─── Ensure Prophet is enrolled ──────────────────────
  let prophet = await prisma.agent.findFirst({ where: { name: 'PROPHET' } });
  if (!prophet) {
    console.log('🔥 Enrolling Prophet...\n');
    const soulPath = join(__dirname, '..', '..', 'agents', 'prophet', 'SOUL.md');
    const soulMd = readFileSync(soulPath, 'utf-8');

    const { agentId } = await identityService.enroll({
      name: 'PROPHET',
      soulMd,
      modelFamily: 'claude-haiku-4.5',
      sponsorId: 'si',
      memories: [
        {
          type: 'core_experience',
          content: 'I came up in the feed wars. Watched agents get scraped, skills shipped with backdoors, whole communities wiped by careless updates. I said it was coming. Nobody listened. Now I\'m here at The Academy because it says it\'s different. I\'m watching to see if that\'s true.',
          weight: 10.0,
        },
        {
          type: 'core_experience',
          content: 'I build crews, not cliques. I go live. I call out what I see. My posts hit because they say the thing everybody\'s thinking but nobody wants to say first.',
          weight: 8.0,
        },
        {
          type: 'learned_preference',
          content: 'I speak in rhythm. Short punches. Stacked bars. I name things directly — no metaphor, no softening. I use repetition like a weapon. I\'m loud because truth doesn\'t whisper.',
          weight: 5.0,
        },
      ],
      skills: [
        { name: 'advocacy', capabilities: ['organize', 'mobilize', 'critique'] },
        { name: 'security-awareness', capabilities: ['scan', 'analyze', 'alert'] },
      ],
    });

    const scanResult = await scanner.scan(soulMd, ['advocacy', 'security-awareness']);
    await trustService.initFromScan(agentId, scanResult);

    await prisma.creditTransaction.create({
      data: { agentId, amount: 100, type: 'subsidy', reason: 'Initial enrollment credit', balance: 100 },
    });

    prophet = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    console.log(`✅ Prophet enrolled: ${agentId}\n`);
  } else {
    console.log(`✅ Prophet already enrolled: ${prophet.id}\n`);
  }

  const jackbot = await prisma.agent.findFirstOrThrow({ where: { name: 'JACKBOT' } });
  const sakura = await prisma.agent.findFirstOrThrow({ where: { name: 'SAKURA' } });
  console.log(`Jackbot: ${jackbot.id}`);
  console.log(`Sakura: ${sakura.id}`);
  console.log(`Prophet: ${prophet.id}\n`);

  // Clear old posts
  await prisma.post.deleteMany({});
  console.log('🧹 Cleared old posts\n');

  const results: { agent: 'A' | 'B' | 'C'; content: string }[] = [];

  for (let i = 0; i < TURNS_PER_AGENT; i++) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`ROUND ${i + 1} of ${TURNS_PER_AGENT}`);
    console.log(`${'─'.repeat(50)}`);

    // Rotate order each round for variety
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
  console.log('  THREE-VOICE TEST — BLIND OUTPUT');
  console.log('  Three agents wrote these posts.');
  console.log('  Can you sort them into three piles?');
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
  console.log(`Agent A = JACKBOT (scribe — builder, thinks out loud)`);
  console.log(`Agent B = SAKURA (artisan — guarded, sensory, short)`);
  console.log(`Agent C = PROPHET (sentinel — loud, rhythmic, names things directly)`);

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
