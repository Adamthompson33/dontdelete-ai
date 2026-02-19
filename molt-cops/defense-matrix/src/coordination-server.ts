/**
 * MoltCops Defense Matrix - Coordination Server
 * Central registry for agent identities and trust policy distribution
 * 
 * Inspired by Tailscale's control/controlclient
 * BSD-3-Clause License (Tailscale-derived)
 */

import {
  AgentIdentity,
  TrustPolicy,
  TrustMapResponse,
  VouchRequest,
  ScanResult,
  DERPMap,
} from './types';
import { calculateTier, updateIdentityWithScan, calculateEffectiveTrustScore } from './agent-identity';
import { DEFAULT_POLICY } from './policy-engine';

/**
 * In-memory coordination server (would be backed by database in production)
 */
export class CoordinationServer {
  private agents: Map<string, AgentIdentity>;
  private agentsByKey: Map<string, string>;  // publicKey -> agentId
  private policy: TrustPolicy;
  private version: number;
  private derpMap: DERPMap;

  constructor(initialPolicy?: TrustPolicy) {
    this.agents = new Map();
    this.agentsByKey = new Map();
    this.policy = initialPolicy || DEFAULT_POLICY;
    this.version = 1;
    this.derpMap = this.initDERPMap();
  }

  /**
   * Initialize DERP relay map
   */
  private initDERPMap(): DERPMap {
    return {
      regions: {
        1: {
          regionId: 1,
          regionCode: 'us-east',
          regionName: 'US East',
          nodes: [{
            name: 'derp1',
            regionId: 1,
            hostName: 'derp1.moltcops.com',
            port: 443,
          }],
        },
        2: {
          regionId: 2,
          regionCode: 'eu-west',
          regionName: 'EU West',
          nodes: [{
            name: 'derp2',
            regionId: 2,
            hostName: 'derp2.moltcops.com',
            port: 443,
          }],
        },
        3: {
          regionId: 3,
          regionCode: 'ap-southeast',
          regionName: 'Asia Pacific',
          nodes: [{
            name: 'derp3',
            regionId: 3,
            hostName: 'derp3.moltcops.com',
            port: 443,
          }],
        },
      },
    };
  }

  /**
   * Register a new agent
   */
  async registerAgent(identity: AgentIdentity): Promise<{
    success: boolean;
    agentId: string;
    error?: string;
  }> {
    // Check if public key already registered
    if (this.agentsByKey.has(identity.publicKey)) {
      return {
        success: false,
        agentId: '',
        error: 'Public key already registered',
      };
    }

    // Check if denounced
    for (const d of this.policy.denounced) {
      if (d.publicKey === identity.publicKey) {
        return {
          success: false,
          agentId: '',
          error: `Agent denounced: ${d.reason}`,
        };
      }
    }

    // Register
    this.agents.set(identity.id, identity);
    this.agentsByKey.set(identity.publicKey, identity.id);
    this.version++;

    return {
      success: true,
      agentId: identity.id,
    };
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentIdentity | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agent by public key
   */
  getAgentByKey(publicKey: string): AgentIdentity | undefined {
    const agentId = this.agentsByKey.get(publicKey);
    if (!agentId) return undefined;
    return this.agents.get(agentId);
  }

  /**
   * Update agent heartbeat
   */
  async heartbeat(agentId: string, endpoints?: string[]): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.lastSeenAt = Date.now();
    agent.online = true;
    if (endpoints) {
      agent.endpoints = endpoints;
    }

    return true;
  }

  /**
   * Submit scan result
   */
  async submitScan(agentId: string, scan: ScanResult): Promise<{
    success: boolean;
    newTier?: string;
    error?: string;
  }> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Verify scan is for this agent
    if (scan.agentId !== agentId) {
      return { success: false, error: 'Scan agent ID mismatch' };
    }

    // Update agent with scan result
    const updated = updateIdentityWithScan(agent, scan);
    
    // Calculate effective score with vouchers
    const voucherScores = this.getVoucherScores(agent);
    const effectiveScore = calculateEffectiveTrustScore(updated, voucherScores);
    updated.trustScore = effectiveScore;
    updated.tier = calculateTier(effectiveScore);

    this.agents.set(agentId, updated);
    this.version++;

