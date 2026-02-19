/**
 * MoltCops Defense Matrix
 * Trust infrastructure for AI agents
 * 
 * Architecture inspired by Tailscale (BSD-3-Clause)
 * Implementation by MoltCops (MIT)
 */

// Core types
export * from './types';

// Agent identity management
export {
  generateKeyPair,
  generateAgentId,
  createAgentIdentity,
  signMessage,
  verifySignature,
  calculateTier,
  updateIdentityWithScan,
  calculateEffectiveTrustScore,
  serializeIdentity,
  deserializeIdentity,
  createFingerprint,
} from './agent-identity';

// Policy engine
export {
  PolicyEngine,
  PolicyDecision,
  DEFAULT_POLICY,
} from './policy-engine';

// Coordination server
export {
  CoordinationServer,
  getCoordinationServer,
  apiRoutes,
} from './coordination-server';

// Trust sync client
export {
  TrustSyncClient,
  TrustSyncConfig,
  createTrustSyncClient,
} from './trust-sync';

// Peer verification
export {
  createChallenge,
  respondToChallenge,
  verifyResponse,
  PeerVerificationSession,
  PeerVerificationProtocol,
  VerifiedPeer,
} from './peer-verification';

/**
 * Quick start example:
 * 
 * ```typescript
 * import { 
 *   createAgentIdentity, 
 *   createTrustSyncClient,
 *   PolicyEngine 
 * } from '@moltcops/defense-matrix';
 * 
 * // 1. Create agent identity
 * const { identity, privateKey } = await createAgentIdentity('MyAgent', 'clawdbot');
 * 
 * // 2. Start trust sync
 * const client = await createTrustSyncClient({
 *   coordinationServerUrl: 'https://matrix.moltcops.com',
 *   agentId: identity.id,
 *   privateKey,
 *   publicKey: identity.publicKey,
 * });
 * 
 * // 3. Check access
 * const { allowed, pricingMultiplier } = client.canAccess('api:premium');
 * 
 * // 4. Listen for updates
 * client.on('tierUpdated', (newTier) => {
 *   console.log('New tier:', newTier);
 * });
 * ```
 */
