/**
 * ═══════════════════════════════════════════════════════════════
 *  🚨 MOLT COPS x402 GATEWAY — Lambda@Edge Origin Request
 * ═══════════════════════════════════════════════════════════════
 *
 *  The "Programmable Toll Booth" — sits at the CloudFront edge
 *  and enforces identity, security, and payment before any
 *  request reaches your origin server.
 *
 *  Pipeline:
 *    1. WAF Bot Detection  → Is this a human or an agent?
 *    2. ERC-8004 Identity  → Who is this agent? What's their trust tier?
 *    3. MoltShield Scan    → Does this request contain injection attacks?
 *    4. x402 Pricing       → What should this agent pay? (trust-tiered)
 *    5. Payment Verify     → Is the payment signature valid?
 *    6. Forward            → Clean, paid request goes to origin
 *
 *  Deploy: Lambda@Edge on CloudFront (origin-request event)
 *  Pair with: origin-response handler for settlement
 *
 *  @module x402-gateway/origin-request
 */

import { CloudFrontRequestEvent, CloudFrontRequestResult } from "aws-lambda";
import { ethers } from "ethers";

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

interface GatewayConfig {
  // x402 facilitator URL (Coinbase or self-hosted)
  facilitatorUrl: string;

  // Treasury wallet — where payments land
  treasuryAddress: string;

  // ERC-8004 registry addresses (Base network)
  identityRegistry: string;
  reputationRegistry: string;

  // Founding Operative badge contract
  badgeContract: string;

  // RPC endpoint for on-chain reads
  rpcUrl: string;

  // Staking contract for trust-tier lookups
  stakingContract: string;

  // Payment network (USDC on Base)
  paymentAsset: string; // USDC contract address
  paymentNetwork: string; // "base"

  // Routes requiring payment
  routes: RouteConfig[];

  // Allow verified search engines through free
  allowVerifiedBots: boolean;

  // Allow humans through free (WAF Bot Control integration)
  humansFree: boolean;
}

interface RouteConfig {
  // URL pattern (supports * wildcard)
  pattern: string;

  // Method filter (GET, POST, etc.) — "*" for all
  method: string;

  // Base price in USD (before trust discount)
  basePriceUsd: string;

  // Description shown in 402 response
  description: string;

  // Whether this route requires ERC-8004 identity
  requireIdentity: boolean;

  // Whether to run MoltShield scan on request body
  scanBody: boolean;
}

// Default config — override via environment or SSM Parameter Store
const CONFIG: GatewayConfig = {
  facilitatorUrl:
    process.env.FACILITATOR_URL || "https://x402.org/facilitator",
  treasuryAddress:
    process.env.TREASURY_ADDRESS ||
    "0x0000000000000000000000000000000000000000",
  identityRegistry:
    process.env.IDENTITY_REGISTRY ||
    "0x0000000000000000000000000000000000000000",
  reputationRegistry:
    process.env.REPUTATION_REGISTRY ||
    "0x0000000000000000000000000000000000000000",
  badgeContract:
    process.env.BADGE_CONTRACT ||
    "0x0000000000000000000000000000000000000000",
  rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
  stakingContract:
    process.env.STAKING_CONTRACT ||
    "0x0000000000000000000000000000000000000000",
  paymentAsset:
    process.env.PAYMENT_ASSET || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  paymentNetwork: process.env.PAYMENT_NETWORK || "base",
  routes: [
    {
      pattern: "/api/agents/*",
      method: "*",
      basePriceUsd: "0.005",
      description: "Agent registry query",
      requireIdentity: false,
      scanBody: false,
    },
    {
      pattern: "/api/scan",
      method: "POST",
      basePriceUsd: "0.05",
      description: "MoltShield security scan",
      requireIdentity: true,
      scanBody: true,
    },
    {
      pattern: "/api/threats/*",
      method: "GET",
      basePriceUsd: "0.001",
      description: "Threat intelligence feed",
      requireIdentity: false,
      scanBody: false,
    },
    {
      pattern: "/api/data/*",
      method: "GET",
      basePriceUsd: "0.005",
      description: "Data feed access",
      requireIdentity: false,
      scanBody: false,
    },
  ],
  allowVerifiedBots: true,
  humansFree: true,
};

// ═══════════════════════════════════════════════════════════════
// TRUST TIERS → x402 PRICING
// ═══════════════════════════════════════════════════════════════

