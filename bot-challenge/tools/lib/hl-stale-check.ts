/**
 * HL Stale Data Check — shared utility for all HyperLiquid-dependent tools
 *
 * Root cause analysis (2026-03-01):
 * - 1.25e-05/hour is HL's REAL minimum floor rate for low-activity perps
 * - Annualised: 1.25e-05 * 24 * 365 * 100 = 10.95% APR
 * - 100+ coins showing 10.95% APR is NORMAL — they're on the floor, not stale
 *
 * Only flag stale if there's a genuine API failure:
 * - >80% of all coins share the EXACT same rate (API returned constant/garbage)
 * - A major coin (BTC/ETH/SOL) shows 0.00% when it historically never does
 */

export interface StaleCheckResult {
  isStale: boolean;
  reason: string | null;
  staleCoins: string[];
}

// High-volume coins that should NEVER have 0% funding
const HIGH_VOLUME_COINS = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'AVAX']);

/**
 * Check if HL funding rate data appears stale/default.
 *
 * @param rates - Map of coin → annualized funding rate % (already annualised by caller)
 * @param activeCoins - Optional filter: only check these coins
 */
export function checkHLStale(
  rates: Record<string, number>,
  activeCoins?: string[]
): StaleCheckResult {
  const entries = Object.entries(rates)
    .filter(([coin]) => !activeCoins || activeCoins.length === 0 || activeCoins.includes(coin))
    .map(([coin, rate]) => ({ coin, rate: parseFloat(rate.toFixed(6)) }));

  if (entries.length === 0) {
    return { isStale: false, reason: null, staleCoins: [] };
  }

  // Check 1: >80% of coins share an IDENTICAL non-zero rate → API returned garbage
  const rateCounts = new Map<number, string[]>();
  for (const { coin, rate } of entries) {
    const existing = rateCounts.get(rate) || [];
    existing.push(coin);
    rateCounts.set(rate, existing);
  }

  for (const [rate, coins] of rateCounts) {
    const pct = coins.length / entries.length;
    if (rate !== 0 && pct > 0.80 && coins.length >= 10) {
      return {
        isStale: true,
        reason: `API failure: ${coins.length}/${entries.length} coins (${(pct * 100).toFixed(0)}%) share identical rate ${rate.toFixed(4)}%`,
        staleCoins: coins,
      };
    }
  }

  // Check 2: Major high-volume coin shows exactly 0% (should never happen)
  const zeroMajors = entries
    .filter(({ coin, rate }) => HIGH_VOLUME_COINS.has(coin) && rate === 0);

  if (zeroMajors.length >= 2) {
    return {
      isStale: true,
      reason: `Major coins showing 0% funding (API likely down): ${zeroMajors.map(e => e.coin).join(', ')}`,
      staleCoins: zeroMajors.map(e => e.coin),
    };
  }

  return { isStale: false, reason: null, staleCoins: [] };
}
