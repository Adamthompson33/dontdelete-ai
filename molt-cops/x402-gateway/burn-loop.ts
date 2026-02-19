/**
 * ═══════════════════════════════════════════════════════════════
 *  🚨 MOLT COPS — Treasury Burn Loop Service
 * ═══════════════════════════════════════════════════════════════
 *
 *  Triggered by the x402 gateway origin-response handler after
 *  successful payment settlement.
 *
 *  Flow:
 *    1. Receive USDC settlement notification from x402 gateway
 *    2. Queue the burn operation (batched for gas efficiency)
 *    3. When batch threshold hit: swap USDC → MCOP on DEX
 *    4. Call MCOPToken.payScanFee() which splits:
 *       - 70% to treasury (operational costs)
 *       - 20% burned permanently (deflationary pressure)
 *       - 10% to staking reward pool (reviewer incentives)
 *    5. Log to dispatch feed
 *
 *  The burn loop runs as a cron worker, not on every request.
 *  Individual x402 payments are queued and batched.
 *
 *  @module treasury/burn-loop
 */

import { ethers } from "ethers";

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

interface BurnLoopConfig {
  rpcUrl: string;
  mcopTokenAddress: string;
  stakingContractAddress: string;
  treasuryPrivateKey: string; // Multisig signer (1 of 3)
  usdcAddress: string;
  dexRouterAddress: string; // Aerodrome or Uniswap V3 router
  batchThresholdUsdc: number; // Min USDC to trigger a swap (e.g., $50)
  maxSlippageBps: number; // Max slippage in basis points (e.g., 300 = 3%)
}

const DEFAULT_CONFIG: BurnLoopConfig = {
  rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
  mcopTokenAddress: process.env.MCOP_TOKEN || ethers.ZeroAddress,
  stakingContractAddress: process.env.STAKING_CONTRACT || ethers.ZeroAddress,
  treasuryPrivateKey: process.env.TREASURY_SIGNER_KEY || "",
  usdcAddress:
    process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  dexRouterAddress: process.env.DEX_ROUTER || ethers.ZeroAddress,
  batchThresholdUsdc: parseFloat(process.env.BATCH_THRESHOLD || "50"),
  maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || "300"),
};

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface PendingBurn {
  id: string;
  usdcAmount: string;
  source: string;
  agentId: string;
  route: string;
  timestamp: string;
  status: "pending" | "batched" | "swapped" | "burned" | "failed";
}

interface BurnBatch {
  id: string;
  burns: PendingBurn[];
  totalUsdc: number;
  mcopReceived: string;
  mcopBurned: string;
  mcopToTreasury: string;
  mcopToStaking: string;
  swapTxHash: string | null;
  burnTxHash: string | null;
  timestamp: string;
  status: "pending" | "swapping" | "burning" | "complete" | "failed";
}