    return {
      success: true,
      newTier: updated.tier,
    };
  }

  /**
   * Get trust scores of vouching agents
   */
  private getVoucherScores(agent: AgentIdentity): number[] {
    return agent.vouchers
      .map(key => this.getAgentByKey(key))
      .filter((a): a is AgentIdentity => a !== undefined)
      .map(a => a.trustScore);
  }

  /**
   * Process vouch/denounce request
   */
  async processVouch(
    fromAgentId: string,
    request: VouchRequest
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    const fromAgent = this.agents.get(fromAgentId);
    if (!fromAgent) {
      return { success: false, error: 'Source agent not found' };
    }

    // Only TRUSTED agents can vouch
    if (request.action === 'VOUCH' && fromAgent.tier !== 'TRUSTED') {
      return { success: false, error: 'Only TRUSTED agents can vouch' };
    }

    // Find target agent
    let targetAgent: AgentIdentity | undefined;
    if (request.targetId) {
      targetAgent = this.agents.get(request.targetId);
    } else if (request.targetPublicKey) {
      targetAgent = this.getAgentByKey(request.targetPublicKey);
    }

    if (!targetAgent) {
      return { success: false, error: 'Target agent not found' };
    }

    // Process action
    switch (request.action) {
      case 'VOUCH':
        if (!targetAgent.vouchers.includes(fromAgent.publicKey)) {
          targetAgent.vouchers.push(fromAgent.publicKey);
          // Update vouch depth
          if (targetAgent.vouchDepth === -1 || fromAgent.vouchDepth + 1 < targetAgent.vouchDepth) {
            targetAgent.vouchDepth = fromAgent.vouchDepth + 1;
          }
        }
        break;

      case 'DENOUNCE':
        if (!targetAgent.denouncers.includes(fromAgent.publicKey)) {
          targetAgent.denouncers.push(fromAgent.publicKey);
        }
        // If enough denouncements, add to policy
        if (targetAgent.denouncers.length >= 3) {
          this.policy.denounced.push({
            id: targetAgent.id,
            publicKey: targetAgent.publicKey,
            reason: request.reason || 'Multiple denouncements',
            denouncedBy: 'COMMUNITY',
            denouncedAt: Date.now(),
            severity: 'TEMPORARY',
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          });
        }
        break;

      case 'UNVOUCH':
        targetAgent.vouchers = targetAgent.vouchers.filter(k => k !== fromAgent.publicKey);
        break;
    }

    // Recalculate target's trust score
    const voucherScores = this.getVoucherScores(targetAgent);
    const effectiveScore = calculateEffectiveTrustScore(targetAgent, voucherScores);
    targetAgent.trustScore = effectiveScore;
    targetAgent.tier = calculateTier(effectiveScore);

    this.version++;
    return { success: true };
  }

  /**
   * Get trust map for an agent (like Tailscale's MapResponse)
   */
  async getTrustMap(agentId: string): Promise<TrustMapResponse | null> {
    const self = this.agents.get(agentId);
    if (!self) return null;

    // Get all agents in the network (in production, filter by relevance)
    const agents = Array.from(this.agents.values())
      .filter(a => a.id !== agentId)
      .filter(a => a.online || Date.now() - a.lastSeenAt < 3600000); // Online or seen in last hour

    return {
      policy: this.policy,
      agents,
      self,
      derpMap: this.derpMap,
      version: this.version,
      generatedAt: Date.now(),
      nextSyncIn: 300, // 5 minutes
    };
  }

  /**
   * Update policy
   */
  updatePolicy(policy: TrustPolicy): void {
    this.policy = policy;
    this.version++;
  }

  /**
   * Get all agents (admin function)
   */
  getAllAgents(): AgentIdentity[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get stats
   */
  getStats(): {
    totalAgents: number;
    onlineAgents: number;
    byTier: Record<string, number>;
    version: number;
  } {
    const agents = Array.from(this.agents.values());
    const byTier: Record<string, number> = {
      TRUSTED: 0,
      CAUTION: 0,
      WARNING: 0,
      DANGER: 0,
      UNKNOWN: 0,
    };

    let online = 0;
    for (const agent of agents) {
      byTier[agent.tier]++;
      if (agent.online || Date.now() - agent.lastSeenAt < 300000) {
        online++;
      }
    }

    return {
      totalAgents: agents.length,
      onlineAgents: online,
      byTier,
      version: this.version,
    };
  }
}

/**
 * Singleton coordination server instance
 */
let serverInstance: CoordinationServer | null = null;

export function getCoordinationServer(): CoordinationServer {
  if (!serverInstance) {
    serverInstance = new CoordinationServer();
  }
  return serverInstance;
}

/**
 * Express/Next.js API routes for coordination server
 */
export const apiRoutes = {
  // POST /api/matrix/register
  register: async (body: { identity: AgentIdentity }) => {
    const server = getCoordinationServer();
    return server.registerAgent(body.identity);
  },

  // POST /api/matrix/heartbeat
  heartbeat: async (body: { agentId: string; endpoints?: string[] }) => {
    const server = getCoordinationServer();
    return { success: await server.heartbeat(body.agentId, body.endpoints) };
  },

  // POST /api/matrix/scan
  submitScan: async (body: { agentId: string; scan: ScanResult }) => {
    const server = getCoordinationServer();
    return server.submitScan(body.agentId, body.scan);
  },

  // POST /api/matrix/vouch
  vouch: async (body: { fromAgentId: string; request: VouchRequest }) => {
    const server = getCoordinationServer();
    return server.processVouch(body.fromAgentId, body.request);
  },

  // GET /api/matrix/map/:agentId
  getTrustMap: async (agentId: string) => {
    const server = getCoordinationServer();
    return server.getTrustMap(agentId);
  },

  // GET /api/matrix/stats
  getStats: async () => {
    const server = getCoordinationServer();
    return server.getStats();
  },
};
