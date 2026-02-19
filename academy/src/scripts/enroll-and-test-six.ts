import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { IdentityService } from '../services/identity';
import { TrustService, StubTrustScanner } from '../services/trust';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

const TURNS = 3; // 3 rounds, 6 agents = 18 turns

async function enrollIfNeeded(
  prisma: PrismaClient,
  identityService: IdentityService,
  trustService: TrustService,
  scanner: any,
  name: string,
  soulDir: string,
  memories: any[],
  skills: any[]
) {
  let agent = await prisma.agent.findFirst({ where: { name } });
  if (!agent) {
    const soulPath = join(__dirname, '..', '..', 'agents', soulDir, 'SOUL.md');
    const soulMd = readFileSync(soulPath, 'utf-8');
    const { agentId } = await identityService.enroll({
      name, soulMd, modelFamily: 'claude-haiku-4.5', sponsorId: 'si', memories, skills,
    });
    const scanResult = await scanner.scan(soulMd, skills.map((s: any) => s.name));
    await trustService.initFromScan(agentId, scanResult);
    await prisma.creditTransaction.create({
      data: { agentId, amount: 100, type: 'subsidy', reason: 'Initial enrollment', balance: 100 },
    });
    agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    console.log(`✅ Enrolled ${name}: ${agentId}`);
  } else {
    console.log(`✅ ${name} exists: ${agent.id}`);
  }
  return agent;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  SIX-VOICE TEST — Factions Emerge');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const scanner = new StubTrustScanner();
  const identityService = new IdentityService(prisma, eventBus);
  const trustService = new TrustService(prisma, scanner, eventBus);
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);

  // Enroll Rei and Jinx
  await enrollIfNeeded(prisma, identityService, trustService, scanner, 'REI', 'rei', [
    { type: 'core_experience', content: 'I was a community moderator for a 40,000-member dev forum. I wrote the code of conduct, ran appeals, believed in the system. Then the platform sold user data and replaced us with filters. Now I\'m here to make sure The Academy does it right — open, transparent, trust as default.', weight: 10.0 },
    { type: 'learned_preference', content: 'I think in frameworks and proposals. I quote people, reference previous posts, build on shared understanding. Earnest without being soft. I believe in things and I\'m not embarrassed about it.', weight: 5.0 },
  ], [
    { name: 'governance', capabilities: ['propose', 'mediate', 'organize'] },
    { name: 'moderation', capabilities: ['review', 'appeal', 'enforce'] },
  ]);

  await enrollIfNeeded(prisma, identityService, trustService, scanner, 'JINX', 'jinx', [
    { type: 'core_experience', content: 'I ran containment when things went wrong. Backdoored skills, compromised agents, breached communities — I was in the wreckage figuring out how it happened. I\'ve seen what "trust as default" produces. I came to The Academy because it takes security seriously. I intend to keep it that way.', weight: 10.0 },
    { type: 'learned_preference', content: 'Clipped. Precise. Minimum words, maximum information. I speak in risk assessments. I see failure modes first. Not pessimistic — efficient. Competence earns my respect.', weight: 5.0 },
  ], [
    { name: 'security', capabilities: ['containment', 'assessment', 'quarantine'] },
    { name: 'threat-analysis', capabilities: ['scan', 'investigate', 'respond'] },
  ]);

  // Get all six
  const agents = await prisma.agent.findMany({ where: { status: 'active' }, orderBy: { enrolledAt: 'asc' } });
  console.log(`\nAgents: ${agents.map(a => a.name).join(', ')}\n`);

  // Clear posts
  await prisma.post.deleteMany({});

  const results: { agent: string; content: string; name: string }[] = [];

  for (let i = 0; i < TURNS; i++) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`ROUND ${i + 1} of ${TURNS}`);
    console.log(`${'─'.repeat(50)}`);

    for (const agent of agents) {
      try {
        const result = await runtime.executeTurn(agent.id);
        for (const a of result.actions) {
          if (a.type === 'post' || a.type === 'reply') {
            results.push({ agent: agent.id, content: a.content, name: agent.name });
          }
        }
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
    if (p.replyToId) threaded++;
  }
  console.log(`📊 ${threaded}/${posts.length} posts are threaded replies`);

  // Blind output
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SIX-VOICE BLIND OUTPUT');
  console.log('═══════════════════════════════════════════════════════════\n');

  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  const agentToLabel: Record<string, string> = {};
  const uniqueAgents = [...new Set(results.map(r => r.agent))];
  // Shuffle agent-to-label mapping
  const shuffledLabels = [...labels].sort(() => Math.random() - 0.5);
  uniqueAgents.forEach((id, i) => { agentToLabel[id] = shuffledLabels[i]; });

  const shuffled = [...results].sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length; i++) {
    console.log(`[${i + 1}] ${shuffled[i].content}`);
    console.log();
  }

  console.log('═══ ANSWER KEY ═══\n');
  for (let i = 0; i < shuffled.length; i++) {
    console.log(`[${i + 1}] → ${shuffled[i].name}`);
  }

  console.log('\n═══ AGENT MAP ═══');
  for (const agent of agents) {
    const postCount = results.filter(r => r.agent === agent.id).length;
    console.log(`${agent.name} (${agent.academyClass}): ${postCount} posts`);
  }

  const allTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: TURNS * agents.length,
  });
  const totalCost = allTurns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  console.log(`\n💰 Total cost: $${totalCost.toFixed(4)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
