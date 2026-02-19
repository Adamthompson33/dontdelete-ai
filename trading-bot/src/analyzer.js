// Token Analyzer - Deep analysis of potential trades
import fetch from 'node-fetch';
import config from './config.js';
import { analyzeSentiment } from './sentiment.js';

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`;

/**
 * Fetch token metadata from Helius
 */
export async function getTokenMetadata(mintAddress) {
  try {
    const res = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAsset',
        params: { id: mintAddress }
      })
    });
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error('[Analyzer] Metadata error:', err.message);
    return null;
  }
}

/**
 * Get token holder distribution
 */
export async function getHolderDistribution(mintAddress) {
  try {
    const res = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenLargestAccounts',
        params: [mintAddress]
      })
    });
    const data = await res.json();
    
    if (!data.result?.value) return null;
    
    const holders = data.result.value;
    const totalSupply = holders.reduce((sum, h) => sum + parseFloat(h.amount), 0);
    
    // Calculate concentration
    const topHolder = holders[0] ? (parseFloat(holders[0].amount) / totalSupply) * 100 : 0;
    const top5 = holders.slice(0, 5).reduce((sum, h) => sum + parseFloat(h.amount), 0);
    const top5Percent = (top5 / totalSupply) * 100;
    const top10 = holders.slice(0, 10).reduce((sum, h) => sum + parseFloat(h.amount), 0);
    const top10Percent = (top10 / totalSupply) * 100;
    
    return {
      holderCount: holders.length,
      topHolderPercent: topHolder,
      top5Percent,
      top10Percent,
      isConcentrated: topHolder > config.filters.maxTopHolderPercent,
    };
  } catch (err) {
    console.error('[Analyzer] Holder distribution error:', err.message);
    return null;
  }
}

/**
 * Check token mint authority (rug risk)
 */
export async function checkMintAuthority(mintAddress) {
  try {
    const res = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [mintAddress, { encoding: 'jsonParsed' }]
      })
    });
    const data = await res.json();
    
    const mintInfo = data.result?.value?.data?.parsed?.info;
    if (!mintInfo) return { hasMintAuthority: false, hasFreezeAuthority: false };
    
    return {
      hasMintAuthority: !!mintInfo.mintAuthority,
      hasFreezeAuthority: !!mintInfo.freezeAuthority,
      decimals: mintInfo.decimals,
      supply: mintInfo.supply,
    };
  } catch (err) {
    console.error('[Analyzer] Mint authority error:', err.message);
    return null;
  }
}

/**
 * Calculate rug risk score (0-100, lower is safer)
 */
export function calculateRugScore(analysis) {
  let score = 0;
  
  // Holder concentration (stricter scoring)
  if (analysis.holders?.topHolderPercent > 50) score += 45;
  else if (analysis.holders?.topHolderPercent > 30) score += 30;
  else if (analysis.holders?.topHolderPercent > 20) score += 20;
  else if (analysis.holders?.topHolderPercent > 15) score += 10;
  
  // Top 5 concentration
  if (analysis.holders?.top5Percent > 70) score += 25;
  else if (analysis.holders?.top5Percent > 50) score += 15;
  else if (analysis.holders?.top5Percent > 40) score += 5;
  
  // Top 10 concentration
  if (analysis.holders?.top10Percent > 80) score += 15;
  
  // Mint/freeze authority (dangerous!)
  if (analysis.authority?.hasMintAuthority) score += 30;
  if (analysis.authority?.hasFreezeAuthority) score += 20;
  
  // Low holder count
  if (analysis.holders?.holderCount < 50) score += 25;
  else if (analysis.holders?.holderCount < 100) score += 15;
  else if (analysis.holders?.holderCount < 200) score += 5;
  
  // Sentiment penalties
  if (analysis.sentiment?.botActivity === 'high') score += 20;
  else if (analysis.sentiment?.botActivity === 'medium') score += 10;
  
  if (analysis.sentiment && !analysis.sentiment.organic) score += 10;
  
  return Math.min(score, 100);
}

/**
 * Full token analysis
 */
export async function analyzeToken(signal) {
  console.log(`[Analyzer] Analyzing ${signal.name} (${signal.token})...`);
  
  // Extract symbol from name (e.g., "renta / SOL" -> "renta")
  const symbol = signal.name?.split('/')[0]?.trim() || 'UNKNOWN';
  
  const [metadata, holders, authority, sentiment] = await Promise.all([
    getTokenMetadata(signal.token),
    getHolderDistribution(signal.token),
    checkMintAuthority(signal.token),
    analyzeSentiment(symbol, signal.name),
  ]);
  
  const analysis = {
    signal,
    metadata,
    holders,
    authority,
    sentiment,
    timestamp: new Date().toISOString(),
  };
  
  // Calculate rug score
  analysis.rugScore = calculateRugScore(analysis);
  
  // Trading recommendation (now includes sentiment)
  analysis.recommendation = generateRecommendation(analysis);
  
  console.log(`[Analyzer] ${signal.name}: Rug score ${analysis.rugScore}, Sentiment: ${sentiment?.sentimentScore || 'N/A'}/10, Rec: ${analysis.recommendation.action}`);
  
  return analysis;
}

/**
 * Generate trading recommendation
 */
function generateRecommendation(analysis) {
  const { signal, holders, authority, rugScore, sentiment } = analysis;
  const { filters, sentiment: sentimentConfig } = config;
  
  // === HARD REJECTIONS ===
  
  // Rug score too high
  if (rugScore > 60) {
    return { action: 'REJECT', reason: `🚫 High rug risk (score: ${rugScore})`, confidence: 0.9 };
  }
  
  // Mint authority enabled
  if (authority?.hasMintAuthority && filters.maxMintAuthority === false) {
    return { action: 'REJECT', reason: '🚫 Mint authority enabled (can print tokens)', confidence: 0.85 };
  }
  
  // Freeze authority enabled
  if (authority?.hasFreezeAuthority) {
    return { action: 'REJECT', reason: '🚫 Freeze authority enabled (can freeze your tokens)', confidence: 0.85 };
  }
  
  // Top holder concentration
  if (holders?.topHolderPercent > filters.maxTopHolderPercent) {
    return { action: 'REJECT', reason: `🚫 Top holder owns ${holders.topHolderPercent.toFixed(1)}% (max: ${filters.maxTopHolderPercent}%)`, confidence: 0.8 };
  }
  
  // Top 5 holder concentration
  if (filters.maxTop5HolderPercent && holders?.top5Percent > filters.maxTop5HolderPercent) {
    return { action: 'REJECT', reason: `🚫 Top 5 holders own ${holders.top5Percent.toFixed(1)}% (max: ${filters.maxTop5HolderPercent}%)`, confidence: 0.8 };
  }
  
  // Not enough holders
  if (holders?.holderCount < filters.minHolderCount) {
    return { action: 'REJECT', reason: `🚫 Only ${holders.holderCount} holders (min: ${filters.minHolderCount})`, confidence: 0.75 };
  }
  
  // === SENTIMENT CHECKS (REQUIRED) ===
  
  // Require sentiment data
  if (sentimentConfig.required && !sentiment) {
    return { action: 'REJECT', reason: '🚫 No sentiment data available', confidence: 0.7 };
  }
  
  // High bot activity
  if (sentimentConfig.rejectBotActivity && sentiment?.botActivity === 'high') {
    return { action: 'REJECT', reason: '🚫 High bot activity detected on X', confidence: 0.85 };
  }
  
  // Require organic movement
  if (sentimentConfig.requireOrganic && sentiment && !sentiment.organic) {
    return { action: 'REJECT', reason: '🚫 Not organic community movement', confidence: 0.75 };
  }
  
  // Sentiment score too low
  if (sentiment && sentiment.sentimentScore < sentimentConfig.minScoreForTrade) {
    return { action: 'REJECT', reason: `🚫 Sentiment too low: ${sentiment.sentimentScore}/10 (min: ${sentimentConfig.minScoreForTrade})`, confidence: 0.7 };
  }
  
  // === CALCULATE CONFIDENCE ===
  
  let confidence = signal.signalStrength;
  
  // Holder bonuses
  if (rugScore < 20) confidence += 0.15;
  else if (rugScore < 40) confidence += 0.05;
  
  if (holders?.holderCount > 500) confidence += 0.1;
  else if (holders?.holderCount > 200) confidence += 0.05;
  
  if (signal.volumeSpike) confidence += 0.1;
  
  // Sentiment bonuses
  if (sentiment) {
    if (sentiment.sentimentScore >= 8) confidence += 0.2;
    else if (sentiment.sentimentScore >= 7) confidence += 0.1;
    
    if (sentiment.organic) confidence += 0.1;
    if (sentiment.influencerMentions) confidence += 0.15;
  }
  
  confidence = Math.min(Math.max(confidence, 0), 1);
  
  // Position sizing based on confidence
  let positionSol = config.risk.maxPositionSol * confidence;
  positionSol = Math.round(positionSol * 1000) / 1000;
  
  // === FINAL DECISION ===
  
  if (confidence >= 0.75) {
    return { action: 'BUY', reason: '✅ Strong signal + organic sentiment', confidence, positionSol };
  } else if (confidence >= 0.6) {
    return { action: 'BUY', reason: '✅ Good signal, moderate confidence', confidence, positionSol };
  } else {
    return { action: 'WATCH', reason: '👀 Signal not strong enough', confidence };
  }
}

export default { analyzeToken, getHolderDistribution, checkMintAuthority };
