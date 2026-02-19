// Signal Scanner - Monitors DexScreener & GeckoTerminal for opportunities
import fetch from 'node-fetch';
import config from './config.js';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';
const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';

// Track seen tokens to avoid duplicates
const seenTokens = new Set();
const volumeHistory = new Map(); // token -> previous volume for spike detection

/**
 * Fetch new Solana pairs from DexScreener
 */
export async function scanDexScreenerNew() {
  try {
    const res = await fetch(`${DEXSCREENER_API}/search?q=solana`);
    const data = await res.json();
    
    if (!data.pairs) return [];
    
    // Filter for Solana pairs
    const solanaPairs = data.pairs.filter(p => 
      p.chainId === 'solana' &&
      p.dexId === 'raydium' || p.dexId === 'orca'
    );
    
    return solanaPairs;
  } catch (err) {
    console.error('[Scanner] DexScreener error:', err.message);
    return [];
  }
}

/**
 * Fetch trending tokens from DexScreener
 */
export async function scanDexScreenerTrending() {
  try {
    const res = await fetch(`${DEXSCREENER_API}/tokens/trending`);
    const data = await res.json();
    
    if (!data.tokens) return [];
    
    // Filter Solana tokens
    return data.tokens.filter(t => t.chainId === 'solana');
  } catch (err) {
    console.error('[Scanner] DexScreener trending error:', err.message);
    return [];
  }
}

/**
 * Fetch new pools from GeckoTerminal
 */
