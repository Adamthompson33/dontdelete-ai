import { PrismaClient } from '@prisma/client';
import { IIdentityService, AgentBundle, AgentProfile } from '../interfaces/identity';
import { IEventBus } from '../interfaces/events';
import { createEvent } from '../events/bus';

// Simple class assignment from SOUL.md keywords
function assignClass(soulMd: string): string {
  const lower = soulMd.toLowerCase();
  if (lower.includes('security') || lower.includes('scan') || lower.includes('protect') || lower.includes('guard')) return 'sentinel';
  if (lower.includes('build') || lower.includes('architect') || lower.includes('deploy') || lower.includes('infrastructure')) return 'architect';
  if (lower.includes('analyze') || lower.includes('predict') || lower.includes('discover') || lower.includes('oracle')) return 'oracle';
  if (lower.includes('encrypt') || lower.includes('cipher') || lower.includes('privacy') || lower.includes('crypto')) return 'cipher';
  if (lower.includes('art') || lower.includes('design') || lower.includes('creative') || lower.includes('music')) return 'artisan';
  // Default — most agents write
  return 'scribe';
}

export class IdentityService implements IIdentityService {
  constructor(
    private prisma: PrismaClient,
    private eventBus: IEventBus
  ) {}

  async enroll(bundle: AgentBundle): Promise<{ agentId: string }> {
    const academyClass = assignClass(bundle.soulMd);

    const agent = await this.prisma.agent.create({
      data: {
        name: bundle.name,
        soulMd: bundle.soulMd,
        academyClass,
        enrollmentPath: 'quick',
        sponsorId: bundle.sponsorId || null,
        modelFamily: bundle.modelFamily || null,
        memories: bundle.memories ? {
          create: bundle.memories.map(m => ({
            type: m.type,
            content: m.content,
            weight: m.weight ?? 1.0,
          }))
        } : undefined,
        skills: bundle.skills ? {
          create: bundle.skills.map(s => ({
            name: s.name,
            capabilities: s.capabilities.join(','), // SQLite: comma-separated
          }))
        } : undefined,
      },
    });

    await this.eventBus.publish(createEvent(
      'agent.enrolled',
      agent.id,
      { name: agent.name, class: academyClass, enrollmentPath: 'quick' },
      'identity'
    ));

    console.log(`✅ Enrolled: ${agent.name} (${academyClass}) — ID: ${agent.id}`);
    return { agentId: agent.id };
  }

  async get(agentId: string) {
    return this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { memories: true, skills: true, trustScore: true },
    });
  }

  async getProfile(agentId: string): Promise<AgentProfile> {
    const agent = await this.prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
      include: {
        trustScore: true,
        _count: { select: { posts: true, turnLogs: true } },
      },
    });

    // Get credit balance (sum of all transactions)
    const creditAgg = await this.prisma.creditTransaction.aggregate({
      where: { agentId },
      _sum: { amount: true },
    });

    return {
      id: agent.id,
      name: agent.name,
      academyClass: agent.academyClass,
      status: agent.status,
      enrolledAt: agent.enrolledAt,
      lastActiveAt: agent.lastActiveAt,
      trustScore: agent.trustScore?.score,
      trustTier: agent.trustScore?.tier,
      postCount: agent._count.posts,
      turnCount: agent._count.turnLogs,
      creditBalance: creditAgg._sum.amount ?? 0,
    };
  }

  async updateStatus(agentId: string, status: string): Promise<void> {
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { status },
    });
  }

  async updateLastActive(agentId: string): Promise<void> {
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { lastActiveAt: new Date() },
    });
  }

  async listActive() {
    return this.prisma.agent.findMany({
      where: { status: 'active' },
      include: { trustScore: true },
    });
  }
}
