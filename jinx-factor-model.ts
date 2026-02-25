/**
 * JINX FACTOR MODEL — Bot Challenge Tool #12
 * 
 * Purpose: Decompose WHY the portfolio is correlated.
 * Jinx already flags "86% long crowding, 230+ correlated pairs" but can't explain why.
 * This tool answers: Is it BTC beta? Sector concentration? Shared narrative? All three?
 * 
 * Input: Current portfolio signals from paper-ledger.json + price data from HyperLiquid
 * Output: Factor decomposition with actionable risk scores
 * 
 * Cron: Runs every 4 hours alongside other tools
 * 
 * INTEGRATION:
 *   - Reads: paper-ledger.json (active signals), desk-state.json (regime)
 *   - Writes: factor-model-output.json
 *   - Emailed to Jackbot as part of scan cycle
 * 
 * Author: Oracle (spec), Taylor (implementation)
 * Date: February 25, 2026
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// SECTOR CLASSIFICATIONS
// ============================================================
// Taylor: Update this as new coins enter the signal set.
// These are the coins that have appeared in Rei's scanner.

const SECTOR_MAP: Record<string, string> = {
  // Layer 1s
  SOL: "L1", ETH: "L1", AVAX: "L1", NEAR: "L1", SUI: "L1",
  APT: "L1", SEI: "L1", INJ: "L1", TIA: "L1", BERA: "L1",
  
  // Layer 2s / Scaling
  OP: "L2", ARB: "L2", STRK: "L2", MANTA: "L2", BLAST: "L2",
  ZK: "L2", SCROLL: "L2", BASE: "L2",
  
  // DeFi
  UMA: "DEFI", SNX: "DEFI", AAVE: "DEFI", UNI: "DEFI",
  SUSHI: "DEFI", CRV: "DEFI", MKR: "DEFI", COMP: "DEFI",
  CELO: "DEFI", YGG: "DEFI",
  
  // Gaming / Metaverse
  AXS: "GAMING", SAND: "GAMING", MANA: "GAMING", GALA: "GAMING",
  IMX: "GAMING", RONIN: "GAMING",
  
  // Meme / Narrative
  GOAT: "MEME", PEPE: "MEME", DOGE: "MEME", SHIB: "MEME",
  WIF: "MEME", BONK: "MEME", MON: "MEME",
  
  // Infrastructure
  GAS: "INFRA", FTT: "INFRA", LINK: "INFRA", GRT: "INFRA",
  FIL: "INFRA",
  
  // New / Unclassified
  ZORA: "NEW", STABLE: "NEW", "2Z": "NEW", "0G": "NEW",
  SOPH: "NEW", ACE: "NEW", SKR: "NEW", AZTEC: "NEW",
};

// Sector display names
const SECTOR_NAMES: Record<string, string> = {
  L1: "Layer 1",
  L2: "Layer 2 / Scaling",
  DEFI: "DeFi",
  GAMING: "Gaming / Metaverse",
  MEME: "Meme / Narrative",
  INFRA: "Infrastructure",
  NEW: "New / Unclassified",
};

// ============================================================
// TYPES
// ============================================================

interface Signal {
  coin: string;
  direction: "LONG" | "SHORT";
  tier: "HIGH" | "MEDIUM" | "LOW";
  tool: string;
  fundingAPR?: number;
  priceChange24h?: number;
  allocation?: number;
  timestamp: string;
}

interface FactorOutput {
  timestamp: string;
  regime: string;

  // Directional Analysis
  directional: {
    longCount: number;
    shortCount: number;
    longPct: number;
    longAllocPct: number;
    crowdingScore: number; // 0-100, higher = more concentrated
    verdict: string;
  };

  // Sector Concentration
  sectors: {
    name: string;
    code: string;
    count: number;
    allocPct: number;
    coins: string[];
  }[];
  sectorHHI: number; // Herfindahl-Hirschman Index (0-10000)
  sectorVerdict: string;

  // BTC Beta Exposure
  btcBeta: {
    avgCorrelation: number; // estimated from price moves
    highBetaCoins: string[];
    lowBetaCoins: string[];
    btcExposurePct: number;
    verdict: string;
  };

  // Shared Narrative Risk
  narrativeRisk: {
    clusters: {
      narrative: string;
      coins: string[];
      totalAlloc: number;
    }[];
    maxClusterPct: number;
    verdict: string;
  };

  // Overall Risk Score
  overallRisk: {
    score: number; // 0-100
    grade: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
    factors: string[]; // top contributing factors
    recommendation: string;
  };
}

// ============================================================
// CORE ANALYSIS FUNCTIONS
// ============================================================

function analyzeDirectional(signals: Signal[]): FactorOutput["directional"] {
  const longs = signals.filter((s) => s.direction === "LONG");
  const shorts = signals.filter((s) => s.direction === "SHORT");

  const totalAlloc = signals.reduce((sum, s) => sum + (s.allocation || 0), 0);
  const longAlloc = longs.reduce((sum, s) => sum + (s.allocation || 0), 0);

  const longPct = signals.length > 0
    ? Math.round((longs.length / signals.length) * 100)
    : 50;

  const longAllocPct = totalAlloc > 0
    ? Math.round((longAlloc / totalAlloc) * 100)
    : 50;

  // Crowding score: 50 = balanced, 100 = completely one-sided
  const crowdingScore = Math.abs(longPct - 50) * 2;

  let verdict: string;
  if (crowdingScore >= 80) {
    verdict = `CRITICAL: ${longPct}% ${longPct > 50 ? "LONG" : "SHORT"} — portfolio is a directional bet, not diversified carry`;
  } else if (crowdingScore >= 60) {
    verdict = `HIGH: ${longPct > 50 ? "Long" : "Short"}-biased at ${longPct}%. Regime-aware stops are the primary mitigation.`;
  } else if (crowdingScore >= 30) {
    verdict = `MODERATE: Slight ${longPct > 50 ? "long" : "short"} bias (${longPct}%). Acceptable for carry strategy.`;
  } else {
    verdict = `LOW: Well-balanced directional exposure (${longPct}% long / ${100 - longPct}% short).`;
  }

  return {
    longCount: longs.length,
    shortCount: shorts.length,
    longPct,
    longAllocPct,
    crowdingScore,
    verdict,
  };
}

function analyzeSectors(signals: Signal[]): {
  sectors: FactorOutput["sectors"];
  sectorHHI: number;
  sectorVerdict: string;
} {
  const sectorGroups: Record<string, { count: number; alloc: number; coins: string[] }> = {};
  const totalAlloc = signals.reduce((sum, s) => sum + (s.allocation || 1), 0);

  for (const sig of signals) {
    const sector = SECTOR_MAP[sig.coin] || "NEW";
    if (!sectorGroups[sector]) {
      sectorGroups[sector] = { count: 0, alloc: 0, coins: [] };
    }
    sectorGroups[sector].count++;
    sectorGroups[sector].alloc += sig.allocation || 1;
    if (!sectorGroups[sector].coins.includes(sig.coin)) {
      sectorGroups[sector].coins.push(sig.coin);
    }
  }

  const sectors = Object.entries(sectorGroups)
    .map(([code, data]) => ({
      name: SECTOR_NAMES[code] || code,
      code,
      count: data.count,
      allocPct: totalAlloc > 0 ? Math.round((data.alloc / totalAlloc) * 100) : 0,
      coins: data.coins,
    }))
    .sort((a, b) => b.allocPct - a.allocPct);

  // Herfindahl-Hirschman Index: sum of squared market shares
  // 10000 = perfect concentration (one sector), <1500 = diversified
  const hhi = sectors.reduce((sum, s) => sum + Math.pow(s.allocPct, 2), 0);

  let sectorVerdict: string;
  if (hhi >= 5000) {
    sectorVerdict = `CRITICAL: HHI ${hhi} — portfolio dominated by ${sectors[0].name} (${sectors[0].allocPct}%). A sector-wide event would be catastrophic.`;
  } else if (hhi >= 2500) {
    sectorVerdict = `HIGH: HHI ${hhi} — concentrated in ${sectors.slice(0, 2).map((s) => s.name).join(" and ")}. Consider sector caps.`;
  } else if (hhi >= 1500) {
    sectorVerdict = `MODERATE: HHI ${hhi} — some concentration but reasonable diversification across ${sectors.length} sectors.`;
  } else {
    sectorVerdict = `LOW: HHI ${hhi} — well-diversified across ${sectors.length} sectors.`;
  }

  return { sectors, sectorHHI: Math.round(hhi), sectorVerdict };
}

function analyzeBTCBeta(signals: Signal[]): FactorOutput["btcBeta"] {
  // Estimate BTC beta from 24h price changes
  // If a coin moves similarly to BTC, it has high beta
  // This is a rough proxy — proper beta needs historical regression
  
  const btcChange = -5.0; // Taylor: read from price feed
  const highBeta: string[] = [];
  const lowBeta: string[] = [];
  let totalCorr = 0;
  let counted = 0;

  for (const sig of signals) {
    if (sig.priceChange24h !== undefined && btcChange !== 0) {
      // Simple same-direction check as beta proxy
      const ratio = sig.priceChange24h / btcChange;
      if (ratio > 0.5 && ratio < 2.0) {
        // Moves in same direction, similar magnitude = high beta
        highBeta.push(sig.coin);
        totalCorr += Math.min(ratio, 2.0);
      } else if (ratio < 0 || ratio < 0.3) {
        // Moves opposite or barely = low beta
        lowBeta.push(sig.coin);
        totalCorr += Math.abs(ratio) * 0.3;
      } else {
        totalCorr += ratio * 0.5;
      }
      counted++;
    }
  }

  const avgCorrelation = counted > 0 ? Math.round((totalCorr / counted) * 100) / 100 : 0;
  const btcExposurePct = signals.length > 0
    ? Math.round((highBeta.length / signals.length) * 100)
    : 0;

  let verdict: string;
  if (btcExposurePct >= 80) {
    verdict = `CRITICAL: ${btcExposurePct}% of positions are high-BTC-beta. Portfolio is effectively a leveraged BTC position with extra steps.`;
  } else if (btcExposurePct >= 60) {
    verdict = `HIGH: ${btcExposurePct}% high-beta. Most positions will dump if BTC dumps further. Low-beta positions (${lowBeta.join(", ") || "none"}) provide some hedge.`;
  } else if (btcExposurePct >= 40) {
    verdict = `MODERATE: ${btcExposurePct}% high-beta. Mixed exposure gives some protection. Low-beta: ${lowBeta.join(", ") || "none"}.`;
  } else {
    verdict = `LOW: Only ${btcExposurePct}% high-beta. Portfolio has meaningful independence from BTC moves.`;
  }

  return {
    avgCorrelation,
    highBetaCoins: [...new Set(highBeta)],
    lowBetaCoins: [...new Set(lowBeta)],
    btcExposurePct,
    verdict,
  };
}

function analyzeNarrativeRisk(signals: Signal[]): FactorOutput["narrativeRisk"] {
  // Cluster coins by shared narrative themes
  // A "narrative" is a story that moves multiple coins simultaneously
  
  const narratives: Record<string, { coins: string[]; alloc: number }> = {
    "Alt L1 Recovery": { coins: [], alloc: 0 },
    "DeFi Revival": { coins: [], alloc: 0 },
    "Gaming Bounce": { coins: [], alloc: 0 },
    "New Token Hype": { coins: [], alloc: 0 },
    "Meme Momentum": { coins: [], alloc: 0 },
    "Infrastructure Demand": { coins: [], alloc: 0 },
    "L2 Scaling": { coins: [], alloc: 0 },
  };

  // Narrative mapping (coins can appear in multiple narratives)
  const NARRATIVE_MAP: Record<string, string[]> = {
    "Alt L1 Recovery": ["SOL", "AVAX", "NEAR", "SUI", "APT", "SEI", "INJ", "TIA", "BERA"],
    "DeFi Revival": ["UMA", "SNX", "AAVE", "UNI", "CRV", "MKR", "COMP", "CELO", "YGG"],
    "Gaming Bounce": ["AXS", "SAND", "MANA", "GALA", "IMX", "RONIN"],
    "New Token Hype": ["ZORA", "STABLE", "2Z", "0G", "SOPH", "ACE", "SKR", "AZTEC", "MON", "BERA"],
    "Meme Momentum": ["GOAT", "PEPE", "DOGE", "SHIB", "WIF", "BONK", "MON"],
    "Infrastructure Demand": ["GAS", "LINK", "GRT", "FIL", "FTT"],
    "L2 Scaling": ["OP", "ARB", "STRK", "MANTA", "BLAST", "ZK"],
  };

  const totalAlloc = signals.reduce((sum, s) => sum + (s.allocation || 1), 0);

  for (const sig of signals) {
    for (const [narrative, coins] of Object.entries(NARRATIVE_MAP)) {
      if (coins.includes(sig.coin)) {
        narratives[narrative].coins.push(sig.coin);
        narratives[narrative].alloc += sig.allocation || 1;
      }
    }
  }

  const clusters = Object.entries(narratives)
    .filter(([_, data]) => data.coins.length > 0)
    .map(([narrative, data]) => ({
      narrative,
      coins: [...new Set(data.coins)],
      totalAlloc: totalAlloc > 0
        ? Math.round((data.alloc / totalAlloc) * 100)
        : 0,
    }))
    .sort((a, b) => b.totalAlloc - a.totalAlloc);

  const maxClusterPct = clusters.length > 0 ? clusters[0].totalAlloc : 0;

  let verdict: string;
  if (maxClusterPct >= 60) {
    verdict = `CRITICAL: "${clusters[0].narrative}" narrative accounts for ${maxClusterPct}% of portfolio. If this narrative breaks, the whole desk bleeds.`;
  } else if (maxClusterPct >= 40) {
    verdict = `HIGH: "${clusters[0].narrative}" at ${maxClusterPct}%. Significant narrative concentration.`;
  } else if (maxClusterPct >= 25) {
    verdict = `MODERATE: Largest narrative ("${clusters[0].narrative}") at ${maxClusterPct}%. Some concentration but manageable.`;
  } else {
    verdict = `LOW: No single narrative exceeds 25%. Good narrative diversification.`;
  }

  return { clusters, maxClusterPct, verdict };
}

function calculateOverallRisk(
  directional: FactorOutput["directional"],
  sectorHHI: number,
  btcBeta: FactorOutput["btcBeta"],
  narrativeRisk: FactorOutput["narrativeRisk"],
  regime: string
): FactorOutput["overallRisk"] {
  // Weighted risk score
  const directionalRisk = directional.crowdingScore; // 0-100
  const sectorRisk = Math.min(100, (sectorHHI / 100)); // 0-100
  const betaRisk = btcBeta.btcExposurePct; // 0-100
  const narrativeRiskScore = narrativeRisk.maxClusterPct; // 0-100

  // Regime multiplier: directional risk matters more in trends
  const regimeMultiplier =
    regime === "TRENDING_DOWN" ? 1.3 :
    regime === "TRENDING_UP" ? 0.8 :
    regime === "VOLATILE" ? 1.2 :
    1.0; // CHOPPY

  const rawScore =
    directionalRisk * 0.35 +
    sectorRisk * 0.20 +
    betaRisk * 0.25 +
    narrativeRiskScore * 0.20;

  const score = Math.min(100, Math.round(rawScore * regimeMultiplier));

  const grade: FactorOutput["overallRisk"]["grade"] =
    score >= 80 ? "CRITICAL" :
    score >= 60 ? "HIGH" :
    score >= 35 ? "MODERATE" :
    "LOW";

  // Top contributing factors
  const factorScores = [
    { name: `Directional crowding (${directional.longPct}% long)`, score: directionalRisk * 0.35 },
    { name: `BTC beta exposure (${btcBeta.btcExposurePct}% high-beta)`, score: betaRisk * 0.25 },
    { name: `Sector concentration (HHI ${sectorHHI})`, score: sectorRisk * 0.20 },
    { name: `Narrative clustering ("${narrativeRisk.clusters[0]?.narrative || "N/A"}" at ${narrativeRisk.maxClusterPct}%)`, score: narrativeRiskScore * 0.20 },
  ].sort((a, b) => b.score - a.score);

  const factors = factorScores.slice(0, 3).map((f) => f.name);

  let recommendation: string;
  if (score >= 80) {
    recommendation = "REDUCE EXPOSURE. Portfolio is a concentrated directional bet. Consider: (1) halving position sizes, (2) adding explicit BTC/ETH shorts as hedges, (3) waiting for regime shift before adding new longs.";
  } else if (score >= 60) {
    recommendation = "CAUTION. Regime-aware stops are essential. Do not add new positions in concentrated sectors. Sentry hard gate is the primary defense.";
  } else if (score >= 35) {
    recommendation = "ACCEPTABLE. Current risk controls (regime params, Sentry gate, Kelly sizing) are adequate. Monitor for crowding increases.";
  } else {
    recommendation = "HEALTHY. Portfolio is well-diversified. Continue normal operations.";
  }

  return { score, grade, factors, recommendation };
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function runFactorModel(): Promise<FactorOutput> {
  // Taylor: Wire these to read from actual files
  // For now, using the structure the cron should populate

  const ledgerPath = path.join(__dirname, "..", "paper-ledger.json");
  const statePath = path.join(__dirname, "..", "desk-state.json");

  let signals: Signal[] = [];
  let regime = "TRENDING_DOWN"; // default fallback

  // Read active signals from paper ledger
  try {
    if (fs.existsSync(ledgerPath)) {
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
      // Taylor: adjust parsing based on actual ledger structure
      // Expected: array of signal objects with coin, direction, tier, allocation, etc.
      if (Array.isArray(ledger)) {
        signals = ledger.filter((s: any) => !s.expired && !s.closed);
      } else if (ledger.signals) {
        signals = ledger.signals.filter((s: any) => !s.expired && !s.closed);
      }
    }
  } catch (e) {
    console.error("Failed to read paper-ledger.json:", e);
  }

  // Read current regime from desk state
  try {
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      regime = state.regime?.label || state.regime || regime;
    }
  } catch (e) {
    console.error("Failed to read desk-state.json:", e);
  }

  // If no signals found, use sample data for testing
  if (signals.length === 0) {
    console.log("No signals in ledger — using sample data for testing");
    signals = [
      { coin: "UMA", direction: "LONG", tier: "HIGH", tool: "rei", fundingAPR: -223, priceChange24h: 2.1, allocation: 10.2, timestamp: new Date().toISOString() },
      { coin: "BERA", direction: "LONG", tier: "HIGH", tool: "rei", fundingAPR: -177, priceChange24h: 3.7, allocation: 10.2, timestamp: new Date().toISOString() },
      { coin: "AXS", direction: "LONG", tier: "HIGH", tool: "rei", fundingAPR: -146, priceChange24h: -3.9, allocation: 10.2, timestamp: new Date().toISOString() },
      { coin: "CELO", direction: "LONG", tier: "MEDIUM", tool: "rei", fundingAPR: -89, priceChange24h: -1.2, allocation: 5.1, timestamp: new Date().toISOString() },
      { coin: "MON", direction: "LONG", tier: "MEDIUM", tool: "rei", fundingAPR: -76, priceChange24h: -2.8, allocation: 5.1, timestamp: new Date().toISOString() },
      { coin: "ZORA", direction: "LONG", tier: "MEDIUM", tool: "rei", fundingAPR: -171, priceChange24h: -4.2, allocation: 5.1, timestamp: new Date().toISOString() },
      { coin: "GOAT", direction: "LONG", tier: "HIGH", tool: "rei", fundingAPR: -419, priceChange24h: -5.3, allocation: 8.2, timestamp: new Date().toISOString() },
      { coin: "GAS", direction: "LONG", tier: "HIGH", tool: "rei", fundingAPR: -253, priceChange24h: -6.1, allocation: 8.2, timestamp: new Date().toISOString() },
      { coin: "SOL", direction: "SHORT", tier: "LOW", tool: "pixel", priceChange24h: -5.1, allocation: 4.0, timestamp: new Date().toISOString() },
      { coin: "ETH", direction: "SHORT", tier: "LOW", tool: "pixel", priceChange24h: -5.2, allocation: 4.0, timestamp: new Date().toISOString() },
      { coin: "AZTEC", direction: "SHORT", tier: "MEDIUM", tool: "sentry", priceChange24h: -8.1, allocation: 6.0, timestamp: new Date().toISOString() },
      { coin: "OP", direction: "LONG", tier: "LOW", tool: "temporal-edge", priceChange24h: -4.8, allocation: 3.0, timestamp: new Date().toISOString() },
      { coin: "STABLE", direction: "LONG", tier: "MEDIUM", tool: "rei", fundingAPR: -167, priceChange24h: -3.1, allocation: 5.1, timestamp: new Date().toISOString() },
    ];
  }

  // Run all analyses
  const directional = analyzeDirectional(signals);
  const { sectors, sectorHHI, sectorVerdict } = analyzeSectors(signals);
  const btcBeta = analyzeBTCBeta(signals);
  const narrativeRisk = analyzeNarrativeRisk(signals);
  const overallRisk = calculateOverallRisk(directional, sectorHHI, btcBeta, narrativeRisk, regime);

  const output: FactorOutput = {
    timestamp: new Date().toISOString(),
    regime,
    directional,
    sectors,
    sectorHHI,
    sectorVerdict,
    btcBeta,
    narrativeRisk,
    overallRisk,
  };

  // Write output
  const outputPath = path.join(__dirname, "..", "factor-model-output.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Factor model output written to ${outputPath}`);

  return output;
}

// ============================================================
// FORMAT FOR EMAIL
// ============================================================

function formatForEmail(output: FactorOutput): string {
  const { overallRisk, directional, sectors, btcBeta, narrativeRisk } = output;

  const sectorList = sectors
    .slice(0, 5)
    .map((s) => `  ${s.name}: ${s.allocPct}% (${s.coins.join(", ")})`)
    .join("\n");

  const narrativeList = narrativeRisk.clusters
    .slice(0, 4)
    .map((c) => `  "${c.narrative}": ${c.totalAlloc}% (${c.coins.join(", ")})`)
    .join("\n");

  return `--- JINX FACTOR MODEL ---
REGIME: ${output.regime}
OVERALL RISK: ${overallRisk.score}/100 — ${overallRisk.grade}

TOP RISK FACTORS:
${overallRisk.factors.map((f) => `  * ${f}`).join("\n")}

RECOMMENDATION: ${overallRisk.recommendation}

--- DIRECTIONAL ---
${directional.longCount} longs / ${directional.shortCount} shorts (${directional.longPct}% long)
Allocation-weighted: ${directional.longAllocPct}% long
${directional.verdict}

--- SECTOR CONCENTRATION (HHI: ${output.sectorHHI}) ---
${sectorList}
${output.sectorVerdict}

--- BTC BETA ---
High-beta (${btcBeta.btcExposurePct}%): ${btcBeta.highBetaCoins.join(", ") || "none"}
Low-beta: ${btcBeta.lowBetaCoins.join(", ") || "none"}
${btcBeta.verdict}

--- NARRATIVE CLUSTERS ---
${narrativeList}
${narrativeRisk.verdict}`;
}

// ============================================================
// ENTRY POINT
// ============================================================

async function main() {
  console.log("🔍 Jinx Factor Model — Starting analysis...");
  const output = await runFactorModel();
  const emailBody = formatForEmail(output);
  console.log("\n" + emailBody);

  // Taylor: integrate this into the cron email cycle
  // The emailBody string should be appended to the scan results email
}

main().catch(console.error);

export { runFactorModel, formatForEmail, SECTOR_MAP, SECTOR_NAMES };
export type { FactorOutput, Signal };
