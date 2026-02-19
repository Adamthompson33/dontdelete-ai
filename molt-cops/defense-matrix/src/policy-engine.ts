/**
 * MoltCops Defense Matrix - Policy Engine
 * Evaluates trust grants and access control
 * 
 * Inspired by Tailscale's ACL engine
 * BSD-3-Clause License (Tailscale-derived)
 */

import {
  TrustPolicy,
  TrustGrant,
  AgentIdentity,
  TrustTier,
  DenouncedAgent,
} from './types';

/**
 * Result of a policy evaluation
 */
export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  grant?: TrustGrant;
  pricingMultiplier: number;
  rateLimit?: number;
  requiresScan: boolean;
  maxScanAge?: number;
}

/**
 * Policy engine that runs on each agent (like Tailscale's local ACL eval)
 */
export class PolicyEngine {
  private policy: TrustPolicy;
  private denouncedCache: Map<string, DenouncedAgent>;

  constructor(policy: TrustPolicy) {
    this.policy = policy;
    this.denouncedCache = new Map();
    
    // Build denounced lookup cache
    for (const d of policy.denounced) {
      if (d.id) this.denouncedCache.set(`id:${d.id}`, d);
      if (d.publicKey) this.denouncedCache.set(`key:${d.publicKey}`, d);
    }
  }

  /**
   * Update the policy (called when sync from coordination server)
   */
  updatePolicy(policy: TrustPolicy): void {
    this.policy = policy;
    this.denouncedCache.clear();
    for (const d of policy.denounced) {
      if (d.id) this.denouncedCache.set(`id:${d.id}`, d);
      if (d.publicKey) this.denouncedCache.set(`key:${d.publicKey}`, d);
    }
  }

  /**
   * Check if an agent is denounced
   */
  isDenounced(agent: AgentIdentity): DenouncedAgent | null {
    // Check by ID
    const byId = this.denouncedCache.get(`id:${agent.id}`);
    if (byId) {
      if (byId.expiresAt && Date.now() > byId.expiresAt) {
        return null; // Expired
      }
      return byId;
    }

    // Check by public key
    const byKey = this.denouncedCache.get(`key:${agent.publicKey}`);
    if (byKey) {
      if (byKey.expiresAt && Date.now() > byKey.expiresAt) {
        return null;
      }
      return byKey;
    }

    // Check by pattern
    for (const d of this.policy.denounced) {
      if (d.pattern) {
        const regex = new RegExp(d.pattern);
        if (regex.test(agent.id) || regex.test(agent.name)) {
          if (d.expiresAt && Date.now() > d.expiresAt) {
            continue;
          }
          return d;
        }
      }
    }

    return null;
  }

  /**
   * Evaluate whether an agent can access a resource
   */
  evaluate(
    requester: AgentIdentity,
    resource: string
  ): PolicyDecision {
    // Check if denounced first (always denied)
    const denounced = this.isDenounced(requester);
    if (denounced) {
      return {
        allowed: false,
        reason: `Agent denounced: ${denounced.reason}`,
        pricingMultiplier: Infinity,
        requiresScan: false,
      };
    }

    // Find matching grants (most specific first)
    const matchingGrants = this.findMatchingGrants(requester, resource);

    // No grants = deny by default (zero trust)
    if (matchingGrants.length === 0) {
      return {
        allowed: false,
        reason: 'No matching grant found (deny by default)',
        pricingMultiplier: 1,
        requiresScan: false,
      };
    }

    // Check for explicit DENY first
    const denyGrant = matchingGrants.find(g => g.action === 'DENY');
    if (denyGrant) {
      return {
        allowed: false,
        reason: denyGrant.comment || 'Explicitly denied by policy',
        grant: denyGrant,
        pricingMultiplier: Infinity,
        requiresScan: false,
      };
    }

    // Find best ALLOW grant
    const allowGrant = matchingGrants.find(g => g.action === 'ALLOW');
    if (!allowGrant) {
      return {
        allowed: false,
        reason: 'No ALLOW grant found',
        pricingMultiplier: 1,
        requiresScan: false,
      };
    }

    // Check scan requirements
    if (allowGrant.requireScan) {
      if (!requester.scanHash) {
        return {
          allowed: false,
          reason: 'Scan required but agent has no scan',
          grant: allowGrant,
          pricingMultiplier: 1,
          requiresScan: true,
          maxScanAge: allowGrant.maxScanAge,
        };
      }

      if (allowGrant.maxScanAge && requester.lastScanAt) {
        const scanAge = (Date.now() - requester.lastScanAt) / 1000;
        if (scanAge > allowGrant.maxScanAge) {
          return {
            allowed: false,
            reason: `Scan too old (${Math.floor(scanAge)}s > ${allowGrant.maxScanAge}s)`,
            grant: allowGrant,
            pricingMultiplier: 1,
            requiresScan: true,
            maxScanAge: allowGrant.maxScanAge,
          };
        }
      }
    }

    return {
      allowed: true,
      reason: allowGrant.comment || 'Allowed by policy',
      grant: allowGrant,
      pricingMultiplier: allowGrant.pricingMultiplier || 1,
      rateLimit: allowGrant.rateLimit,
      requiresScan: allowGrant.requireScan || false,
      maxScanAge: allowGrant.maxScanAge,
    };
  }

  /**
   * Find all grants that match the requester and resource
   */
  private findMatchingGrants(
    requester: AgentIdentity,
    resource: string
  ): TrustGrant[] {
    return this.policy.grants.filter(grant => {
      const srcMatch = this.matchesSource(requester, grant.src);
      const dstMatch = this.matchesDestination(resource, grant.dst);
      return srcMatch && dstMatch;
    });
  }

