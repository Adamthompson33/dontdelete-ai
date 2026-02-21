# Rei's Funding Rate Carry Tool — Build Spec

## What it does
Scans HyperLiquid perpetual funding rates, flags extreme funding as mean-reversion trade signals, logs everything with timestamps for paper P&L tracking.

## Logic
1. Pull all perp funding rates from HyperLiquid API (`https://api.hyperliquid.xyz/info`)
2. Annualise: `hourlyRate * 24 * 365 * 100`
3. Flag any coin where `|annualizedRate| > 100%`
4. For each flagged coin, output a signal:
   - `coin` — ticker
   - `direction` — SHORT if funding positive (longs paying shorts), LONG if negative
   - `annualizedRate` — the rate that triggered
   - `confidence` — HIGH if >200%, MEDIUM if 100-200%
   - `entryPrice` — current mark price at signal time
   - `invalidation` — if funding flips sign, signal invalid
   - `timestamp` — ISO 8601, exact moment signal fires

## Crash Filters (from Rei's existing scanner)
- Skip if 24h price move > 20% (volatile, not a carry trade)
- Skip if annualised rate > 500% (distressed token, not tradeable)
- Skip if coin has < $100K 24h volume (illiquid)

## Output: paper-ledger.json
```json
{
  "signals": [
    {
      "id": "rei-funding-001",
      "tool": "rei-funding-carry",
      "coin": "INJ",
      "direction": "SHORT",
      "annualizedRate": 142.5,
      "confidence": "MEDIUM",
      "entryPrice": 22.45,
      "invalidation": "funding flips negative",
      "timestamp": "2026-02-21T04:50:00.000Z",
      "outcome1h": null,
      "outcome4h": null,
      "outcome24h": null,
      "pnlPercent": null,
      "status": "OPEN"
    }
  ]
}
```

## Outcome Tracker (Oracle's addition — critical)
A second script that runs hourly:
1. Read paper-ledger.json
2. Find signals with status "OPEN" and missing outcome prices
3. Fetch current price for each coin
4. Fill in `outcome1h` (if signal is 1h+ old), `outcome4h`, `outcome24h`
5. Calculate `pnlPercent` based on direction and price change
6. Set status to "CLOSED" after 24h outcome is recorded

This turns the ledger from a signal log into a P&L tracker.

## Files to create
```
bot-challenge/
  tools/
    rei-funding-carry.ts    ← signal scanner
    outcome-tracker.ts      ← hourly P&L checker
  paper-ledger.json         ← signal + outcome log
  package.json              ← dependencies (axios, node-cron)
  tsconfig.json
```

## HyperLiquid API calls needed

### Get all funding rates
```
POST https://api.hyperliquid.xyz/info
Body: { "type": "metaAndAssetCtxs" }
```
Response includes `funding` (hourly rate) and `markPx` for every perp.

### Get 24h price change (for crash filter)
Already in the `metaAndAssetCtxs` response — `dayNtlVlm` for volume, calculate price change from `prevDayPx` vs `markPx`.

## No auth required
HyperLiquid info API is public. No API key, no geo-block.

## Run modes
- Manual: `npx ts-node tools/rei-funding-carry.ts`
- Scheduled: cron job every 4 hours for scanner, every 1 hour for outcome tracker

---

*Build this first. If it works, the other 11 tools follow the same pattern: scan → signal → log → track outcome.*

## Future: CCXT for Cross-Exchange Tools
When building Atlas's cross-exchange spread detector (Tool #8+), use CCXT instead of writing individual API wrappers:
```
npm install ccxt
```
One unified interface for 100+ exchanges (Binance, Kraken, Independent Reserve, HyperLiquid). Pulls order books, tickers, and trades through the same API. Saves weeks of wrapper code for the later Bot Challenge tools.

Not needed for the current HyperLiquid-only tools — add when cross-exchange arbitrage comes online.
