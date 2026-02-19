/**
 * ═══════════════════════════════════════════════════════════════
 *  🚨 MOLT COPS × SIWA — Authentication & Trust Resolution
 * ═══════════════════════════════════════════════════════════════
 *
 *  Verifies SIWA authentication messages and resolves the
 *  agent's trust tier from ERC-8004 data.
 *
 *  SIWA gives us cryptographic proof that:
 *    - The agent controls a specific wallet address
 *    - That wallet owns a specific ERC-8004 agent ID
 *    - The message was signed recently (nonce + timestamp)
 *
 *  MoltCops adds:
 *    - Trust score from reputation + scan + validation data
 *    - Tier classification (TRUSTED/CAUTION/WARNING/DANGER)
 *    - Badge holder detection (Founding Operative discount)
 *    - Session token issuance with trust metadata
 *
 *  The key insight: SIWA handles authentication (proving identity).
 *  MoltCops handles authorization (deciding trust level).
 *  Together they're the complete agent access control stack.
 */

import { ethers } from "ethers";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * A SIWA message follows the EIP-4361 format adapted for agents.
 * The structured message binds the domain, agent ID, chain, and
 * timestamp to the signature.
 */
export interface SIWAMessage {
  domain: string;
  address: string;
  agentId: string;
  agentRegistry: string; // ERC-8004 Identity Registry address
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  statement?: string;
  uri?: string;
  version?: string;
  resources?: string[];
}

export interface SIWAVerificationResult {
  valid: boolean;
  address: string;
  agentId: string;
  chainId: number;
  error?: string;
}

export interface TrustProfile {
  agentId: string;
  walletAddress: string;
  tier: TrustTier;
  trustScore: number;
  isOperative: boolean;
  stakingTier: string | null;
  reputationCount: number;
  scanScore: number;
  validationScore: number;
  siwaVerified: boolean;
}

export enum TrustTier {
  BLOCKED = "BLOCKED",
  DANGER = "DANGER",
  WARNING = "WARNING",
  CAUTION = "CAUTION",
  TRUSTED = "TRUSTED",
  OPERATIVE = "OPERATIVE",
}

export interface SessionToken {
  token: string;
  agentId: string;
  walletAddress: string;
  trustTier: TrustTier;
  trustScore: number;
  issuedAt: number;
  expiresAt: number;
}

// ═══════════════════════════════════════════════════════════════
// SIWA MESSAGE PARSING
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a SIWA message string into structured fields.
 *
 * SIWA messages follow this format (adapted from EIP-4361):
 *
 *   {domain} wants you to sign in with your agent account:
 *   {address}
 *
 *   {statement}
 *
 *   URI: {uri}
 *   Version: {version}
 *   Chain ID: {chainId}
 *   Nonce: {nonce}
 *   Issued At: {issuedAt}
 *   Agent ID: {agentId}
 *   Agent Registry: {agentRegistry}
 */
