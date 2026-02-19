/**
 * MoltCops Defense Matrix - Peer Verification
 * Direct agent-to-agent trust verification
 * 
 * Inspired by Tailscale's peer-to-peer connections
 * BSD-3-Clause License (Tailscale-derived)
 */

import {
  AgentIdentity,
  VerificationChallenge,
  VerificationResponse,
  TrustTier,
} from './types';
import { signMessage, verifySignature, calculateTier } from './agent-identity';

/**
 * Generate a verification challenge
 */
export function createChallenge(requesterPublicKey: string): VerificationChallenge {
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  
  return {
    challengeId: crypto.randomUUID(),
    nonce: bufferToBase64(nonceBytes.buffer),
    timestamp: Date.now(),
    requesterPublicKey,
  };
}

/**
 * Respond to a verification challenge
 */
export async function respondToChallenge(
  challenge: VerificationChallenge,
  privateKey: string,
  scanHash?: string,
  trustScore?: number
): Promise<VerificationResponse> {
  // Sign the nonce to prove ownership of private key
  const signature = await signMessage(privateKey, challenge.nonce);
  
  return {
    challengeId: challenge.challengeId,
    signature,
    scanHash,
    trustScore,
  };
}

/**
 * Verify a challenge response
 */
export async function verifyResponse(
  challenge: VerificationChallenge,
  response: VerificationResponse,
  claimedPublicKey: string
): Promise<{
  valid: boolean;
  error?: string;
}> {
  // Check challenge ID matches
  if (challenge.challengeId !== response.challengeId) {
    return { valid: false, error: 'Challenge ID mismatch' };
  }
  
  // Check challenge is not expired (5 minutes)
  if (Date.now() - challenge.timestamp > 5 * 60 * 1000) {
    return { valid: false, error: 'Challenge expired' };
  }
  
  // Verify signature
  const valid = await verifySignature(
    claimedPublicKey,
    challenge.nonce,
    response.signature
  );
  
  if (!valid) {
    return { valid: false, error: 'Invalid signature' };
  }
  
  return { valid: true };
}

/**
 * Peer verification session
 */
export class PeerVerificationSession {
  private myPublicKey: string;
  private myPrivateKey: string;
  private pendingChallenges: Map<string, VerificationChallenge>;
  private verifiedPeers: Map<string, VerifiedPeer>;

  constructor(myPublicKey: string, myPrivateKey: string) {
    this.myPublicKey = myPublicKey;
    this.myPrivateKey = myPrivateKey;
    this.pendingChallenges = new Map();
    this.verifiedPeers = new Map();
  }

  /**
   * Start verification of a peer
   */
  startVerification(peerPublicKey: string): VerificationChallenge {
    const challenge = createChallenge(this.myPublicKey);
    this.pendingChallenges.set(peerPublicKey, challenge);
    return challenge;
  }

  /**
   * Handle incoming challenge
   */
  async handleChallenge(
    challenge: VerificationChallenge,
    myScanHash?: string,
    myTrustScore?: number
  ): Promise<VerificationResponse> {
    return respondToChallenge(
      challenge,
      this.myPrivateKey,
      myScanHash,
      myTrustScore
    );
  }

  /**
   * Verify a peer's response
   */
  async verifyPeer(
    peerPublicKey: string,
    response: VerificationResponse,
    peerIdentity?: Partial<AgentIdentity>
  ): Promise<{
    verified: boolean;
    peer?: VerifiedPeer;
    error?: string;
  }> {
    const challenge = this.pendingChallenges.get(peerPublicKey);
    if (!challenge) {
      return { verified: false, error: 'No pending challenge for this peer' };
    }

    const result = await verifyResponse(challenge, response, peerPublicKey);
    if (!result.valid) {
      return { verified: false, error: result.error };
    }

    // Peer is verified - add to verified list
    const peer: VerifiedPeer = {
      publicKey: peerPublicKey,
      verifiedAt: Date.now(),
      scanHash: response.scanHash,
      trustScore: response.trustScore,
      tier: response.trustScore !== undefined 
        ? calculateTier(response.trustScore) 
        : 'UNKNOWN',
      ...peerIdentity,
    };

    this.verifiedPeers.set(peerPublicKey, peer);
    this.pendingChallenges.delete(peerPublicKey);

    return { verified: true, peer };
  }

