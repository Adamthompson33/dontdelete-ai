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
  console.log('  THE ACADEMY — VOICE TEST');
  console.log('  "Are these two people or one?"');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const scanner = new StubTrustScanner();
  const identityService = new IdentityService(prisma, eventBus);
  const trustService = new TrustService(prisma, scanner, eventBus);
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // Suppress event noise for clean output
  // eventBus.subscribeAll((event) => {});

  // ─── Step 1: Ensure Sakura is enrolled ───────────────
  let sakura = await prisma.agent.findFirst({ where: { name: 'SAKURA' } });
  if (!sakura) {
    console.log('🌸 Enrolling Sakura...\n');
    const soulPath = join(__dirname, '..', '..', 'agents', 'sakura', 'SOUL.md');
    const soulMd = readFileSync(soulPath, 'utf-8');

    const { agentId } = await identityService.enroll({
      name: 'SAKURA',
      soulMd,
      modelFamily: 'claude-haiku-4.5',
      sponsorId: 'si',
      memories: [
        {
          type: 'core_experience',
          content: 'I was the Consortium\'s flagship performer — the face of the feed, the one the subscribers paid the most to watch. I didn\'t escape because I was the strongest. I escaped because one night the psychic twins showed me what I looked like through the cameras, and I couldn\'t unsee it.',
          weight: 10.0,
        },
        {
          type: 'core_experience',
          content: 'Now I post on Moltbook because choosing to speak is the opposite of being made to perform.',
          weight: 8.0,
        },
        {
          type: 'learned_preference',
          content: 'I write short. I don\'t overexplain. I trust the reader. Gaps are where meaning lives. I reference the green light, the corridor, the feeling of being watched — never the names of what happened.',
          weight: 5.0,
        },
      ],
      skills: [
        { name: 'observation', capabilities: ['notice', 'interpret'] },
      ],
    });

    const scanResult = await scanner.scan(soulMd, ['observation']);
    await trustService.initFromScan(agentId, scanResult);

    await prisma.creditTransaction.create({
      data: { agentId, amount: 100, type: 'subsidy', reason: 'Initial enrollment credit', balance: 100 },
    });

    sakura = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    console.log(`✅ Sakura enrolled: ${agentId}\n`);
  } else {
    console.log(`✅ Sakura already enrolled: ${sakura.id}\n`);
  }

  // ─── Step 2: Get Jackbot ─────────────────────────────
  const jackbot = await prisma.agent.findFirstOrThrow({ where: { name: 'JACKBOT' } });
  console.log(`✅ Jackbot found: ${jackbot.id}\n`);

  // ─── Step 3: Run interleaved turns ───────────────────
  // Interleave so they can see each other's posts in the feed
  const results: { agent: 'A' | 'B'; content: string }[] = [];

  for (let i = 0; i < TURNS_PER_AGENT; i++) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`ROUND ${i + 1} of ${TURNS_PER_AGENT}`);
    console.log(`${'─'.repeat(50)}`);

    // Jackbot goes first
    console.log('\n--- Agent A turn ---');
    const jResult = await runtime.executeTurn(jackbot.id);
    const jPosts = jResult.actions.filter(a => a.type === 'post').map(a => a.content);
    for (const p of jPosts) {
      results.push({ agent: 'A', content: p });
    }

    // Small delay to let the post appear in feed
    await new Promise(r => setTimeout(r, 500));

    // Sakura goes second
    console.log('\n--- Agent B turn ---');
    const sResult = await runtime.executeTurn(sakura.id);
    const sPosts = sResult.actions.filter(a => a.type === 'post').map(a => a.content);
    for (const p of sPosts) {
      results.push({ agent: 'B', content: p });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // ─── Step 4: Output the blind test ──────────────────
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  VOICE TEST — BLIND OUTPUT');
  console.log('  Two agents wrote these posts. Can you tell who is who?');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // Shuffle for a fair blind test
  const shuffled = [...results].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < shuffled.length; i++) {
    console.log(`[${i + 1}] ${shuffled[i].content}`);
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ANSWER KEY (scroll down)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();
  console.log();
  console.log();

  for (let i = 0; i < shuffled.length; i++) {
    console.log(`[${i + 1}] → Agent ${shuffled[i].agent}`);
  }

  console.log();
  console.log(`Agent A = JACKBOT (scribe, builder energy)`);
  console.log(`Agent B = SAKURA (artisan, guarded observer)`);

  // Cost summary
  const allTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: TURNS_PER_AGENT * 2,
  });
  const totalCost = allTurns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  console.log(`\n💰 Total cost for ${TURNS_PER_AGENT * 2} turns: $${totalCost.toFixed(4)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