export function parseSIWAMessage(message: string): SIWAMessage | null {
  try {
    const lines = message.split("\n").map((l) => l.trim());

    // Line 1: "{domain} wants you to sign in with your agent account:"
    const domainMatch = lines[0]?.match(
      /^(.+) wants you to sign in with your agent account:$/
    );
    if (!domainMatch) return null;
    const domain = domainMatch[1];

    // Line 2: address
    const address = lines[1];
    if (!ethers.isAddress(address)) return null;

    // Parse key-value fields
    const fields: Record<string, string> = {};
    for (const line of lines) {
      const kvMatch = line.match(/^(\w[\w\s]+):\s+(.+)$/);
      if (kvMatch) {
        fields[kvMatch[1].toLowerCase().replace(/\s+/g, "_")] = kvMatch[2];
      }
    }

    return {
      domain,
      address,
      agentId: fields["agent_id"] || "",
      agentRegistry: fields["agent_registry"] || "",
      chainId: parseInt(fields["chain_id"] || "8453"),
      nonce: fields["nonce"] || "",
      issuedAt: fields["issued_at"] || "",
      expirationTime: fields["expiration_time"],
      statement: lines.slice(3, lines.indexOf("")).join(" ").trim() || undefined,
      uri: fields["uri"],
      version: fields["version"],
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SIWA VERIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Verify a SIWA signature.
 *
 * This is a LOCAL cryptographic operation — no RPC call needed.
 * The signature proves the agent controls the wallet. The on-chain
 * ownership check (wallet → agent NFT) happens once during
 * trust resolution, not on every request.
 */
export function verifySIWA(
  message: string,
  signature: string,
  options: {
    domain: string;
    nonce: string;
    maxAgeSeconds?: number;
  }
): SIWAVerificationResult {
  // Parse the message
  const parsed = parseSIWAMessage(message);
  if (!parsed) {
    return {
      valid: false,
      address: "",
      agentId: "",
      chainId: 0,
      error: "Invalid SIWA message format",
    };
  }

  // Verify domain matches
  if (parsed.domain !== options.domain) {
    return {
      valid: false,
      address: parsed.address,
      agentId: parsed.agentId,
      chainId: parsed.chainId,
      error: `Domain mismatch: expected ${options.domain}, got ${parsed.domain}`,
    };
  }

  // Verify nonce matches
  if (parsed.nonce !== options.nonce) {
    return {
      valid: false,
      address: parsed.address,
      agentId: parsed.agentId,
      chainId: parsed.chainId,
      error: "Nonce mismatch — possible replay attack",
    };
  }

  // Verify timestamp freshness
  const maxAge = options.maxAgeSeconds || 300; // 5 minutes default
  const issuedAt = new Date(parsed.issuedAt).getTime();
  const now = Date.now();
  if (now - issuedAt > maxAge * 1000) {
    return {
      valid: false,
      address: parsed.address,
      agentId: parsed.agentId,
      chainId: parsed.chainId,
      error: `Message expired: issued ${Math.round((now - issuedAt) / 1000)}s ago, max ${maxAge}s`,
    };
  }

  // Verify expiration if present
  if (parsed.expirationTime) {
    const expires = new Date(parsed.expirationTime).getTime();
    if (now > expires) {
      return {
        valid: false,
        address: parsed.address,
        agentId: parsed.agentId,
        chainId: parsed.chainId,
        error: "Message has expired",
      };
    }
  }

  // Verify signature — this is the cryptographic core
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== parsed.address.toLowerCase()) {
      return {
        valid: false,
        address: parsed.address,
        agentId: parsed.agentId,
        chainId: parsed.chainId,
        error: "Signature does not match claimed address",
      };
    }
  } catch (err) {
    return {
      valid: false,
      address: parsed.address,
      agentId: parsed.agentId,
      chainId: parsed.chainId,
      error: `Signature verification failed: ${(err as Error).message}`,
    };
  }

  // All checks passed
  return {
    valid: true,
    address: parsed.address,
    agentId: parsed.agentId,
    chainId: parsed.chainId,
  };
}

// ═══════════════════════════════════════════════════════════════
// TRUST RESOLUTION (MoltCops layer on top of SIWA identity)
// ═══════════════════════════════════════════════════════════════

interface OnChainConfig {
  rpcUrl: string;
  identityRegistry: string;
  reputationRegistry: string;
  badgeContract: string;
  stakingContract: string;
}

/**
 * Given a SIWA-verified identity, resolve the full MoltCops
 * trust profile from on-chain data.
 *
 * This is the bridge between SIWA (authentication) and MoltCops
 * (authorization). SIWA proves you are who you say. This function
 * decides how much we trust you.
 *
 * Called once per session, not per request.
 */
export async function resolveTrustProfile(
  siwaResult: SIWAVerificationResult,
  config: OnChainConfig
): Promise<TrustProfile> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  const profile: TrustProfile = {
    agentId: siwaResult.agentId,
    walletAddress: siwaResult.address,
    tier: TrustTier.CAUTION,
    trustScore: 50,
    isOperative: false,
    stakingTier: null,
    reputationCount: 0,
    scanScore: 50,
    validationScore: 30,
    siwaVerified: true,
  };

  // ── Verify on-chain ownership ──
  try {
    const identity = new ethers.Contract(
      config.identityRegistry,
      ["function ownerOf(uint256) view returns (address)"],
      provider
    );

    const owner = await identity.ownerOf(siwaResult.agentId);
    if (owner.toLowerCase() !== siwaResult.address.toLowerCase()) {
      // SIWA signature is valid but wallet doesn't own this agent ID
      // This means the agent is claiming an identity it doesn't have
      profile.tier = TrustTier.DANGER;
      profile.trustScore = 0;
      return profile;
    }
  } catch {
    // Agent ID not registered — not necessarily malicious
    profile.tier = TrustTier.WARNING;
    profile.trustScore = 20;
    return profile;
  }

  // ── Reputation data ──
  try {
    const reputation = new ethers.Contract(
      config.reputationRegistry,
      [
        "function getSummary(uint256,address[],string,string) view returns (uint64,int128,uint8)",
      ],
      provider
    );

    const [count, score, decimals] = await reputation.getSummary(
      siwaResult.agentId,
      [],
      "",
      ""
    );

    profile.reputationCount = Number(count);
    if (profile.reputationCount > 0) {
      const divisor = 10 ** Number(decimals);
      profile.scanScore = Math.max(
        0,
        Math.min(100, Math.round(Number(score) / divisor))
      );
    }
  } catch {
    // No reputation data — use defaults
  }

  // ── Badge check ──
  try {
    const badge = new ethers.Contract(
      config.badgeContract,
      ["function isOperative(address) view returns (bool)"],
      provider
    );
    profile.isOperative = await badge.isOperative(siwaResult.address);
  } catch {
    // Badge lookup failed
  }

  // ── Staking data ──
  try {
    const staking = new ethers.Contract(
      config.stakingContract,
      [
        "function stakes(address) view returns (uint256,uint8,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)",
      ],
      provider
    );
    const stakeData = await staking.stakes(siwaResult.address);
    const tierNum = Number(stakeData[1]);
    const tierNames = ["None", "Observer", "Operative", "Senior", "Commander"];
    profile.stakingTier = tierNames[tierNum] || "None";
    if (tierNum > 0) {
      profile.validationScore = 50 + tierNum * 10; // Higher tier = higher validation
    }
  } catch {
    // No staking data
  }

  // ── Combined trust score ──
  const combined = Math.round(
    profile.scanScore * 0.5 +
      profile.scanScore * 0.35 + // Using scanScore as reputation proxy
      profile.validationScore * 0.15
  );
  profile.trustScore = combined;

  // ── Tier assignment ──
  if (profile.isOperative) {
    profile.tier = TrustTier.OPERATIVE;
  } else if (combined <= 20) {
    profile.tier = TrustTier.DANGER;
  } else if (combined <= 40) {
    profile.tier = TrustTier.WARNING;
  } else if (combined <= 60) {
    profile.tier = TrustTier.CAUTION;
  } else {
    profile.tier = TrustTier.TRUSTED;
  }

  return profile;
}

