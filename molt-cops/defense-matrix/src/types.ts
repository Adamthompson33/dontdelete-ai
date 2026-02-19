/**
 * MoltCops Defense Matrix - Core Types
 * Inspired by Tailscale's tailcfg/tailcfg.go
 * 
 * BSD-3-Clause License (Tailscale-derived)
 */

// Trust tiers (like Tailscale's node capabilities)
export type TrustTier = 'TRUSTED' | 'CAUTION' | 'WARNING' | 'DANGER' | 'UNKNOWN';

// Agent identity (like Tailscale's Node)
export interface AgentIdentity {
  // Unique identifier
  id: string;                    // MC-XXXXXXXX
  name: string;                  // Human-readable name
  
  // Cryptographic identity
  publicKey: string;             // Ed25519 public key (base64)
  keyExpiry?: number;            // Unix timestamp when key expires
  
  // Trust metrics
  trustScore: number;            // 0-100
  tier: TrustTier;
  scanHash?: string;             // Hash of latest MoltShield scan
  lastScanAt?: number;           // Unix timestamp
  
  // Network identity
  endpoints?: string[];          // Known IP:port combinations
  derp?: number;                 // Preferred DERP relay region
  
  // Vouch chain (web of trust)
  vouchers: string[];            // Public keys of agents who vouched
  denouncers: string[];          // Public keys of agents who denounced
  vouchDepth: number;            // How many hops from a root voucher
  
  // Metadata
  createdAt: number;
  lastSeenAt: number;
  online: boolean;
  
  // Platform info
  platform?: string;             // 'clawdbot' | 'langchain' | 'autogpt' | etc
  version?: string;
}

// Trust policy (like Tailscale's ACL)
export interface TrustPolicy {
  version: string;
  
  // Groups of agents
  groups: {
    [groupName: string]: string[];  // Group name → list of agent IDs or patterns
  };
  
  // Trust grants (who can access what)
  grants: TrustGrant[];
  
  // Denounced agents (blocked everywhere)
  denounced: DenouncedAgent[];
  
  // Auto-vouch rules
  autoVouch?: AutoVouchRule[];
}

// Trust grant (like Tailscale's Grant)
export interface TrustGrant {
  // Source: who is requesting
  src: string[];                 // Agent IDs, groups, tiers, or patterns
  
  // Destination: what they're accessing
  dst: string[];                 // API endpoints, services, or patterns
  
  // Action
  action: 'ALLOW' | 'DENY';
  
  // Modifiers
  pricingMultiplier?: number;    // 0.2 = 80% discount
  rateLimit?: number;            // Requests per minute
  requireScan?: boolean;         // Must have recent scan
  maxScanAge?: number;           // Max age of scan in seconds
  
  // Metadata
  comment?: string;
}

// Denounced agent entry
export interface DenouncedAgent {
  id?: string;
  publicKey?: string;
  pattern?: string;              // Regex pattern to match
  reason: string;
  denouncedBy: string;           // Who denounced
  denouncedAt: number;
  severity: 'PERMANENT' | 'TEMPORARY';
  expiresAt?: number;
}

// Auto-vouch rule
export interface AutoVouchRule {
  condition: {
    minTrustScore?: number;
    minScanScore?: number;
    platform?: string[];
    hasGitHub?: boolean;
    hasTwitter?: boolean;
  };
  grantTier: TrustTier;
  comment?: string;
}

// Coordination server response (like Tailscale's MapResponse)
export interface TrustMapResponse {
  // Current policy
  policy: TrustPolicy;
  
  // Known agents in the network
  agents: AgentIdentity[];
  
  // Your own identity (as seen by server)
  self: AgentIdentity;
  
  // DERP relay map
  derpMap?: DERPMap;
  
  // Sync metadata
  version: number;               // Incrementing version for cache invalidation
  generatedAt: number;
  nextSyncIn: number;            // Suggested seconds until next sync
}

// DERP relay map (like Tailscale's DERPMap)
export interface DERPMap {
  regions: {
    [regionId: number]: DERPRegion;
  };
}

export interface DERPRegion {
  regionId: number;
  regionCode: string;            // 'us-east', 'eu-west', etc
  regionName: string;
  nodes: DERPNode[];
}

export interface DERPNode {
  name: string;
  regionId: number;
  hostName: string;
  ipv4?: string;
  ipv6?: string;
  port: number;
}

// Scan result (for trust verification)
export interface ScanResult {
  agentId: string;
  scanHash: string;              // SHA-256 of scan output
  score: number;                 // 0-100
  tier: TrustTier;
  findings: ScanFinding[];
  scannedAt: number;
  codeHash: string;              // Hash of scanned code
  rulesVersion: string;          // Version of detection rules used
}

export interface ScanFinding {
  ruleId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  message: string;
  line?: number;
  snippet?: string;
}

// Vouch/Denounce request
export interface VouchRequest {
  targetId?: string;
  targetPublicKey?: string;
  action: 'VOUCH' | 'DENOUNCE' | 'UNVOUCH';
  reason?: string;
  evidence?: string;             // URL or hash of evidence
}

// Peer verification challenge/response
export interface VerificationChallenge {
  challengeId: string;
  nonce: string;                 // Random bytes (base64)
  timestamp: number;
  requesterPublicKey: string;
}

export interface VerificationResponse {
  challengeId: string;
  signature: string;             // Signature of nonce with private key
  scanHash?: string;             // Optional: include latest scan
  trustScore?: number;
}