export async function scanGeckoTerminalNew() {
  try {
    const res = await fetch(
      `${GECKOTERMINAL_API}/networks/solana/new_pools?page=1`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await res.json();
    
    if (!data.data) return [];
    
    return data.data.map(pool => ({
      address: pool.attributes?.address,
      name: pool.attributes?.name,
      baseToken: pool.relationships?.base_token?.data?.id,
      quoteToken: pool.relationships?.quote_token?.data?.id,
      priceUsd: parseFloat(pool.attributes?.base_token_price_usd || 0),
      volume24h: parseFloat(pool.attributes?.volume_usd?.h24 || 0),
      liquidity: parseFloat(pool.attributes?.reserve_in_usd || 0),
      createdAt: pool.attributes?.pool_created_at,
    }));
  } catch (err) {
    console.error('[Scanner] GeckoTerminal error:', err.message);
    return [];
  }
}

/**
 * Fetch trending pools from GeckoTerminal
 */
export async function scanGeckoTerminalTrending() {
  try {
    const res = await fetch(
      `${GECKOTERMINAL_API}/networks/solana/trending_pools`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await res.json();
    
    if (!data.data) return [];
    
    return data.data.map(pool => ({
      address: pool.attributes?.address,
      name: pool.attributes?.name,
      priceUsd: parseFloat(pool.attributes?.base_token_price_usd || 0),
      priceChange24h: parseFloat(pool.attributes?.price_change_percentage?.h24 || 0),
      volume24h: parseFloat(pool.attributes?.volume_usd?.h24 || 0),
      liquidity: parseFloat(pool.attributes?.reserve_in_usd || 0),
    }));
  } catch (err) {
    console.error('[Scanner] GeckoTerminal trending error:', err.message);
    return [];
  }
}

/**
 * Detect volume spikes
 */
export function detectVolumeSpike(token, currentVolume) {
  const previousVolume = volumeHistory.get(token.address);
  volumeHistory.set(token.address, currentVolume);
  
  if (!previousVolume) return false;
  
  const spikeRatio = currentVolume / previousVolume;
  return spikeRatio >= config.scanner.volumeSpikeMultiplier;
}

/**
 * Check if token name matches blacklist patterns
 */
function isBlacklisted(tokenName) {
  if (!config.blacklist?.enabled) return false;
  
  for (const pattern of config.blacklist.patterns) {
    if (pattern.test(tokenName)) {
      return true;
    }
  }
  return false;
}

/**
 * Basic signal filter
 */
export function passesBasicFilters(token) {
  const { scanner, filters } = config;
  
  // Blacklist check
  if (isBlacklisted(token.name)) {
    return { pass: false, reason: `🚫 Blacklisted: ${token.name}` };
  }
  
  // Liquidity check
  if (token.liquidity < scanner.minLiquidityUsd) {
    return { pass: false, reason: `Low liquidity: $${token.liquidity.toLocaleString()} (min: $${scanner.minLiquidityUsd.toLocaleString()})` };
  }
  
  // Volume check
  if (token.volume24h < scanner.minVolumeUsd) {
    return { pass: false, reason: `Low volume: $${token.volume24h.toLocaleString()} (min: $${scanner.minVolumeUsd.toLocaleString()})` };
  }
  
  // Age check - not too old
  if (token.createdAt) {
    const ageMinutes = (Date.now() - new Date(token.createdAt).getTime()) / 60000;
    if (ageMinutes > scanner.maxAgeMinutes) {
      return { pass: false, reason: `Too old: ${ageMinutes.toFixed(0)} min (max: ${scanner.maxAgeMinutes})` };
    }
    // Age check - not too new (honeypot protection)
    if (filters.minTokenAgeMinutes && ageMinutes < filters.minTokenAgeMinutes) {
      return { pass: false, reason: `Too new: ${ageMinutes.toFixed(0)} min (min: ${filters.minTokenAgeMinutes})` };
    }
  }
  
  return { pass: true, reason: 'Passed basic filters' };
}

/**
 * Main scan function - returns potential signals
 */
export async function scan() {
  console.log('[Scanner] Running scan cycle...');
  const signals = [];
  
  // Scan multiple sources
  const [geckoNew, geckoTrending] = await Promise.all([
    scanGeckoTerminalNew(),
    scanGeckoTerminalTrending(),
  ]);
  
  const allTokens = [...geckoNew, ...geckoTrending];
  
  for (const token of allTokens) {
    if (!token.address) continue;
    
    // Skip if already seen recently
    if (seenTokens.has(token.address)) continue;
    
    // Apply basic filters
    const filterResult = passesBasicFilters(token);
    if (!filterResult.pass) continue;
    
    // Check for volume spike
    const hasVolumeSpike = detectVolumeSpike(token, token.volume24h);
    
    // Generate signal
    const signal = {
      timestamp: new Date().toISOString(),
      token: token.address,
      name: token.name,
      price: token.priceUsd,
      volume24h: token.volume24h,
      liquidity: token.liquidity,
      priceChange24h: token.priceChange24h || 0,
      volumeSpike: hasVolumeSpike,
      signalStrength: calculateSignalStrength(token, hasVolumeSpike),
    };
    
    if (signal.signalStrength >= 0.5) {
      signals.push(signal);
      seenTokens.add(token.address);
      console.log(`[Scanner] Signal detected: ${token.name} (strength: ${signal.signalStrength})`);
    }
  }
  
  // Cleanup old seen tokens (keep last 1000)
  if (seenTokens.size > 1000) {
    const arr = Array.from(seenTokens);
    arr.slice(0, arr.length - 1000).forEach(t => seenTokens.delete(t));
  }
  
  return signals;
}

/**
 * Calculate signal strength (0-1)
 */
function calculateSignalStrength(token, hasVolumeSpike) {
  let strength = 0;
  
  // Volume spike is a strong signal
  if (hasVolumeSpike) strength += 0.3;
  
  // High liquidity relative to volume
  const liquidityRatio = token.liquidity / (token.volume24h || 1);
  if (liquidityRatio > 0.5 && liquidityRatio < 5) strength += 0.2;
  
  // Positive price momentum
  if (token.priceChange24h > 10) strength += 0.2;
  if (token.priceChange24h > 50) strength += 0.1;
  
  // Good volume
  if (token.volume24h > 50000) strength += 0.2;
  
  return Math.min(strength, 1);
}

// Run standalone
if (process.argv[1].endsWith('scanner.js')) {
  console.log('[Scanner] Starting standalone scan...');
  const signals = await scan();
  console.log(`[Scanner] Found ${signals.length} signals:`, signals);
}

export default { scan, scanGeckoTerminalNew, scanGeckoTerminalTrending };
