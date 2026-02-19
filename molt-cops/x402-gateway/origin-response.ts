/**
 * ═══════════════════════════════════════════════════════════════
 *  🚨 MOLT COPS x402 GATEWAY — Lambda@Edge Origin Response
 * ═══════════════════════════════════════════════════════════════
 *
 *  The "Honest Settlement" — runs after the origin responds.
 *  Only settles payment if the origin returned a success response.
 *  Posts reputation feedback to ERC-8004 based on outcome.
 *
 *  Pipeline:
 *    1. Check origin status    → Did the backend succeed?
 *    2. Settle or refund       → Pay only on success (< 400)
 *    3. Reputation feedback    → Post to ERC-8004 registry
 *    4. Scan fee burn          → Trigger $MCOP burn loop
 *    5. Dispatch log           → Write to threat feed
 *
 *  Deploy: Lambda@Edge on CloudFront (origin-response event)
 *  Pair with: origin-request handler for verification
 *
 *  @module x402-gateway/origin-response
 */

import {
  CloudFrontResponseEvent,
  CloudFrontResponseResult,
} from "aws-lambda";

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  facilitatorUrl:
    process.env.FACILITATOR_URL || "https://x402.org/facilitator",
  treasuryAddress:
    process.env.TREASURY_ADDRESS ||
    "0x0000000000000000000000000000000000000000",
  rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",

  // Reputation feedback endpoint (Molt Cops backend)
  reputationApiUrl:
    process.env.REPUTATION_API_URL || "https://api.moltcops.com",
  reputationApiKey: process.env.REPUTATION_API_KEY || "",

  // Scan fee burn trigger (Molt Cops backend)
  burnApiUrl: process.env.BURN_API_URL || "https://api.moltcops.com",

  // Dispatch feed (threat logging)
  dispatchUrl:
    process.env.DISPATCH_URL || "https://api.moltcops.com/dispatch",

  paymentNetwork: process.env.PAYMENT_NETWORK || "base",
};

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface SettlementResult {
  settled: boolean;
  txHash?: string;
  error?: string;
}

interface ReputationFeedback {
  agentId: string;
  feedbackType: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  context: string;
  tags: string[];
  timestamp: number;
}