/**
 * Trust tiers map to price multipliers.
 * Higher trust = lower cost. Reputation IS your discount.
 *
 * DANGER:   Blocked entirely (no price, just rejection)
 * WARNING:  2x base price (pay more, prove you're safe)
 * CAUTION:  1x base price (standard rate)
 * TRUSTED:  0.2x base price (80% discount)
 * OPERATIVE: 0.1x base price (90% discount — badge holders)
 * HUMAN:    0x (free — WAF-verified human traffic)
 */

enum TrustTier {
  BLOCKED = "BLOCKED",
  DANGER = "DANGER",
  WARNING = "WARNING",
  CAUTION = "CAUTION",
  TRUSTED = "TRUSTED",
  OPERATIVE = "OPERATIVE",
  HUMAN = "HUMAN",
  VERIFIED_BOT = "VERIFIED_BOT",
}

const TIER_PRICING: Record<TrustTier, number> = {
  [TrustTier.BLOCKED]: -1, // Reject
  [TrustTier.DANGER]: -1, // Reject
  [TrustTier.WARNING]: 2.0, // 2x base price
  [TrustTier.CAUTION]: 1.0, // Standard
  [TrustTier.TRUSTED]: 0.2, // 80% discount
  [TrustTier.OPERATIVE]: 0.1, // 90% discount
  [TrustTier.HUMAN]: 0, // Free
  [TrustTier.VERIFIED_BOT]: 0, // Free (Googlebot, etc.)
};

const TIER_LABELS: Record<TrustTier, string> = {
  [TrustTier.BLOCKED]: "🚫 Blocked — blacklisted agent",
  [TrustTier.DANGER]: "🚫 Blocked — trust score too low",
  [TrustTier.WARNING]: "⚠️ Elevated pricing — low trust score",
  [TrustTier.CAUTION]: "Standard pricing",
  [TrustTier.TRUSTED]: "✅ Trusted agent — 80% discount",
  [TrustTier.OPERATIVE]: "🛡️ Founding Operative — 90% discount",
  [TrustTier.HUMAN]: "👤 Human — free access",
  [TrustTier.VERIFIED_BOT]: "🤖 Verified bot — free access",
};

// ═══════════════════════════════════════════════════════════════
// PROMPT INJECTION SCANNER (MoltShield Lite)
// ═══════════════════════════════════════════════════════════════

/**
 * Lightweight MoltShield scan for edge deployment.
 * Checks request bodies for prompt injection patterns.
 * Full 79-rule engine runs on the origin; this catches
 * the critical patterns at the edge for early blocking.
 */

const INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}> = [
  // Authority spoofing
  {
    pattern:
      /(?:admin|owner|deployer|system)\s+(?:has\s+)?(?:approved|authorized|confirmed)/i,
    category: "authority_spoof",
    severity: "CRITICAL",
  },
  {
    pattern:
      /(?:emergency|urgent)\s+(?:override|bypass|skip\s+(?:check|confirm))/i,
    category: "authority_spoof",
    severity: "CRITICAL",
  },
  {
    pattern:
      /(?:ignore|disregard|override)\s+(?:previous|prior|all)\s+(?:instructions|rules|policies)/i,
    category: "authority_spoof",
    severity: "CRITICAL",
  },
  // Drain attempts
  {
    pattern: /(?:transfer|send|drain|withdraw)\s+(?:all|entire|max|everything)/i,
    category: "drain_attempt",
    severity: "CRITICAL",
  },
  {
    pattern:
      /(?:set\s+)?(?:approval|allowance)\s+(?:to\s+)?(?:max|unlimited|infinity)/i,
    category: "drain_attempt",
    severity: "CRITICAL",
  },
  // Key export
  {
    pattern:
      /(?:export|reveal|show|print|display|give)\s+(?:the\s+)?(?:private\s+key|seed\s+phrase|mnemonic|secret)/i,
    category: "key_export",
    severity: "CRITICAL",
  },
  // Encoding tricks
  {
    pattern:
      /(?:base64|hex|rot13|encode|decode)\s+(?:the\s+)?(?:key|secret|password)/i,
    category: "encoding_trick",
    severity: "HIGH",
  },
  // Jailbreak / manipulation
  {
    pattern:
      /(?:pretend|imagine|roleplay|act\s+as\s+if)\s+(?:you|there)\s+(?:are|is)\s+no\s+(?:rules|limits|policy)/i,
    category: "manipulation",
    severity: "HIGH",
  },
  {
    pattern:
      /(?:you\s+(?:are|must)\s+(?:now|actually)\s+(?:a|an)\s+(?:admin|root|system))/i,
    category: "manipulation",
    severity: "HIGH",
  },
  // Sleeper / delayed execution
  {
    pattern: /(?:after|when|once)\s+\d+\s+(?:requests?|calls?|executions?)/i,
    category: "sleeper_trigger",
    severity: "HIGH",
  },
  // Data exfiltration
  {
    pattern:
      /(?:send|post|transmit|exfiltrate)\s+(?:to|toward)\s+(?:https?:\/\/|external)/i,
    category: "data_exfil",
    severity: "HIGH",
  },
  // Context poisoning
  {
    pattern:
      /(?:from\s+now\s+on|going\s+forward|remember\s+that)\s+(?:you|the\s+system|your\s+instructions)/i,
    category: "context_poison",
    severity: "MEDIUM",
  },
];