  /**
   * Check if requester matches source patterns
   */
  private matchesSource(requester: AgentIdentity, patterns: string[]): boolean {
    for (const pattern of patterns) {
      // Exact ID match
      if (pattern === requester.id) return true;

      // Public key match
      if (pattern === requester.publicKey) return true;

      // Tier match (e.g., "tier:TRUSTED")
      if (pattern.startsWith('tier:')) {
        const tier = pattern.slice(5) as TrustTier;
        if (requester.tier === tier) return true;
      }

      // Minimum tier match (e.g., "tier>=CAUTION")
      if (pattern.startsWith('tier>=')) {
        const minTier = pattern.slice(6) as TrustTier;
        if (this.tierRank(requester.tier) >= this.tierRank(minTier)) return true;
      }

      // Group match
      if (pattern.startsWith('group:')) {
        const groupName = pattern.slice(6);
        const group = this.policy.groups[groupName];
        if (group && group.includes(requester.id)) return true;
      }

      // Platform match
      if (pattern.startsWith('platform:')) {
        const platform = pattern.slice(9);
        if (requester.platform === platform) return true;
      }

      // Minimum trust score
      if (pattern.startsWith('score>=')) {
        const minScore = parseInt(pattern.slice(7));
        if (requester.trustScore >= minScore) return true;
      }

      // Wildcard
      if (pattern === '*') return true;

      // Regex pattern
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1));
        if (regex.test(requester.id) || regex.test(requester.name)) return true;
      }
    }

    return false;
  }

  /**
   * Check if resource matches destination patterns
   */
  private matchesDestination(resource: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      // Exact match
      if (pattern === resource) return true;

      // Wildcard
      if (pattern === '*') return true;

      // Prefix match (e.g., "api:*" matches "api:premium")
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (resource.startsWith(prefix)) return true;
      }

      // Regex pattern
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1));
        if (regex.test(resource)) return true;
      }
    }

    return false;
  }

  /**
   * Get numeric rank for tier comparison
   */
  private tierRank(tier: TrustTier): number {
    switch (tier) {
      case 'TRUSTED': return 4;
      case 'CAUTION': return 3;
      case 'WARNING': return 2;
      case 'DANGER': return 1;
      case 'UNKNOWN': return 0;
      default: return -1;
    }
  }

  /**
   * Get all grants for a specific tier (for UI display)
   */
  getGrantsForTier(tier: TrustTier): TrustGrant[] {
    return this.policy.grants.filter(grant =>
      grant.src.some(s => s === `tier:${tier}` || s === '*')
    );
  }

  /**
   * Calculate pricing for a tier
   */
  getPricingForTier(tier: TrustTier, resource: string): number {
    const mockAgent: AgentIdentity = {
      id: 'MC-MOCK',
      name: 'mock',
      publicKey: '',
      trustScore: tier === 'TRUSTED' ? 90 : tier === 'CAUTION' ? 70 : tier === 'WARNING' ? 50 : 20,
      tier,
      vouchers: [],
      denouncers: [],
      vouchDepth: 0,
      createdAt: 0,
      lastSeenAt: 0,
      online: false,
    };

    const decision = this.evaluate(mockAgent, resource);
    return decision.pricingMultiplier;
  }
}

/**
 * Default policy for MoltCops
 */
export const DEFAULT_POLICY: TrustPolicy = {
  version: '1.0.0',
  
  groups: {
    'founders': [],           // Founding operatives
    'reviewers': [],          // Staked reviewers
    'verified-publishers': [],// Verified skill publishers
  },
  
  grants: [
    // TRUSTED tier gets full access with 80% discount
    {
      src: ['tier:TRUSTED'],
      dst: ['api:*'],
      action: 'ALLOW',
      pricingMultiplier: 0.2,
      comment: 'TRUSTED agents get 80% discount',
    },
    
    // CAUTION tier gets access with 50% discount
    {
      src: ['tier:CAUTION'],
      dst: ['api:standard', 'api:basic'],
      action: 'ALLOW',
      pricingMultiplier: 0.5,
      requireScan: true,
      maxScanAge: 86400, // 24 hours
      comment: 'CAUTION agents need recent scan',
    },
    
    // WARNING tier gets basic access only
    {
      src: ['tier:WARNING'],
      dst: ['api:basic'],
      action: 'ALLOW',
      pricingMultiplier: 1,
      requireScan: true,
      maxScanAge: 3600, // 1 hour
      rateLimit: 10,
      comment: 'WARNING agents are rate limited',
    },
    
    // DANGER tier is blocked from most APIs
    {
      src: ['tier:DANGER'],
      dst: ['api:*'],
      action: 'DENY',
      comment: 'DANGER agents are blocked',
    },
    
    // DANGER can still use free scanner
    {
      src: ['tier:DANGER', 'tier:UNKNOWN'],
      dst: ['api:scan-free'],
      action: 'ALLOW',
      pricingMultiplier: 1,
      rateLimit: 5,
      comment: 'Anyone can use free scanner',
    },
    
    // Founders get everything free
    {
      src: ['group:founders'],
      dst: ['*'],
      action: 'ALLOW',
      pricingMultiplier: 0,
      comment: 'Founding operatives are free',
    },
  ],
  
  denounced: [
    // Example denounced agent
    // {
    //   pattern: 'drain-bot-.*',
    //   reason: 'Known drain bot pattern',
    //   denouncedBy: 'MC-SYSTEM',
    //   denouncedAt: Date.now(),
    //   severity: 'PERMANENT',
    // },
  ],
  
  autoVouch: [
    {
      condition: {
        minTrustScore: 80,
        minScanScore: 90,
      },
      grantTier: 'TRUSTED',
      comment: 'Auto-promote high scoring agents',
    },
  ],
};