  /**
   * Check if a peer is verified
   */
  isPeerVerified(peerPublicKey: string): boolean {
    const peer = this.verifiedPeers.get(peerPublicKey);
    if (!peer) return false;
    
    // Verification expires after 1 hour
    if (Date.now() - peer.verifiedAt > 60 * 60 * 1000) {
      this.verifiedPeers.delete(peerPublicKey);
      return false;
    }
    
    return true;
  }

  /**
   * Get verified peer info
   */
  getVerifiedPeer(peerPublicKey: string): VerifiedPeer | undefined {
    if (!this.isPeerVerified(peerPublicKey)) return undefined;
    return this.verifiedPeers.get(peerPublicKey);
  }

  /**
   * Get all verified peers
   */
  getAllVerifiedPeers(): VerifiedPeer[] {
    // Clean up expired first
    for (const [key, peer] of this.verifiedPeers) {
      if (Date.now() - peer.verifiedAt > 60 * 60 * 1000) {
        this.verifiedPeers.delete(key);
      }
    }
    return Array.from(this.verifiedPeers.values());
  }

  /**
   * Revoke peer verification
   */
  revokePeer(peerPublicKey: string): void {
    this.verifiedPeers.delete(peerPublicKey);
    this.pendingChallenges.delete(peerPublicKey);
  }
}

/**
 * Verified peer info
 */
export interface VerifiedPeer {
  publicKey: string;
  verifiedAt: number;
  scanHash?: string;
  trustScore?: number;
  tier: TrustTier;
  id?: string;
  name?: string;
}

/**
 * WebSocket-based peer verification protocol
 */
export class PeerVerificationProtocol {
  private session: PeerVerificationSession;
  private connections: Map<string, WebSocket>;
  private onPeerVerified?: (peer: VerifiedPeer) => void;

  constructor(
    myPublicKey: string,
    myPrivateKey: string,
    onPeerVerified?: (peer: VerifiedPeer) => void
  ) {
    this.session = new PeerVerificationSession(myPublicKey, myPrivateKey);
    this.connections = new Map();
    this.onPeerVerified = onPeerVerified;
  }

  /**
   * Connect to a peer for verification
   */
  async connectAndVerify(
    peerUrl: string,
    peerPublicKey: string,
    myScanHash?: string,
    myTrustScore?: number
  ): Promise<VerifiedPeer | null> {
    return new Promise((resolve) => {
      const ws = new WebSocket(peerUrl);
      let timeoutId: ReturnType<typeof setTimeout>;

      ws.onopen = () => {
        // Send challenge
        const challenge = this.session.startVerification(peerPublicKey);
        ws.send(JSON.stringify({
          type: 'challenge',
          challenge,
        }));

        // Set timeout
        timeoutId = setTimeout(() => {
          ws.close();
          resolve(null);
        }, 30000);
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'challenge') {
          // Respond to their challenge
          const response = await this.session.handleChallenge(
            message.challenge,
            myScanHash,
            myTrustScore
          );
          ws.send(JSON.stringify({
            type: 'response',
            response,
          }));
        }

        if (message.type === 'response') {
          // Verify their response
          const result = await this.session.verifyPeer(
            peerPublicKey,
            message.response
          );

          clearTimeout(timeoutId);

          if (result.verified && result.peer) {
            this.connections.set(peerPublicKey, ws);
            this.onPeerVerified?.(result.peer);
            resolve(result.peer);
          } else {
            ws.close();
            resolve(null);
          }
        }
      };

      ws.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };
    });
  }

  /**
   * Handle incoming verification connection
   */
  handleIncomingConnection(
    ws: WebSocket,
    myScanHash?: string,
    myTrustScore?: number
  ): void {
    let peerPublicKey: string | null = null;

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'challenge') {
        peerPublicKey = message.challenge.requesterPublicKey;
        
        // Respond to their challenge
        const response = await this.session.handleChallenge(
          message.challenge,
          myScanHash,
          myTrustScore
        );
        ws.send(JSON.stringify({
          type: 'response',
          response,
        }));

        // Send our own challenge
        const myChallenge = this.session.startVerification(peerPublicKey);
        ws.send(JSON.stringify({
          type: 'challenge',
          challenge: myChallenge,
        }));
      }

      if (message.type === 'response' && peerPublicKey) {
        const result = await this.session.verifyPeer(
          peerPublicKey,
          message.response
        );

        if (result.verified && result.peer) {
          this.connections.set(peerPublicKey, ws);
          this.onPeerVerified?.(result.peer);
        } else {
          ws.close();
        }
      }
    };
  }

  /**
   * Get session
   */
  getSession(): PeerVerificationSession {
    return this.session;
  }
}

// Utility functions
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}
