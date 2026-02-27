/**
 * HL Stale Data Check — shared utility for all HyperLiquid-dependent tools
 * 
 * Oracle directive 2026-02-27: all tools pulling HL funding data must check
 * for stale/default rates before processing.
 * 
 * Two detection methods:
 * 1. If 3+ coins share identical funding rates → stale
 * 2. If any coin matches a known default rate (±10.95%) → stale
 */

// Known default/stale HL funding rates (annualized %)
const KNOWN_STALE_RATES = [10.95, -10.95];
const STALE_TOLERANCE = 0.01; // match within 0.01%

export interface StaleCheckResult {
  isStale: boolean;
  reason: string | null;
  staleCoins: string[];
}

/**
 * Check if HL funding rate data appears stale/default.
 * 
 * @param rates - Map of coin → annualized funding rate %
 * @param activeCoins - Optional filter: only check these coins. If empty, checks all.
 * @returns StaleCheckResult with details
 */
export function checkHLStale(
  rates: Record<string, number>,
  activeCoins?: string[]
): StaleCheckResult {
  const entries = Object.entries(rates)
    .filter(([coin]) => !activeCoins || activeCoins.length === 0 || activeCoins.includes(coin))
    .map(([coin, rate]) => ({ coin, rate: +rate.toFixed(4) }));

  if (entries.length === 0) {
    return { isStale: false, reason: null, staleCoins: [] };
  }

  // Check 1: 3+ coins with identical rates
  const rateCounts = new Map<number, string[]>();
  for (const { coin, rate } of entries) {
    const existing = rateCounts.get(rate) || [];
    existing.push(coin);
    rateCounts.set(rate, existing);
  }

  for (const [rate, coins] of rateCounts) {
    if (coins.length >= 3) {
      return {
        isStale: true,
        reason: `${coins.length} coins share identical HL rate ${rate}%: ${coins.join(', ')}`,
        staleCoins: coins,
      };
    }
  }

  // Check 2: any coin matches known default rate
  const defaultMatches: string[] = [];
  for (const { coin, rate } of entries) {
    if (KNOWN_STALE_RATES.some(sr => Math.abs(rate - sr) < STALE_TOLERANCE)) {
      defaultMatches.push(coin);
    }
  }

  if (defaultMatches.length > 0) {
    return {
      isStale: true,
      reason: `Known default rate detected on: ${defaultMatches.join(', ')}`,
      staleCoins: defaultMatches,
    };
  }

  return { isStale: false, reason: null, staleCoins: [] };
}