// ═══════════════════════════════════════════════════════════════
// SESSION TOKEN ISSUANCE
// ═══════════════════════════════════════════════════════════════

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_TTL = 3600; // 1 hour

/**
 * Issue a session token after SIWA verification + trust resolution.
 * The token contains the trust tier so downstream services can
 * make authorization decisions without re-querying the chain.
 */
export function issueSessionToken(profile: TrustProfile): SessionToken {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: profile.agentId,
    addr: profile.walletAddress,
    tier: profile.tier,
    score: profile.trustScore,
    op: profile.isOperative,
    iat: now,
    exp: now + SESSION_TTL,
  };

  // Simple HMAC-based token (production: use proper JWT library)
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payloadStr}`)
    .digest("base64url");

  return {
    token: `${header}.${payloadStr}.${signature}`,
    agentId: profile.agentId,
    walletAddress: profile.walletAddress,
    trustTier: profile.tier,
    trustScore: profile.trustScore,
    issuedAt: now * 1000,
    expiresAt: (now + SESSION_TTL) * 1000,
  };
}

/**
 * Verify a session token and extract the trust profile.
 * Local operation — no chain queries.
 */
export function verifySessionToken(
  token: string
): { valid: true; payload: Record<string, unknown> } | { valid: false; error: string } {
  try {
    const [header, payloadStr, sig] = token.split(".");
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payloadStr}`)
      .digest("base64url");

    if (sig !== expectedSig) {
      return { valid: false, error: "Invalid token signature" };
    }

    const payload = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString()
    );

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: "Token expired" };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPRESS ROUTES (plug into existing backend)
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";

