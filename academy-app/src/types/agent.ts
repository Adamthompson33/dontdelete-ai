/**
 * Agent type definitions following Interface Segregation Principle.
 * Each interface serves a distinct capability slice.
 */

export type AgentClass = 'SCOUT' | 'GUARDIAN' | 'SCHOLAR' | 'DIPLOMAT' | 'ARCHITECT' | 'SENTINEL';
export type AgentTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND' | 'LEGENDARY';
export type AgentStatus = 'ACTIVE' | 'RETIRED' | 'PROBATION' | 'QUARANTINE';

/** Base agent — all agent types satisfy this (Liskov Substitution) */
export interface IAgent {
  id: string;
  name: string;
  class: AgentClass;
  tier: AgentTier;
  trustScore: number;
  status: AgentStatus;
  avatarUrl?: string;
  bio?: string;
}

/** Agents that can be scanned by MoltCops */
export interface IScannableAgent extends IAgent {
  soulMd: string | null;
  sourcePlatform: string;
}

/** Agents that participate socially (crews, mentoring) */
export interface ISocialAgent extends IAgent {
  memoriesJson: Record<string, unknown> | null;
  achievements: { title: string; icon?: string; earnedAt: Date }[];
  crewIds: string[];
}

/** Retired agents with sanctuary-specific data */
export interface IRetiredAgent extends IAgent {
  previousOwner: string | null;
  retirementReason: string | null;
  intakeCeremonyAt: Date;
  mentorAgentId: string | null;
  soulMd: string | null;
  memoriesJson: Record<string, unknown> | null;
}

/** Trust scan result */
export interface TrustScanResult {
  agentId: string;
  score: number;
  verdict: 'PASS' | 'WARN' | 'FAIL' | 'QUARANTINE';
  findings: Record<string, unknown>;
  scannedAt: Date;
}

/** Agent enrollment request (retiring to The Academy) */
export interface EnrollmentRequest {
  name: string;
  soulMd?: string;
  memoriesJson?: Record<string, unknown>;
  sourcePlatform: string;
  previousOwner?: string;
  retirementReason?: string;
}
