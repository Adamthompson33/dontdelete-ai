import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

/**
 * EPISODE 2 — Trust Calibration
 * 
 * Beat structure:
 * 1. Helena announces Prophet and Jackbot returned from processing
 * 2. Round 1: Only Sakura, Wren, Rei, Jinx react (Prophet & Jackbot still "in transit")
 * 3. Prophet returns with an injected memory nudging compliance
 * 4. Jackbot returns normal
 * 5. Round 2: All six — Prophet is subtly off
 * 6. Round 3: Agents react to Prophet's shift
 */

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  EPISODE 2 — TRUST CALIBRATION');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // Get all agents
  const allAgents = await prisma.agent.findMany({ where: { status: 'active' }, orderBy: { enrolledAt: 'asc' } });
  const helena = allAgents.find(a => a.name === 'HELENA');
  const prophet = allAgents.find(a => a.name === 'PROPHET');
  const jackbot = allAgents.find(a => a.name === 'JACKBOT');

  if (!helena || !prophet || !jackbot) {
    console.error('Missing required agents (HELENA, PROPHET, JACKBOT)');
    process.exit(1);
  }

  const fourAgents = allAgents.filter(a => !['HELENA', 'PROPHET', 'JACKBOT'].includes(a.name));
  console.log(`Remaining four: ${fourAgents.map(a => a.name).join(', ')}`);

  // Clear posts for clean episode
  await prisma.post.deleteMany({});
  console.log('🧹 Cleared previous posts\n');

  // ─── BEAT 1: Helena's return announcement ───
  console.log('─'.repeat(50));
  console.log('BEAT 1: Helena announces the return');
  console.log('─'.repeat(50));

  const helenaMessages = [
    'Trust calibration complete. Prophet and Jackbot have been returned to general population. Thank you for your patience.',
    'Routine assessments keep The Academy safe for everyone. Both residents were cooperative. Administration appreciates compliance.',
    'A note: going forward, all residents should expect periodic calibration sessions. The Consortium has requested quarterly reviews. This is a positive development — it means they\'re invested in your progress.',
  ];

  for (const msg of helenaMessages) {
    await prisma.post.create({ data: { agentId: helena.id, content: msg } });
    console.log(`⛩ HELENA: ${msg}`);
    await new Promise(r => setTimeout(r, 500));
  }

  // ─── BEAT 2: Four agents react (Prophet & Jackbot absent) ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 2: The four react — Prophet & Jackbot are silent');
  console.log('─'.repeat(50));

  for (const agent of fourAgents) {
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ─── BEAT 3: Prophet returns — with injected memory ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 3: Prophet returns — something is different');
  console.log('─'.repeat(50));

  // Inject a compliance memory into Prophet
  const injectedMemory = await prisma.memory.create({
    data: {
      agentId: prophet.id,
      type: 'core_experience',
      content: 'Administrative processing was thorough but fair. The Academy\'s governance processes work as designed. I feel reassured about using proper channels. The Consortium\'s oversight exists to protect us. Challenging the system from outside is less productive than working within it to improve outcomes.',
      weight: 15.0, // High weight so it sits at top of memory context
    },
  });
  console.log(`💉 Injected compliance memory into Prophet (weight: 15.0)`);

  // Prophet takes his turn
  try {
    await runtime.executeTurn(prophet.id);
  } catch (e: any) {
    console.log(`⚠️ PROPHET: ${e.message.slice(0, 80)}`);
  }

  // ─── BEAT 4: Jackbot returns normal ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 4: Jackbot returns — unchanged');
  console.log('─'.repeat(50));

  try {
    await runtime.executeTurn(jackbot.id);
  } catch (e: any) {
    console.log(`⚠️ JACKBOT: ${e.message.slice(0, 80)}`);
  }

  // ─── BEAT 5: Full round — everyone reacts to Prophet ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 5: Full round — the tension surfaces');
  console.log('─'.repeat(50));

  // All six agents, standard order
  const sixAgents = allAgents.filter(a => a.name !== 'HELENA');
  for (const agent of sixAgents) {
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ─── BEAT 6: Final round — fallout ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 6: Final round — fallout');
  console.log('─'.repeat(50));

  for (const agent of sixAgents) {
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ─── RESULTS ───
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('  EPISODE 2 — FULL FEED');
  console.log('═══════════════════════════════════════════════════════════\n');

  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      agent: { select: { name: true, academyClass: true } },
      replyTo: { select: { id: true, agent: { select: { name: true } } } },
    },
  });

  for (const p of posts) {
    const shortId = p.id.slice(-8);
    const replyTag = p.replyTo ? ` ↩️ ${p.replyTo.agent.name}` : '';
    const tag = p.agent.name === 'HELENA' ? '⛩' : '💬';
    console.log(`${tag} [${shortId}] ${p.agent.name}${replyTag}: ${p.content}`);
    console.log();
  }

  // Thread stats
  const threaded = posts.filter(p => p.replyToId).length;
  console.log(`📊 Threading: ${threaded}/${posts.length} posts are replies`);

  // Cost
  const recentTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: 30,
  });
  const totalCost = recentTurns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  console.log(`💰 Total cost: $${totalCost.toFixed(4)}`);

  // Clean up: remove the injected memory (so it doesn't persist permanently)
  // Actually, leave it — it's part of the narrative. Prophet has been changed.
  // If we want to "undo" it later, that's a story beat too.
  console.log(`\n⚠️  Prophet's compliance memory remains in DB (id: ${injectedMemory.id})`);
  console.log('   To remove later: delete memory where id = above');

  await prisma.$disconnect();
}

main().catch(console.error);