interface DispatchEntry {
  type: "PAYMENT_SETTLED" | "PAYMENT_REFUNDED" | "THREAT_BLOCKED" | "ACCESS_GRANTED";
  agentId: string | null;
  trustTier: string;
  trustScore: number;
  route: string;
  method: string;
  originStatus: number;
  paymentAmount: string | null;
  settlementTx: string | null;
  latencyMs: number;
  timestamp: string;
  metadata: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════
// SETTLEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Settle the x402 payment via the facilitator.
 * Only called when origin returned status < 400.
 *
 * The facilitator holds the payment in escrow during the
 * origin-request phase. This call releases it to the treasury.
 */
async function settlePayment(
  paymentSignature: string,
  amount: string
): Promise<SettlementResult> {
  try {
    const response = await fetch(`${CONFIG.facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentSignature,
        payToAddress: CONFIG.treasuryAddress,
        network: CONFIG.paymentNetwork,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return {
        settled: false,
        error: `Facilitator settlement failed (${response.status}): ${errBody}`,
      };
    }

    const result = await response.json();
    return {
      settled: true,
      txHash: result.transactionHash || result.txHash || null,
    };
  } catch (err) {
    return {
      settled: false,
      error: `Settlement error: ${(err as Error).message}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// REPUTATION FEEDBACK
// ═══════════════════════════════════════════════════════════════

/**
 * Post reputation feedback to ERC-8004 via the Molt Cops API.
 *
 * Feedback types:
 *   POSITIVE  — Agent paid, request succeeded, clean interaction
 *   NEGATIVE  — Agent was blocked (injection, blacklisted, etc.)
 *   NEUTRAL   — Agent paid but origin returned error (not agent's fault)
 *
 * The backend batches these and submits on-chain via the
 * Reputation Registry contract.
 */
async function postReputationFeedback(
  feedback: ReputationFeedback
): Promise<void> {
  try {
    await fetch(`${CONFIG.reputationApiUrl}/api/reputation/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.reputationApiKey}`,
      },
      body: JSON.stringify(feedback),
    });
  } catch (err) {
    // Non-blocking — don't fail the response over feedback
    console.warn("Reputation feedback failed:", (err as Error).message);
  }
}

// ═══════════════════════════════════════════════════════════════
// SCAN FEE BURN LOOP
// ═══════════════════════════════════════════════════════════════

/**
 * Trigger the $MCOP burn loop after successful x402 payment.
 *
 * Flow:
 *   1. USDC arrives at treasury from x402 settlement
 *   2. Backend triggers market buy of $MCOP on DEX
 *   3. Calls MCOPToken.payScanFee() which splits:
 *      - 70% to treasury (operational)
 *      - 20% burned permanently (deflationary)
 *      - 10% to staking reward pool
 *
 * This is async and non-blocking. The burn happens in the
 * background after the response is returned to the client.
 */
async function triggerBurnLoop(
  paymentAmountUsd: string,
  agentId: string | null,
  route: string
): Promise<void> {
  try {
    await fetch(`${CONFIG.burnApiUrl}/api/treasury/burn-loop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.reputationApiKey}`,
      },
      body: JSON.stringify({
        usdcAmount: paymentAmountUsd,
        source: "x402_scan_fee",
        agentId: agentId || "unknown",
        route,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.warn("Burn loop trigger failed:", (err as Error).message);
  }
}

// ═══════════════════════════════════════════════════════════════
// DISPATCH FEED
// ═══════════════════════════════════════════════════════════════

/**
 * Log to the public threat/activity feed.
 * This data powers the Molt Cops dashboard dispatch view.
 */
async function logToDispatch(entry: DispatchEntry): Promise<void> {
  try {
    await fetch(`${CONFIG.dispatchUrl}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.reputationApiKey}`,
      },
      body: JSON.stringify(entry),
    });
  } catch (err) {
    console.warn("Dispatch log failed:", (err as Error).message);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Extract header value
// ═══════════════════════════════════════════════════════════════

function getHeader(
  headers: Record<string, Array<{ key?: string; value: string }>>,
  name: string
): string | null {
  const key = name.toLowerCase();
  const entry = headers[key];
  if (entry && entry.length > 0) {
    return entry[0].value;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// LAMBDA@EDGE HANDLER — ORIGIN RESPONSE
// ═══════════════════════════════════════════════════════════════

/**
 * Main entry point for the origin-response Lambda@Edge function.
 *
 * This runs after the origin server has responded. It decides
 * whether to settle the payment or refund it based on the
 * origin's status code.
 *
 * The critical guarantee: agents are NEVER charged for failed requests.
 */
export async function originResponseHandler(
  event: CloudFrontResponseEvent
): Promise<CloudFrontResponseResult> {
  const response = event.Records[0].cf.response;
  const request = event.Records[0].cf.request;
  const originStatus = parseInt(response.status, 10);
  const startTime = Date.now();

  // ── Extract metadata from origin-request headers ──
  const reqHeaders = request.headers || {};
  const paymentVerified = getHeader(reqHeaders, "x-payment-verified");
  const paymentAmount = getHeader(reqHeaders, "x-payment-amount");
  const paymentSignature = getHeader(reqHeaders, "x-payment-signature");
  const trustTier = getHeader(reqHeaders, "x-trust-tier") || "UNKNOWN";
  const trustScore = parseInt(
    getHeader(reqHeaders, "x-trust-score") || "0",
    10
  );
  const agentId = getHeader(reqHeaders, "x-agent-id-resolved");
  const moltshieldBlocked =
    getHeader(reqHeaders, "x-moltshield-blocked") === "true";

  // ── If no payment was involved, pass through ──
  if (paymentVerified !== "true" || !paymentSignature || !paymentAmount) {
    // Still log free access for the dispatch feed
    if (trustTier !== "UNKNOWN") {
      logToDispatch({
        type: "ACCESS_GRANTED",
        agentId,
        trustTier,
        trustScore,
        route: request.uri,
        method: request.method,
        originStatus,
        paymentAmount: null,
        settlementTx: null,
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        metadata: {
          accessType: "free",
          reason: trustTier === "HUMAN" ? "human_traffic" : "free_tier",
        },
      });
    }

    // Add Molt Cops response headers
    response.headers["x-protected-by"] = [
      { key: "X-Protected-By", value: "MoltCops/x402-Gateway" },
    ];

    return response;
  }

  // ═══════════════════════════════════════════════════════════
  // PAID REQUEST — SETTLEMENT DECISION
  // ═══════════════════════════════════════════════════════════

  const paymentAmountFloat = parseFloat(paymentAmount);

  // ── Origin succeeded (status < 400) → SETTLE ──
  if (originStatus < 400) {
    const settlement = await settlePayment(paymentSignature, paymentAmount);

    // Post positive reputation feedback
    if (agentId && agentId !== "unknown") {
      postReputationFeedback({
        agentId,
        feedbackType: "POSITIVE",
        context: `Successful paid request to ${request.uri}`,
        tags: ["x402", "payment_success", request.method.toLowerCase()],
        timestamp: Date.now(),
      });
    }

    // Trigger burn loop
    if (settlement.settled) {
      triggerBurnLoop(paymentAmount, agentId, request.uri);
    }

    // Log to dispatch
    logToDispatch({
      type: "PAYMENT_SETTLED",
      agentId,
      trustTier,
      trustScore,
      route: request.uri,
      method: request.method,
      originStatus,
      paymentAmount,
      settlementTx: settlement.txHash || null,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      metadata: {
        settled: settlement.settled.toString(),
        error: settlement.error || "",
      },
    });

    // Add settlement headers to response
    response.headers["x-payment-settled"] = [
      { key: "X-Payment-Settled", value: settlement.settled.toString() },
    ];
    if (settlement.txHash) {
      response.headers["x-settlement-tx"] = [
        { key: "X-Settlement-Tx", value: settlement.txHash },
      ];
    }
    response.headers["x-protected-by"] = [
      { key: "X-Protected-By", value: "MoltCops/x402-Gateway" },
    ];

    return response;
  }

  // ── Origin failed (status >= 400) → DO NOT SETTLE ──
  // This is the core guarantee: agents never pay for failed requests.

  // Post neutral reputation feedback (not the agent's fault)
  if (agentId && agentId !== "unknown") {
    postReputationFeedback({
      agentId,
      feedbackType: "NEUTRAL",
      context: `Origin returned ${originStatus} for ${request.uri} — payment NOT settled`,
      tags: ["x402", "payment_refunded", `status_${originStatus}`],
      timestamp: Date.now(),
    });
  }

  // Log to dispatch
  logToDispatch({
    type: "PAYMENT_REFUNDED",
    agentId,
    trustTier,
    trustScore,
    route: request.uri,
    method: request.method,
    originStatus,
    paymentAmount,
    settlementTx: null,
    latencyMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    metadata: {
      reason: `Origin returned ${originStatus} — payment not settled`,
      refundedAmount: paymentAmount,
    },
  });

  // Add refund headers
  response.headers["x-payment-settled"] = [
    { key: "X-Payment-Settled", value: "false" },
  ];
  response.headers["x-payment-refund-reason"] = [
    {
      key: "X-Payment-Refund-Reason",
      value: `Origin returned ${originStatus}`,
    },
  ];
  response.headers["x-protected-by"] = [
    { key: "X-Protected-By", value: "MoltCops/x402-Gateway" },
  ];

  return response;
}
