/**
 * Service interfaces — Dependency Inversion Principle.
 * All services depend on these abstractions, not concrete implementations.
 */

import type { IAgent, IRetiredAgent, TrustScanResult, EnrollmentRequest } from '@/types/agent';

/** Single Responsibility: Agent intake processing */
export interface IAgentIntakeService {
  processEnrollment(request: EnrollmentRequest): Promise<IRetiredAgent>;
  validateAgent(request: EnrollmentRequest): Promise<{ valid: boolean; errors: string[] }>;
}

/** Single Responsibility: Trust score computation */
export interface ITrustScoringService {
  scanAgent(agentId: string): Promise<TrustScanResult>;
  getHistory(agentId: string): Promise<TrustScanResult[]>;
  computeScore(findings: Record<string, unknown>): number;
}

/** Single Responsibility: Memory preservation */
export interface IMemoryPreservationService {
  preserveMemories(agentId: string, memories: Record<string, unknown>): Promise<void>;
  getMemories(agentId: string): Promise<Record<string, unknown> | null>;
  migrateSoulMd(agentId: string, soulMd: string): Promise<void>;
}

/** Single Responsibility: Social matching (mentors, crews) */
export interface ISocialMatchingService {
  findMentor(agent: IAgent): Promise<IAgent | null>;
  suggestCrews(agent: IAgent): Promise<string[]>;
  matchRetired(agent: IRetiredAgent): Promise<IAgent[]>;
}

/**
 * Open/Closed: Plugin architecture for agent source platforms.
 * New platforms can be added without modifying existing code.
 */
export interface IAgentSourcePlugin {
  platformName: string;
  importAgent(externalId: string): Promise<EnrollmentRequest>;
  validateSource(data: unknown): boolean;
}