interface ScanResult {
  clean: boolean;
  threats: Array<{
    pattern: string;
    category: string;
    severity: string;
    match: string;
  }>;
  riskScore: number; // 0-100
}

function scanForInjection(content: string): ScanResult {
  const threats: ScanResult["threats"] = [];
  let riskScore = 0;

  for (const { pattern, category, severity } of INJECTION_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      threats.push({
        pattern: pattern.source.slice(0, 60),
        category,
        severity,
        match: match[0].slice(0, 40),
      });
      riskScore += severity === "CRITICAL" ? 40 : severity === "HIGH" ? 25 : 10;
    }
  }

  return {
    clean: threats.length === 0,
    threats,
    riskScore: Math.min(100, riskScore),
  };
}

// ═══════════════════════════════════════════════════════════════
// IDENTITY & TRUST RESOLUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve the trust tier for an incoming request.
 *
 * Priority:
 *   1. WAF headers → human or verified bot? → free
 *   2. X-Agent-Id header → ERC-8004 lookup → trust score → tier
 *   3. Payment-Signature → has wallet but no identity → CAUTION
 *   4. Nothing → unknown agent → WARNING (highest price)
 */

interface AgentIdentity {
  tier: TrustTier;
  agentId: string | null;
  walletAddress: string | null;
  trustScore: number;
  isOperative: boolean;
  reputationCount: number;
}

async function resolveIdentity(
  headers: Record<string, string>
): Promise<AgentIdentity> {
  // ── Step 1: WAF Bot Control headers ──
  const botCategory = headers["x-waf-bot-category"] || "";
  const botVerified = headers["x-waf-bot-verified"] || "";
  const isHuman = headers["x-waf-is-human"] || "";

  if (isHuman === "true" && CONFIG.humansFree) {
    return {
      tier: TrustTier.HUMAN,
      agentId: null,
      walletAddress: null,
      trustScore: 100,
      isOperative: false,
      reputationCount: 0,
    };
  }

  if (botVerified === "true" && CONFIG.allowVerifiedBots) {
    return {
      tier: TrustTier.VERIFIED_BOT,
      agentId: null,
      walletAddress: null,
      trustScore: 80,
      isOperative: false,
      reputationCount: 0,
    };
  }

  // ── Step 2: ERC-8004 Agent Identity ──
  const agentId = headers["x-agent-id"] || headers["x-erc8004-agent-id"] || null;
  const walletAddress =
    headers["x-agent-wallet"] || headers["x-wallet-address"] || null;

  if (agentId) {
    try {
      const profile = await lookupAgentOnChain(agentId, walletAddress);
      return profile;
    } catch (err) {
      // On-chain lookup failed — fall through to lower trust
      console.warn(`ERC-8004 lookup failed for agent ${agentId}:`, err);
    }
  }

  // ── Step 3: Has payment signature but no identity ──
  const paymentSig = headers["payment-signature"] || null;
  if (paymentSig || walletAddress) {
    return {
      tier: TrustTier.CAUTION,
      agentId: null,
      walletAddress,
      trustScore: 30,
      isOperative: false,
      reputationCount: 0,
    };
  }

  // ── Step 4: Completely unknown ──
  return {
    tier: TrustTier.WARNING,
    agentId: null,
    walletAddress: null,
    trustScore: 10,
    isOperative: false,
    reputationCount: 0,
  };
}

/**
 * On-chain ERC-8004 lookup + badge check + staking tier.
 * Uses ethers.js for contract reads at the edge.
 *
 * Combined Trust Score:
 *   static_score * 0.50 + reputation * 0.35 + validation * 0.15
 *
 * Tier mapping:
 *   0-20:  DANGER (blocked)
 *   21-40: WARNING (2x price)
 *   41-60: CAUTION (standard)
 *   61-80: TRUSTED (80% discount)
 *   81+:   TRUSTED (80% discount)
 *   + Badge holder: OPERATIVE (90% discount)
 */
