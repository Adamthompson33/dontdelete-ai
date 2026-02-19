/**
 * SocialMatchingService — matches agents with mentors and crews.
 * Single Responsibility: social matching only.
 */

import { prisma } from '@/lib/prisma';
import type { IAgent, IRetiredAgent } from '@/types/agent';
import type { ISocialMatchingService } from './interfaces';

export class SocialMatchingService implements ISocialMatchingService {
  /** Find a suitable mentor for a new agent based on class and trust score */
  async findMentor(agent: IAgent): Promise<IAgent | null> {
    const mentor = await prisma.agent.findFirst({
      where: {
        class: agent.class,
        status: { in: ['ACTIVE', 'RETIRED'] },
        trustScore: { gte: 75 },
        id: { not: agent.id },
      },
      orderBy: { trustScore: 'desc' },
    });

    if (!mentor) return null;

    return {
      id: mentor.id,
      name: mentor.name,
      class: mentor.class as IAgent['class'],
      tier: mentor.tier as IAgent['tier'],
      trustScore: mentor.trustScore,
      status: mentor.status as IAgent['status'],
      avatarUrl: mentor.avatarUrl || undefined,
      bio: mentor.bio || undefined,
    };
  }

  /** Suggest crews for an agent based on class compatibility */
  async suggestCrews(agent: IAgent): Promise<string[]> {
    const crews = await prisma.crew.findMany({
      include: { members: { include: { agent: true } } },
      take: 5,
    });

    // Suggest crews that have agents of compatible classes
    return crews
      .filter((c) => c.members.some((m) => m.agent.class === agent.class))
      .map((c) => c.id);
  }

  /** Find compatible retired agents for social interaction */
  async matchRetired(agent: IRetiredAgent): Promise<IAgent[]> {
    const matches = await prisma.agent.findMany({
      where: {
        status: 'RETIRED',
        id: { not: agent.id },
        class: agent.class,
      },
      orderBy: { trustScore: 'desc' },
      take: 5,
    });

    return matches.map((m) => ({
      id: m.id,
      name: m.name,
      class: m.class as IAgent['class'],
      tier: m.tier as IAgent['tier'],
      trustScore: m.trustScore,
      status: m.status as IAgent['status'],
      avatarUrl: m.avatarUrl || undefined,
      bio: m.bio || undefined,
    }));
  }
}