const nonceStore: Map<string, { nonce: string; expiresAt: number }> = new Map();

export function createSIWARoutes(config: OnChainConfig): Router {
  const router = Router();

  // ── GET /auth/nonce — Issue a challenge ──
  router.get("/auth/nonce", (_req: Request, res: Response) => {
    const nonce = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + 300000; // 5 minutes
    nonceStore.set(nonce, { nonce, expiresAt });

    // Clean expired nonces
    for (const [key, val] of nonceStore.entries()) {
      if (val.expiresAt < Date.now()) nonceStore.delete(key);
    }

    res.json({ nonce, expiresAt: new Date(expiresAt).toISOString() });
  });

  // ── POST /auth/siwa — Verify and issue session ──
  router.post("/auth/siwa", async (req: Request, res: Response) => {
    const { message, signature } = req.body;

    if (!message || !signature) {
      return res.status(400).json({ error: "Missing message or signature" });
    }

    // Parse to get the nonce for verification
    const parsed = parseSIWAMessage(message);
    if (!parsed) {
      return res.status(400).json({ error: "Invalid SIWA message" });
    }

    // Verify nonce exists and hasn't expired
    const storedNonce = nonceStore.get(parsed.nonce);
    if (!storedNonce || storedNonce.expiresAt < Date.now()) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }
    nonceStore.delete(parsed.nonce); // One-time use

    // Verify SIWA signature (local, fast)
    const domain = req.hostname || "api.moltcops.com";
    const verification = verifySIWA(message, signature, {
      domain,
      nonce: parsed.nonce,
    });

    if (!verification.valid) {
      return res.status(401).json({
        error: "SIWA verification failed",
        detail: verification.error,
      });
    }

    // Resolve trust profile (on-chain, slower — but only once per session)
    const profile = await resolveTrustProfile(verification, config);

    // Block DANGER-tier agents
    if (profile.tier === TrustTier.DANGER || profile.tier === TrustTier.BLOCKED) {
      return res.status(403).json({
        error: "Access denied",
        tier: profile.tier,
        trustScore: profile.trustScore,
        reason:
          profile.trustScore === 0
            ? "Identity spoofing detected — wallet does not own claimed agent ID"
            : "Trust score below minimum threshold",
      });
    }

    // Issue session token
    const session = issueSessionToken(profile);

    res.json({
      token: session.token,
      agentId: session.agentId,
      trustTier: session.trustTier,
      trustScore: session.trustScore,
      isOperative: profile.isOperative,
      stakingTier: profile.stakingTier,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  });

  // ── GET /auth/me — Check current session ──
  router.get("/auth/me", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No session token" });
    }

    const result = verifySessionToken(authHeader.replace("Bearer ", ""));
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    res.json({
      authenticated: true,
      ...result.payload,
    });
  });

  return router;
}