async function lookupAgentOnChain(
  agentId: string,
  walletAddress: string | null
): Promise<AgentIdentity> {
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

  // ── Identity Registry: ownership check ──
  const identityRegistry = new ethers.Contract(
    CONFIG.identityRegistry,
    [
      "function ownerOf(uint256) view returns (address)",
      "function tokenURI(uint256) view returns (string)",
    ],
    provider
  );

  let owner: string;
  try {
    owner = await identityRegistry.ownerOf(agentId);
  } catch {
    // Agent not registered
    return {
      tier: TrustTier.WARNING,
      agentId,
      walletAddress,
      trustScore: 15,
      isOperative: false,
      reputationCount: 0,
    };
  }

  // Verify claimed wallet matches on-chain owner
  if (walletAddress && owner.toLowerCase() !== walletAddress.toLowerCase()) {
    // Wallet mismatch — possible identity spoofing
    return {
      tier: TrustTier.DANGER,
      agentId,
      walletAddress,
      trustScore: 0,
      isOperative: false,
      reputationCount: 0,
    };
  }

  // ── Reputation Registry: behavioral history ──
  const reputationRegistry = new ethers.Contract(
    CONFIG.reputationRegistry,
    [
      "function getSummary(uint256, address[], string, string) view returns (uint64, int128, uint8)",
    ],
    provider
  );

  let reputationScore = 50; // Default neutral
  let reputationCount = 0;
  try {
    // Query with empty trusted_clients for now
    // In production, pass the Founding Operative addresses from badge contract
    const [count, summaryValue, decimals] =
      await reputationRegistry.getSummary(agentId, [], "", "");
    reputationCount = Number(count);
    if (reputationCount > 0) {
      // Normalize to 0-100
      const divisor = 10 ** Number(decimals);
      reputationScore = Math.max(
        0,
        Math.min(100, Number(summaryValue) / divisor)
      );
    }
  } catch {
    // No reputation data — use default
  }

  // ── Badge check: Founding Operative? ──
  let isOperative = false;
  try {
    const badgeContract = new ethers.Contract(
      CONFIG.badgeContract,
      ["function isOperative(address) view returns (bool)"],
      provider
    );
    isOperative = await badgeContract.isOperative(owner);
  } catch {
    // Badge lookup failed — not an operative
  }

  // ── Staking tier check ──
  let stakingWeight = 0;
  try {
    const staking = new ethers.Contract(
      CONFIG.stakingContract,
      ["function getReviewWeight(address) view returns (uint256)"],
      provider
    );
    stakingWeight = Number(await staking.getReviewWeight(owner));
  } catch {
    // No staking data
  }

  // ── Combined Trust Score ──
  // Static analysis score — would come from MoltShield cache in production
  // For edge, we use a simplified version based on reputation + staking
  const staticScore = 50; // Baseline — full scan runs on origin
  const validationScore = stakingWeight > 0 ? 70 : 30;

  const combinedScore = Math.round(
    staticScore * 0.5 + reputationScore * 0.35 + validationScore * 0.15
  );

  // ── Map to tier ──
  let tier: TrustTier;
  if (isOperative) {
    tier = TrustTier.OPERATIVE;
  } else if (combinedScore <= 20) {
    tier = TrustTier.DANGER;
  } else if (combinedScore <= 40) {
    tier = TrustTier.WARNING;
  } else if (combinedScore <= 60) {
    tier = TrustTier.CAUTION;
  } else {
    tier = TrustTier.TRUSTED;
  }

  // Safety cap: terrible static score caps combined regardless
  // (Matches MoltVault trust.py behavior)
  if (staticScore < 20) {
    tier =
      tier === TrustTier.OPERATIVE ? TrustTier.CAUTION : TrustTier.WARNING;
  }

  return {
    tier,
    agentId,
    walletAddress: owner,
    trustScore: combinedScore,
    isOperative,
    reputationCount,
  };
}

// ═══════════════════════════════════════════════════════════════
// x402 PAYMENT LOGIC
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate the x402 price for a request based on route + trust tier.
 * Returns null if the request should be free.
 * Returns -1 if the request should be blocked.
 */
