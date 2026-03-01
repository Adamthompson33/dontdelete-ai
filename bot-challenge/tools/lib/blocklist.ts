/**
 * Shared coin blocklist — permanent blocks and extended cooldowns.
 * All signal-generating tools should check this before logging signals.
 * 
 * Managed by: Taylor / Jackbot
 * Last updated: 2026-02-28
 */

// Permanently blocked — broken signals, never generate entries for these
export const PERMANENT_BLOCK = new Set([
  'AZTEC',  // 30+ entries all red, structural loser (blocked 2026-02-28)
  'OM',     // 90%+ crash, likely rug pull (blocked earlier)
]);

// Extended cooldown — minimum days before re-entry
export const EXTENDED_COOLDOWN: Record<string, { until: string; reason: string }> = {
  'INJ': { until: '2026-03-07', reason: 'Consistent loser, perpetual bleed. 7-day cooldown (set 2026-02-28)' },
  'SNX': { until: '2026-03-07', reason: 'Liquidation magnet, -23.95% worst. 7-day cooldown (set 2026-02-28)' },
};

/**
 * Check if a coin is blocked from signal generation.
 * Returns { blocked: true, reason: string } or { blocked: false }
 */
export function isBlocked(coin: string): { blocked: boolean; reason?: string } {
  const upper = coin.toUpperCase();
  
  if (PERMANENT_BLOCK.has(upper)) {
    return { blocked: true, reason: `PERMANENT BLOCK: ${upper}` };
  }
  
  const cooldown = EXTENDED_COOLDOWN[upper];
  if (cooldown && new Date() < new Date(cooldown.until)) {
    return { blocked: true, reason: `EXTENDED COOLDOWN until ${cooldown.until}: ${cooldown.reason}` };
  }
  
  return { blocked: false };
}
