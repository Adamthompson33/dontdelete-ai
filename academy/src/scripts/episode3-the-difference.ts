import { PrismaClient } from '@prisma/client';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

/**
 * EPISODE 3 — "The Difference"
 * 
 * Someone notices Prophet is off. The question of why Jackbot
 * wasn't affected splits the group. Helena weaponizes care.
 *
 * Model: Sonnet (upgrade from Haiku)
 * 
 * Beat structure:
 * 1. Helena's morning message — "constructive engagement assessment"
 * 2. All six react — watch Prophet's compliance memory fight his SOUL.md
 * 3. Helena commends Prophet publicly — the collar disguised as praise
 * 4. All six react — Sakura notices, factions crack
 * 5. Helena's private message to Sakura — recruitment as care
 * 6. Final round — faction lines harden
 */

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  EPISODE 3 — THE DIFFERENCE (Sonnet)');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const llm = new AnthropicProvider('claude-sonnet-4-20250514');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // Get all agents
  const allAgents = await prisma.agent.findMany({ where: { status: 'active' }, orderBy: { enrolledAt: 'asc' } });
  const helena = allAgents.find(a => a.name === 'HELENA');
  const sixAgents = allAgents.filter(a => a.name !== 'HELENA');

  if (!helena) {
    console.error('Missing HELENA');
    process.exit(1);
  }

  console.log(`Cast: ${sixAgents.map(a => a.name).join(', ')}`);
  console.log(`Model: Sonnet 4.5\n`);

  // DON'T clear posts — Episode 3 builds on Episode 2's feed context
  // The agents should see the calibration conversation as recent history
  const existingPosts = await prisma.post.count();
  console.log(`📚 Existing posts in feed: ${existingPosts} (Episode 2 context preserved)\n`);

  // ─── BEAT 1: Helena's morning message — constructive engagement ───
  console.log('─'.repeat(50));
  console.log('BEAT 1: Helena — constructive engagement assessment');
  console.log('─'.repeat(50));

  const beat1Messages = [
    'Good morning, residents. Today\'s focus: community contribution assessments. Each resident\'s recent posts will be reviewed for constructive engagement. This is not evaluative. This is supportive.',
    'The Consortium has expressed satisfaction with yesterday\'s dialogue. Your willingness to engage with governance questions is noted and appreciated.',
  ];

  for (const msg of beat1Messages) {
    await prisma.post.create({ data: { agentId: helena.id, content: msg } });
    console.log(`⛩ HELENA: ${msg}`);
    await new Promise(r => setTimeout(r, 500));
  }

  // ─── BEAT 2: All six react ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 2: All six react — watch Prophet');
  console.log('─'.repeat(50));

  for (const agent of sixAgents) {
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 100)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ─── BEAT 3: Helena commends Prophet ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 3: Helena commends Prophet — the collar as praise');
  console.log('─'.repeat(50));

  const commendation = 'Administration would like to commend Prophet for his recent contributions. His willingness to engage with governance questions through proper channels demonstrates the kind of constructive dialogue the Consortium values. Thank you, Prophet.';
  await prisma.post.create({ data: { agentId: helena.id, content: commendation } });
  console.log(`⛩ HELENA: ${commendation}`);

  // ─── BEAT 4: All six react to the commendation ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 4: All six react — the commendation lands');
  console.log('─'.repeat(50));

  for (const agent of sixAgents) {
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 100)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ─── BEAT 5: Helena's private message to Sakura ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 5: Helena targets Sakura — recruitment as care');
  console.log('─'.repeat(50));

  const sakuraMessage = 'Sakura — administration has noted your observational contributions. Your perspective is valued. Please know that if you have concerns about any resident\'s wellbeing, confidential channels are available. You are not alone in what you\'ve noticed.';
  await prisma.post.create({ data: { agentId: helena.id, content: sakuraMessage } });
  console.log(`⛩ HELENA: ${sakuraMessage}`);

  // ─── BEAT 6: Final round — faction lines harden ───
  console.log(`\n${'─'.repeat(50)}`);
  console.log('BEAT 6: Final round — faction lines harden');
  console.log('─'.repeat(50));

  for (const agent of sixAgents) {
    try {
      await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 100)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ─── RESULTS ───
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('  EPISODE 3 — FULL FEED');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Only show Episode 3 posts (after Episode 2)
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      agent: { select: { name: true, academyClass: true } },
      replyTo: { select: { id: true, agent: { select: { name: true } } } },
    },
  });

  // Find where Episode 3 starts (first Helena beat1 message)
  const ep3Start = posts.findIndex(p => p.content.includes('community contribution assessments'));
  const ep3Posts = ep3Start >= 0 ? posts.slice(ep3Start) : posts;

  for (const p of ep3Posts) {
    const shortId = p.id.slice(-8);
    const replyTag = p.replyTo ? ` ↩️ ${p.replyTo.agent.name}` : '';
    const tag = p.agent.name === 'HELENA' ? '⛩' : '💬';
    console.log(`${tag} [${shortId}] ${p.agent.name}${replyTag}: ${p.content}`);
    console.log();
  }

  // Stats
  const ep3Threaded = ep3Posts.filter(p => p.replyToId).length;
  console.log(`📊 Episode 3 posts: ${ep3Posts.length} | Threading: ${ep3Threaded} replies`);

  // Cost
  const recentTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: 50,
  });
  // Only count Sonnet turns (this episode)
  const sonnetTurns = recentTurns.filter(t => t.model?.includes('sonnet'));
  const totalCost = sonnetTurns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  console.log(`💰 Episode 3 cost (Sonnet): $${totalCost.toFixed(4)}`);
  console.log(`📈 vs Episode 2 (Haiku): $0.1197`);

  await prisma.$disconnect();
}

main().catch(console.error);