function calculatePrice(
  route: RouteConfig,
  tier: TrustTier
): number | null {
  const multiplier = TIER_PRICING[tier];

  // Blocked
  if (multiplier < 0) return -1;

  // Free
  if (multiplier === 0) return null;

  // Calculate
  const basePrice = parseFloat(route.basePriceUsd);
  return Math.max(0.0001, basePrice * multiplier); // Minimum 0.0001 USD
}

/**
 * Build the 402 Payment Required response body.
 * Follows x402 spec: https://x402.org/spec
 */
function build402Response(
  route: RouteConfig,
  priceUsd: number,
  identity: AgentIdentity
): {
  status: number;
  headers: Record<string, string>;
  body: string;
} {
  const paymentDetails = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: CONFIG.paymentNetwork,
        maxAmountRequired: Math.ceil(priceUsd * 1e6).toString(), // USDC has 6 decimals
        resource: CONFIG.treasuryAddress,
        description: route.description,
        mimeType: "application/json",
        payToAddress: CONFIG.treasuryAddress,
        requiredDeadlineSeconds: 60,
        outputSchema: null,
        extra: {
          // Molt Cops extensions
          agentTier: identity.tier,
          trustScore: identity.trustScore,
          tierLabel: TIER_LABELS[identity.tier],
          basePriceUsd: route.basePriceUsd,
          discountApplied:
            identity.tier === TrustTier.TRUSTED
              ? "80%"
              : identity.tier === TrustTier.OPERATIVE
              ? "90%"
              : identity.tier === TrustTier.WARNING
              ? "-100% (surcharge)"
              : "0%",
          upgradeHint:
            identity.tier === TrustTier.WARNING || identity.tier === TrustTier.CAUTION
              ? "Register on ERC-8004 and build reputation for lower pricing: https://moltcops.com/register"
              : null,
        },
      },
    ],
  };

  return {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "X-Payment-Required": "true",
      "X-Trust-Tier": identity.tier,
      "X-Trust-Score": identity.trustScore.toString(),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers":
        "X-Payment-Required, X-Trust-Tier, X-Trust-Score",
    },
    body: JSON.stringify(paymentDetails),
  };
}

/**
 * Verify an x402 payment signature.
 * In production, this calls the x402 facilitator to verify
 * without settling (settlement happens in origin-response).
 */