interface BurnStats {
  totalUsdcReceived: number;
  totalMcopBurned: number;
  totalMcopToStaking: number;
  totalBatches: number;
  pendingUsdc: number;
  lastBurnTimestamp: string | null;
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY QUEUE (Replace with Redis/SQS in production)
// ═══════════════════════════════════════════════════════════════

const pendingBurns: PendingBurn[] = [];
const completedBatches: BurnBatch[] = [];
let burnStats: BurnStats = {
  totalUsdcReceived: 0,
  totalMcopBurned: 0,
  totalMcopToStaking: 0,
  totalBatches: 0,
  pendingUsdc: 0,
  lastBurnTimestamp: null,
};

// ═══════════════════════════════════════════════════════════════
// QUEUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Queue a scan fee for the burn loop.
 * Called by the x402 origin-response handler after settlement.
 */
export function queueBurn(burn: Omit<PendingBurn, "id" | "status">): string {
  const id = `burn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: PendingBurn = {
    ...burn,
    id,
    status: "pending",
  };

  pendingBurns.push(entry);
  burnStats.pendingUsdc += parseFloat(burn.usdcAmount);
  burnStats.totalUsdcReceived += parseFloat(burn.usdcAmount);

  console.log(
    `[BurnLoop] Queued ${burn.usdcAmount} USDC from ${burn.source} ` +
      `(agent: ${burn.agentId}, route: ${burn.route}). ` +
      `Pending total: $${burnStats.pendingUsdc.toFixed(2)}`
  );

  return id;
}

/**
 * Check if batch threshold is met and trigger swap if so.
 * Called on a schedule (every 5 minutes) or after each queue addition.
 */
export async function checkAndExecuteBatch(
  config: BurnLoopConfig = DEFAULT_CONFIG
): Promise<BurnBatch | null> {
  if (burnStats.pendingUsdc < config.batchThresholdUsdc) {
    console.log(
      `[BurnLoop] Pending $${burnStats.pendingUsdc.toFixed(2)} ` +
        `< threshold $${config.batchThresholdUsdc}. Waiting.`
    );
    return null;
  }

  // Collect all pending burns into a batch
  const batchBurns = pendingBurns
    .filter((b) => b.status === "pending")
    .map((b) => {
      b.status = "batched";
      return b;
    });

  if (batchBurns.length === 0) return null;

  const totalUsdc = batchBurns.reduce(
    (sum, b) => sum + parseFloat(b.usdcAmount),
    0
  );

  const batch: BurnBatch = {
    id: `batch_${Date.now()}`,
    burns: batchBurns,
    totalUsdc,
    mcopReceived: "0",
    mcopBurned: "0",
    mcopToTreasury: "0",
    mcopToStaking: "0",
    swapTxHash: null,
    burnTxHash: null,
    timestamp: new Date().toISOString(),
    status: "pending",
  };

  console.log(
    `[BurnLoop] Executing batch ${batch.id}: ` +
      `${batchBurns.length} burns, $${totalUsdc.toFixed(2)} USDC`
  );

  try {
    // Step 1: Swap USDC → MCOP on DEX
    batch.status = "swapping";
    const swapResult = await swapUsdcToMcop(totalUsdc, config);
    batch.swapTxHash = swapResult.txHash;
    batch.mcopReceived = swapResult.mcopAmount;

    // Step 2: Call payScanFee() — 70/20/10 split
    batch.status = "burning";
    const burnResult = await executeScanFeeBurn(
      swapResult.mcopAmount,
      config
    );
    batch.burnTxHash = burnResult.txHash;
    batch.mcopBurned = burnResult.burned;
    batch.mcopToTreasury = burnResult.toTreasury;
    batch.mcopToStaking = burnResult.toStaking;

    // Update stats
    batch.status = "complete";
    burnStats.totalMcopBurned += parseFloat(burnResult.burned);
    burnStats.totalMcopToStaking += parseFloat(burnResult.toStaking);
    burnStats.totalBatches++;
    burnStats.pendingUsdc = 0; // Reset pending
    burnStats.lastBurnTimestamp = new Date().toISOString();

    // Remove processed burns from queue
    for (const burn of batchBurns) {
      burn.status = "burned";
    }

    completedBatches.push(batch);

    console.log(
      `[BurnLoop] ✅ Batch ${batch.id} complete: ` +
        `${batch.mcopReceived} MCOP received, ` +
        `${batch.mcopBurned} MCOP burned, ` +
        `${batch.mcopToStaking} MCOP to stakers`
    );

    return batch;
  } catch (err) {
    batch.status = "failed";
    console.error(`[BurnLoop] ❌ Batch ${batch.id} failed:`, err);

    // Requeue failed burns
    for (const burn of batchBurns) {
      burn.status = "pending";
    }

    completedBatches.push(batch);
    return batch;
  }
}

// ═══════════════════════════════════════════════════════════════
// DEX SWAP: USDC → MCOP
// ═══════════════════════════════════════════════════════════════

/**
 * Swap USDC for MCOP on a Base DEX (Aerodrome or Uniswap V3).
 *
 * Uses the treasury signer wallet. In production, this would be
 * a multisig transaction or a keeper bot with limited permissions.
 */
async function swapUsdcToMcop(
  usdcAmount: number,
  config: BurnLoopConfig
): Promise<{ txHash: string; mcopAmount: string }> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.treasuryPrivateKey, provider);

  // USDC has 6 decimals
  const usdcAmountWei = BigInt(Math.floor(usdcAmount * 1e6));

  // Approve USDC spend
  const usdc = new ethers.Contract(
    config.usdcAddress,
    [
      "function approve(address,uint256) returns (bool)",
      "function balanceOf(address) view returns (uint256)",
    ],
    signer
  );

  const balance = await usdc.balanceOf(signer.address);
  if (balance < usdcAmountWei) {
    throw new Error(
      `Insufficient USDC: have ${ethers.formatUnits(balance, 6)}, ` +
        `need ${usdcAmount}`
    );
  }

  const approveTx = await usdc.approve(
    config.dexRouterAddress,
    usdcAmountWei
  );
  await approveTx.wait();

  // Execute swap via DEX router
  // This is a simplified Uniswap V3-style interface.
  // Aerodrome would use a similar pattern.
  const router = new ethers.Contract(
    config.dexRouterAddress,
    [
      "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)",
    ],
    signer
  );

  // Calculate minimum output with slippage protection
  // In production, get a quote first via the quoter contract
  const minOutput = 0; // Simplified — production uses oracle price * (1 - slippage)

  const swapParams = {
    tokenIn: config.usdcAddress,
    tokenOut: config.mcopTokenAddress,
    fee: 3000, // 0.3% pool fee tier
    recipient: signer.address,
    deadline: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    amountIn: usdcAmountWei,
    amountOutMinimum: minOutput,
    sqrtPriceLimitX96: 0, // No price limit
  };

  const swapTx = await router.exactInputSingle(swapParams);
  const receipt = await swapTx.wait();

  // Parse the actual MCOP received from the swap event
  // Simplified — production would parse Transfer events
  const mcop = new ethers.Contract(
    config.mcopTokenAddress,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const mcopBalance = await mcop.balanceOf(signer.address);

  return {
    txHash: receipt.hash,
    mcopAmount: ethers.formatEther(mcopBalance),
  };
}

// ═══════════════════════════════════════════════════════════════
// SCAN FEE BURN: 70/20/10 SPLIT
// ═══════════════════════════════════════════════════════════════

/**
 * Call MCOPToken.payScanFee() to execute the split:
 *   70% → treasury wallet
 *   20% → burned permanently
 *   10% → staking reward pool
 */
async function executeScanFeeBurn(
  mcopAmount: string,
  config: BurnLoopConfig
): Promise<{
  txHash: string;
  burned: string;
  toTreasury: string;
  toStaking: string;
}> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.treasuryPrivateKey, provider);

  const mcopToken = new ethers.Contract(
    config.mcopTokenAddress,
    [
      "function payScanFee(uint256,address) external",
      "function approve(address,uint256) returns (bool)",
      "function totalBurned() view returns (uint256)",
    ],
    signer
  );

  const amountWei = ethers.parseEther(mcopAmount);

  // The token's payScanFee function uses transferFrom,
  // so we need to approve the token contract to spend our tokens
  // Actually, payScanFee calls _transfer and _burn internally
  // using msg.sender, so we call it directly

  const burnBefore = await mcopToken.totalBurned();

  const tx = await mcopToken.payScanFee(
    amountWei,
    config.stakingContractAddress
  );
  const receipt = await tx.wait();

  const burnAfter = await mcopToken.totalBurned();
  const actualBurned = burnAfter - burnBefore;

  // Calculate splits
  const totalAmount = parseFloat(mcopAmount);
  const treasuryAmount = totalAmount * 0.7;
  const burnedAmount = parseFloat(ethers.formatEther(actualBurned));
  const stakingAmount = totalAmount * 0.1;

  return {
    txHash: receipt.hash,
    burned: burnedAmount.toFixed(4),
    toTreasury: treasuryAmount.toFixed(4),
    toStaking: stakingAmount.toFixed(4),
  };
}

// ═══════════════════════════════════════════════════════════════
// API ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Express/Next.js route handler: POST /api/treasury/burn-loop
 * Called by the x402 origin-response handler.
 */
export async function handleBurnRequest(req: {
  body: {
    usdcAmount: string;
    source: string;
    agentId: string;
    route: string;
    timestamp: string;
  };
}): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const { usdcAmount, source, agentId, route, timestamp } = req.body;

    if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
      return {
        status: 400,
        body: { error: "Invalid usdcAmount" },
      };
    }

    const burnId = queueBurn({
      usdcAmount,
      source,
      agentId: agentId || "unknown",
      route: route || "/unknown",
      timestamp: timestamp || new Date().toISOString(),
    });

    // Check if we should execute a batch
    const batch = await checkAndExecuteBatch();

    return {
      status: 200,
      body: {
        queued: true,
        burnId,
        pendingUsdc: burnStats.pendingUsdc,
        batchExecuted: batch !== null,
        batchId: batch?.id || null,
        stats: {
          totalBurned: burnStats.totalMcopBurned,
          totalBatches: burnStats.totalBatches,
        },
      },
    };
  } catch (err) {
    return {
      status: 500,
      body: { error: (err as Error).message },
    };
  }
}

/**
 * Express/Next.js route handler: GET /api/treasury/stats
 * Public endpoint — powers the transparency dashboard.
 */
export function handleStatsRequest(): {
  status: number;
  body: Record<string, unknown>;
} {
  return {
    status: 200,
    body: {
      burnStats: {
        totalUsdcReceived: burnStats.totalUsdcReceived.toFixed(2),
        totalMcopBurned: burnStats.totalMcopBurned.toFixed(4),
        totalMcopToStaking: burnStats.totalMcopToStaking.toFixed(4),
        totalBatches: burnStats.totalBatches,
        pendingUsdc: burnStats.pendingUsdc.toFixed(2),
        lastBurnTimestamp: burnStats.lastBurnTimestamp,
      },
      recentBatches: completedBatches.slice(-10).reverse(),
      pendingCount: pendingBurns.filter((b) => b.status === "pending").length,
    },
  };
}

/**
 * Express/Next.js route handler: GET /api/treasury/burn-history
 * Public endpoint — full audit trail.
 */
export function handleBurnHistory(params: {
  limit?: number;
  offset?: number;
}): {
  status: number;
  body: Record<string, unknown>;
} {
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  return {
    status: 200,
    body: {
      total: completedBatches.length,
      limit,
      offset,
      batches: completedBatches.slice(offset, offset + limit).reverse(),
    },
  };
}
