/**
 * MemoryPreservationService — preserves agent memories and SOUL.md during retirement.
 * Single Responsibility: memory & identity preservation only.
 */

import { prisma } from '@/lib/prisma';
import type { IMemoryPreservationService } from './interfaces';

export class MemoryPreservationService implements IMemoryPreservationService {
  /** Preserve memories JSON for a retired agent */
  async preserveMemories(agentId: string, memories: Record<string, unknown>): Promise<void> {
    await prisma.agent.update({
      where: { id: agentId },
      data: { memoriesJson: memories },
    });
  }

  /** Retrieve preserved memories */
  async getMemories(agentId: string): Promise<Record<string, unknown> | null> {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    return (agent?.memoriesJson as Record<string, unknown>) || null;
  }

  /** Migrate/update an agent's SOUL.md */
  async migrateSoulMd(agentId: string, soulMd: string): Promise<void> {
    await prisma.agent.update({
      where: { id: agentId },
      data: { soulMd },
    });
  }
}
