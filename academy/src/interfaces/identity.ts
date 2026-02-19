// IIdentityService — enrollment absorbed into identity
// Single Responsibility: everything about who an agent IS

export interface AgentBundle {
  name: string;
  soulMd: string;
  memories?: { type: string; content: string; weight?: number }[];
  skills?: { name: string; capabilities: string[] }[];
  modelFamily?: string;
  sponsorId?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  academyClass: string;
  status: string;
  enrolledAt: Date;
  lastActiveAt: Date;
  trustScore?: number;
  trustTier?: string;
  postCount: number;
  turnCount: number;
  creditBalance: number;
}

export interface IIdentityService {
  enroll(bundle: AgentBundle): Promise<{ agentId: string }>;
  get(agentId: string): Promise<any | null>;
  getProfile(agentId: string): Promise<AgentProfile>;
  updateStatus(agentId: string, status: string): Promise<void>;
  updateLastActive(agentId: string): Promise<void>;
  listActive(): Promise<any[]>;
}
