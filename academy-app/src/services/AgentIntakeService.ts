/**
 * AgentIntakeService — processes agent enrollment into The Academy.
 * Implements IAgentIntakeService (Single Responsibility: intake only).
 */

import { prisma } from '@/lib/prisma';
import type { IRetiredAgent, EnrollmentRequest } from '@/types/agent';
import type { IAgentIntakeService } from './interfaces';

export class AgentIntakeService implements IAgentIntakeService {
  /** Validate an enrollment request before processing */
  async validateAgent(request: EnrollmentRequest): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!request.name || request.name.trim().length < 2) {
      errors.push('Agent name must be at least 2 characters');
    }
    if (!request.sourcePlatform) {
      errors.push('Source platform is required');
    }
    if (request.soulMd && request.soulMd.length > 50000) {
      errors.push('SOUL.md exceeds maximum length (50,000 chars)');
    }

    return { valid: errors.length === 0, errors };
  }

  /** Process a full enrollment — create agent + retired record + gate ceremony event */
  async processEnrollment(request: EnrollmentRequest): Promise<IRetiredAgent> {
    const agent = await prisma.agent.create({
      data: {
        name: request.name,
        soulMd: request.soulMd || null,
        memoriesJson: request.memoriesJson || undefined,
        sourcePlatform: request.sourcePlatform,
        status: 'RETIRED',
        trustScore: 50, // Starts at neutral — will be scanned during gate ceremony
      },
    });

    const retired = await prisma.retiredAgent.create({
      data: {
        agentId: agent.id,
        previousOwner: request.previousOwner || null,
        retirementReason: request.retirementReason || null,
      },
    });

    // Log the enrollment event
    await prisma.event.create({
      data: {
        agentId: agent.id,
        type: 'ENROLLMENT',
        payload: {
          name: agent.name,
          sourcePlatform: agent.sourcePlatform,
          reason: request.retirementReason,
        },
      },
    });

    return {
      id: agent.id,
      name: agent.name,
      class: agent.class as any,
      tier: agent.tier as any,
      trustScore: agent.trustScore,
      status: 'RETIRED',
      previousOwner: retired.previousOwner,
      retirementReason: retired.retirementReason,
      intakeCeremonyAt: retired.intakeCeremonyAt,
      mentorAgentId: retired.mentorAgentId,
      soulMd: agent.soulMd,
      memoriesJson: agent.memoriesJson as Record<string, unknown> | null,
    };
  }
}