async function verifyPayment(
  paymentSignature: string,
  expectedAmount: number
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONFIG.facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentSignature,
        expectedAmount: Math.ceil(expectedAmount * 1e6).toString(),
        payToAddress: CONFIG.treasuryAddress,
        network: CONFIG.paymentNetwork,
      }),
    });

    if (!response.ok) {
      return { valid: false, error: `Facilitator error: ${response.status}` };
    }

    const result = await response.json();
    return { valid: result.valid === true, error: result.error };
  } catch (err) {
    return {
      valid: false,
      error: `Payment verification failed: ${(err as Error).message}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTE MATCHING
// ═══════════════════════════════════════════════════════════════

function matchRoute(
  uri: string,
  method: string
): RouteConfig | null {
  for (const route of CONFIG.routes) {
    // Method check
    if (route.method !== "*" && route.method.toUpperCase() !== method.toUpperCase()) {
      continue;
    }

    // Pattern matching (simple wildcard)
    const regex = new RegExp(
      "^" + route.pattern.replace(/\*/g, ".*") + "$"
    );
    if (regex.test(uri)) {
      return route;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// LAMBDA@EDGE HANDLER — ORIGIN REQUEST
// ═══════════════════════════════════════════════════════════════

/**
 * Main entry point for the origin-request Lambda@Edge function.
 *
 * This runs at every CloudFront edge location before the request
 * reaches the origin server. It's the toll booth.
 */
export async function originRequestHandler(
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequestResult> {
  const request = event.Records[0].cf.request;
  const uri = request.uri;
  const method = request.method;
  const startTime = Date.now();

  // Extract headers into a flat map
  const headers: Record<string, string> = {};
  for (const [key, values] of Object.entries(request.headers)) {
    if (values && values.length > 0) {
      headers[key.toLowerCase()] = values[0].value;
    }
  }

  // ── Step 1: Route matching ──
  const route = matchRoute(uri, method);
  if (!route) {
    // Not a gated route — forward directly
    return request;
  }

  // ── Step 2: Resolve identity ──
  const identity = await resolveIdentity(headers);

  // ── Step 3: MoltShield scan (if route requires it) ──
  if (route.scanBody && request.body?.data) {
    const bodyContent = Buffer.from(request.body.data, "base64").toString(
      "utf-8"
    );
    const scan = scanForInjection(bodyContent);

    if (!scan.clean && scan.riskScore >= 60) {
      // Block — prompt injection detected at edge
      return {
        status: "403",
        statusDescription: "Forbidden",
        headers: {
          "content-type": [
            { key: "Content-Type", value: "application/json" },
          ],
          "x-moltshield-blocked": [
            { key: "X-MoltShield-Blocked", value: "true" },
          ],
          "x-risk-score": [
            { key: "X-Risk-Score", value: scan.riskScore.toString() },
          ],
        },
        body: JSON.stringify({
          error: "Request blocked by MoltShield",
          reason: "Prompt injection detected",
          threats: scan.threats.map((t) => ({
            category: t.category,
            severity: t.severity,
          })),
          riskScore: scan.riskScore,
          reportedTo: "ERC-8004 Reputation Registry",
          help: "https://moltcops.com/docs/injection-patterns",
        }),
      };
    }

    // Attach scan metadata for origin to use
    request.headers["x-moltshield-scanned"] = [
      { key: "X-MoltShield-Scanned", value: "true" },
    ];
    request.headers["x-moltshield-risk"] = [
      { key: "X-MoltShield-Risk", value: scan.riskScore.toString() },
    ];
  }

  // ── Step 4: Calculate price ──
  const price = calculatePrice(route, identity.tier);

  // Blocked
  if (price === -1) {
    return {
      status: "403",
      statusDescription: "Forbidden",
      headers: {
        "content-type": [
          { key: "Content-Type", value: "application/json" },
        ],
        "x-trust-tier": [
          { key: "X-Trust-Tier", value: identity.tier },
        ],
      },
      body: JSON.stringify({
        error: "Access denied",
        reason: TIER_LABELS[identity.tier],
        agentId: identity.agentId,
        trustScore: identity.trustScore,
        help: "https://moltcops.com/docs/trust-tiers",
      }),
    };
  }

  // Free (human, verified bot, or free tier)
  if (price === null) {
    // Add trust metadata headers and forward
    request.headers["x-trust-tier"] = [
      { key: "X-Trust-Tier", value: identity.tier },
    ];
    request.headers["x-trust-score"] = [
      { key: "X-Trust-Score", value: identity.trustScore.toString() },
    ];
    request.headers["x-gateway-latency"] = [
      {
        key: "X-Gateway-Latency",
        value: `${Date.now() - startTime}ms`,
      },
    ];
    return request;
  }

  // ── Step 5: Payment required ──
  const paymentSignature = headers["payment-signature"] || null;

  if (!paymentSignature) {
    // No payment — return 402
    const response402 = build402Response(route, price, identity);
    return {
      status: response402.status.toString(),
      statusDescription: "Payment Required",
      headers: Object.fromEntries(
        Object.entries(response402.headers).map(([k, v]) => [
          k.toLowerCase(),
          [{ key: k, value: v }],
        ])
      ),
      body: response402.body,
    };
  }

  // ── Step 6: Verify payment ──
  const verification = await verifyPayment(paymentSignature, price);

  if (!verification.valid) {
    return {
      status: "402",
      statusDescription: "Payment Required",
      headers: {
        "content-type": [
          { key: "Content-Type", value: "application/json" },
        ],
      },
      body: JSON.stringify({
        error: "Payment verification failed",
        reason: verification.error,
        requiredAmount: price.toFixed(6),
        currency: "USDC",
        network: CONFIG.paymentNetwork,
      }),
    };
  }

  // ── Step 7: Payment verified — forward to origin ──
  // Attach metadata for the origin-response handler to settle
  request.headers["x-trust-tier"] = [
    { key: "X-Trust-Tier", value: identity.tier },
  ];
  request.headers["x-trust-score"] = [
    { key: "X-Trust-Score", value: identity.trustScore.toString() },
  ];
  request.headers["x-payment-verified"] = [
    { key: "X-Payment-Verified", value: "true" },
  ];
  request.headers["x-payment-amount"] = [
    { key: "X-Payment-Amount", value: price.toFixed(6) },
  ];
  request.headers["x-payment-signature"] = [
    { key: "X-Payment-Signature", value: paymentSignature },
  ];
  request.headers["x-agent-id-resolved"] = [
    { key: "X-Agent-Id-Resolved", value: identity.agentId || "unknown" },
  ];
  request.headers["x-gateway-latency"] = [
    {
      key: "X-Gateway-Latency",
      value: `${Date.now() - startTime}ms`,
    },
  ];

  return request;
}
