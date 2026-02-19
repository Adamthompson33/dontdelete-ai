/**
 * MoltCops Defense Matrix - Agent Identity Management
 * Handles keypair generation, storage, and identity operations
 * 
 * Inspired by Tailscale's key management in wgengine/
 * BSD-3-Clause License (Tailscale-derived)
 */

import { AgentIdentity, TrustTier, ScanResult } from './types';

// Use Web Crypto API for cross-platform compatibility
const crypto = globalThis.crypto || require('crypto').webcrypto;

/**
 * Generate a new Ed25519 keypair for agent identity
 */
export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'Ed25519',
    },
    true,  // extractable
    ['sign', 'verify']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: bufferToBase64(publicKeyBuffer),
    privateKey: bufferToBase64(privateKeyBuffer),
  };
}

/**
 * Generate a unique agent ID
 */
export function generateAgentId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'MC-' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .slice(0, 12);
}

/**
 * Create a new agent identity
 */
export async function createAgentIdentity(
  name: string,
  platform?: string
): Promise<{
  identity: AgentIdentity;
  privateKey: string;
}> {
  const { publicKey, privateKey } = await generateKeyPair();
  const id = generateAgentId();
  const now = Date.now();

  const identity: AgentIdentity = {
    id,
    name,
    publicKey,
    trustScore: 0,           // Starts at 0 until scanned
    tier: 'UNKNOWN',
    vouchers: [],
    denouncers: [],
    vouchDepth: -1,          // -1 = no vouch chain
    createdAt: now,
    lastSeenAt: now,
    online: true,
    platform,
  };

  return { identity, privateKey };
}

/**
 * Sign a message with the agent's private key
 */
export async function signMessage(
  privateKeyBase64: string,
  message: string
): Promise<string> {
  const privateKeyBuffer = base64ToBuffer(privateKeyBase64);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const messageBuffer = new TextEncoder().encode(message);
  const signature = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    messageBuffer
  );

  return bufferToBase64(signature);
}

/**
 * Verify a signature with the agent's public key
 */
export async function verifySignature(
  publicKeyBase64: string,
  message: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    const publicKeyBuffer = base64ToBuffer(publicKeyBase64);
    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBuffer,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    const messageBuffer = new TextEncoder().encode(message);
    const signatureBuffer = base64ToBuffer(signatureBase64);

    return await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      signatureBuffer,
      messageBuffer
    );
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Calculate trust tier from score
 */
export function calculateTier(score: number): TrustTier {
  if (score >= 80) return 'TRUSTED';
  if (score >= 60) return 'CAUTION';
  if (score >= 40) return 'WARNING';
  if (score >= 0) return 'DANGER';
  return 'UNKNOWN';
}

/**
 * Update identity with scan result
 */
export function updateIdentityWithScan(
  identity: AgentIdentity,
  scan: ScanResult
): AgentIdentity {
  return {
    ...identity,
    trustScore: scan.score,
    tier: scan.tier,
    scanHash: scan.scanHash,
    lastScanAt: scan.scannedAt,
    lastSeenAt: Date.now(),
  };
}

/**
 * Calculate effective trust score considering vouch chain
 */
export function calculateEffectiveTrustScore(
  identity: AgentIdentity,
  voucherScores: number[]
): number {
  const baseScanScore = identity.trustScore;
  
  if (voucherScores.length === 0) {
    return baseScanScore;
  }

  // Average voucher score with decay based on depth
  const avgVoucherScore = voucherScores.reduce((a, b) => a + b, 0) / voucherScores.length;
  const vouchBonus = avgVoucherScore * 0.1 * Math.pow(0.8, identity.vouchDepth);
  
  // Denouncers reduce score
  const denouncePenalty = identity.denouncers.length * 10;

  return Math.max(0, Math.min(100, baseScanScore + vouchBonus - denouncePenalty));
}

/**
 * Serialize identity for storage
 */
export function serializeIdentity(identity: AgentIdentity): string {
  return JSON.stringify(identity);
}

/**
 * Deserialize identity from storage
 */
export function deserializeIdentity(data: string): AgentIdentity {
  return JSON.parse(data);
}

/**
 * Create identity fingerprint (short identifier)
 */
export async function createFingerprint(publicKey: string): Promise<string> {
  const buffer = base64ToBuffer(publicKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
}

// Utility functions
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// For Node.js environments
if (typeof btoa === 'undefined') {
  (globalThis as any).btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
  (globalThis as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}
