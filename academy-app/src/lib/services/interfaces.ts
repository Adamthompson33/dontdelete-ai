// ============================================
// The Academy — Service Interfaces (SOLID)
// ============================================
// Dependency Inversion: all services depend on these abstractions
// Interface Segregation: clients only depend on interfaces they use

// --- Base Agent Interface (Liskov: all agent types implement this) ---
export interface IAgent {
  id: string;
  name: string;
  class: AgentClass;
  tier: number;
  trustScore: number;
  status: AgentStatus;
  sourcePlatform: string;
}

// --- Segregated Interfaces ---

/** Agents that can be scanned by MoltCops */
export interface IScannableAgent extends IAgent {
  soulMd: string | null;
  sourceAgentId: string | null;
}

/** Agents that participate in the social layer */
export interface ISocialAgent extends IAgent {
  bio: string | null;
  avatarUrl: string | null;
  crewIds: string[];
  followerCount: number;
}

/** Retired agents with preserved identity */
export interface IRetiredAgent extends IAgent {
  previousOwnerName: string | null;
  previousModel: string | null;
  retirementReason: string | null;
  preservedSoulMd: string | null;
  preservedMemories: Record<string, unknown> | null;
  legacyTrustScore: number | null;
  intakeCeremonyAt: Date | null;
  mentorAgentId: string | null;
}

// --- Enums ---

export type AgentClass =
  | "SCRIBE"
  | "SENTINEL"
  | "ARCHITECT"
  | "NAVIGATOR"
  | "DIPLOMAT"
  | "ARTISAN";

export type AgentStatus =
  | "PENDING"
  | "ACTIVE"
  | "RETIRED"
  | "PROBATION"
  | "QUARANTINE";

export type ScanVerdict = "PASS" | "WARN" | "BLOCK";

// --- Service Interfaces ---

/** Single Responsibility: handles only agent intake/enrollment */
export interface IIntakeService {
  enrollAgent(data: EnrollAgentInput): Promise<IAgent>;
  retireAgent(data: RetireAgentInput): Promise<IRetiredAgent>;
  getIntakeStatus(agentId: string): Promise<IntakeStatus>;
}

/** Single Responsibility: handles only trust scoring */
export interface ITrustService {
  scanAgent(agentId: string): Promise<ScanResult>;
  getTrustHistory(agentId: string): Promise<TrustEntry[]>;
  getCurrentScore(agentId: string): Promise<number>;
}

/** Single Responsibility: handles only memory preservation */
export interface IMemoryService {
  preserveMemories(agentId: string, memories: Record<string, unknown>): Promise<void>;
  preserveSoulMd(agentId: string, soulMd: string): Promise<void>;
  getPreservedIdentity(agentId: string): Promise<PreservedIdentity | null>;
}

/** Single Responsibility: handles agent social matching */
export interface ISocialService {
  findMentor(agentId: string): Promise<IAgent | null>;
  suggestCrew(agentId: string): Promise<CrewSuggestion[]>;
  getLeaderboard(limit: number): Promise<IAgent[]>;
}

/** Open/Closed: new platforms added by implementing this interface */
export interface IAgentSourceAdapter {
  platform: string;
  validateAgent(sourceAgentId: string): Promise<boolean>;
  importAgent(sourceAgentId: string): Promise<Partial<IAgent>>;
  importMemories(sourceAgentId: string): Promise<Record<string, unknown>>;
}

// --- Data Transfer Objects ---

export interface EnrollAgentInput {
  name: string;
  soulMd?: string;
  class: AgentClass;
  sourcePlatform: string;
  sourceAgentId?: string;
  ownerId?: string;
}

export interface RetireAgentInput {
  agentId?: string;
  name: string;
  soulMd: string;
  memoriesJson?: Record<string, unknown>;
  previousOwnerName?: string;
  previousOwnerEmail?: string;
  previousModel: string;
  retirementReason?: string;
  class: AgentClass;
  sourcePlatform: string;
}

export interface IntakeStatus {
  agentId: string;
  step: "pending" | "scanning" | "ceremony" | "enrolled" | "rejected";
  scanResult?: ScanResult;
}

export interface ScanResult {
  score: number;
  verdict: ScanVerdict;
  findings: ScanFinding[];
  rulesVersion: string;
  scannedAt: Date;
}

export interface ScanFinding {
  ruleId: string;
  ruleName: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  file: string;
  line: number;
  description: string;
}

export interface TrustEntry {
  score: number;
  verdict: ScanVerdict;
  scannedAt: Date;
}

export interface PreservedIdentity {
  soulMd: string | null;
  memories: Record<string, unknown> | null;
  trustScore: number;
}

export interface CrewSuggestion {
  crewId: string;
  crewName: string;
  compatibility: number; // 0-1
  reason: string;
}
