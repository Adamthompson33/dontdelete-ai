# Signal Board Schema v1.0

**Date:** 2026-02-19
**Status:** CANONICAL — all agents must output signals in this format

## Signal Object

```json
{
  "signal_id": "uuid-v4",
  "timestamp": "2026-02-19T00:51:00Z",
  "agent": {
    "name": "Sakura",
    "role": "sentinel",
    "desk": "PRISM",
    "soul_version": "1.0.3",
    "trader_dna": "Jim Simons"
  },
  "market": {
    "platform": "polymarket|hyperliquid|clankerzone|dexscreener",
    "identifier": "contract_address_or_market_id",
    "asset": "ETH|BTC|ACADEMY|market_slug",
    "market_type": "spot|perp|binary|multi_outcome"
  },
  "signal": {
    "direction": "LONG|SHORT|FLAT|BUY_YES|BUY_NO|ARB",
    "confidence": 0.82,
    "thesis": "Funding rate dislocation on ETH perps — 8h rate at -0.03% while spot trending up. Mean reversion expected within 4-6 hours.",
    "edge_type": "funding_arb|complement_arb|flash_crash_reversion|momentum|mean_reversion|structural|latency_arb|volatility"
  },
  "position": {
    "kelly_fraction": 0.12,
    "suggested_size_pct": 6.0,
    "leverage": 1,
    "entry_price": 2650.00,
    "entry_condition": "Immediately at market"
  },
  "exit": {
    "target_price": 2720.00,
    "stop_price": 2610.00,
    "invalidation": "If 8h funding rate flips positive before entry, thesis is void.",
    "max_hold_hours": 24,
    "trailing_stop_pct": null
  },
  "outcome": {
    "status": "pending|open|closed_win|closed_loss|invalidated|expired",
    "exit_price": null,
    "exit_timestamp": null,
    "pnl_pct": null,
    "exit_reason": null
  },
  "data_sources": ["funding_rate_api", "spot_price_feed", "order_book_depth"],
  "arb_legs": {
    "leg_a": { "asset": "YES", "price": 0.42, "platform": "polymarket" },
    "leg_b": { "asset": "NO", "price": 0.55, "platform": "polymarket" },
    "spread": 0.03,
    "note": "Only present for ARB direction signals. Null for directional."
  },
  "meta": {
    "correlated_signals": [],
    "reviewed_by": [],
    "helena_override": false,
    "nse_fitness_weight": 1.0
  }
}
```

## Field Definitions

### agent
- **name**: Agent identity from soul.md
- **role**: architect|sentinel|scribe
- **desk**: PRISM|ECLIPSE
- **soul_version**: Semver of the agent's current soul.md (tracks evolution)
- **trader_dna**: The legendary trader whose framework drives this agent

### market
- **platform**: Where the trade executes
- **identifier**: Contract address, market ID, or slug — platform-specific
- **asset**: Human-readable asset name
- **market_type**: spot, perpetual, binary option, or multi-outcome prediction market

### signal
- **direction**: What to do. ARB = non-directional arbitrage (complement, funding, cross-exchange)
- **confidence**: 0.0-1.0. Feeds into Kelly sizing. Agent's self-assessed probability the thesis is correct.
- **thesis**: Plain English explanation. Must be specific enough that another agent can evaluate it.
- **edge_type**: Categorisation for pattern analysis and NSE fitness tracking

### position
- **kelly_fraction**: Raw Kelly output (confidence-based). Wren calculates this.
- **suggested_size_pct**: Half-Kelly or quarter-Kelly adjusted size as % of portfolio. Conservative by default.
- **leverage**: 1x = spot. >1x = leveraged. Capped per agent role.
- **entry_price**: Target entry or current market price
- **entry_condition**: "Immediately at market" or conditional ("If BTC breaks $100K with volume > 2x avg")

### exit
- **target_price**: Take profit level
- **stop_price**: Hard stop loss — non-negotiable, no discretion
- **invalidation**: Pre-registered condition that voids the thesis entirely. Position closes regardless of P&L.
- **max_hold_hours**: Time-based exit. If target not hit, close at market.
- **trailing_stop_pct**: Optional trailing stop as % from peak

### outcome (filled post-resolution)
- **status**: pending (not yet acted on), open (position live), closed_win/closed_loss (resolved), invalidated (thesis voided), expired (max_hold exceeded)
- **exit_price**: Actual exit price
- **exit_timestamp**: When position was closed
- **pnl_pct**: Realised P&L as percentage
- **exit_reason**: "target_hit|stop_hit|invalidated|expired|manual|helena_override"

### meta
- **correlated_signals**: Array of signal_ids that are related (e.g., Sakura's arb signal + Rei's funding signal on same asset)
- **reviewed_by**: Array of agent names that cross-checked this signal (peer review)
- **helena_override**: Did Helena modify or veto this signal?
- **nse_fitness_weight**: Multiplier for NSE scoring. Default 1.0. Helena can weight high-stakes signals higher.

## Fitness Scoring (for Natural Selection Engine)

```
agent_fitness = sum(signal_scores) / count(signals)

signal_score = (outcome == win ? +1 : -1) * confidence * nse_fitness_weight * pnl_magnitude_factor

Time decay (Oracle's addition):
decayed_score = signal_score * 0.95^(episodes_since_signal)
agent_fitness = sum(decayed_scores) / count(signals)

Adjustments:
- Invalidated signals: +0.5 if agent correctly identified invalidation before loss
- Expired signals: -0.25 (indecisive, wasted capital allocation)
- helena_override signals: excluded from agent's fitness (Helena's call, not theirs)
```

### Calibration Score (Oracle's addition)
Track per-agent calibration over rolling 50-signal window:

```
calibration_error = avg(abs(stated_confidence - actual_hit_rate_at_that_confidence_bucket))

Bucket confidence into 0.1 ranges: [0.0-0.1], [0.1-0.2], ..., [0.9-1.0]
For each bucket: actual_hit_rate = wins / total_signals_in_bucket
calibration_error for bucket = abs(bucket_midpoint - actual_hit_rate)
Overall calibration = 1 - mean(bucket_errors)  // 1.0 = perfect calibration
```

An agent with 0.95 calibration is more valuable than one with higher raw win rate but poor calibration.
Helena uses calibration score as a MULTIPLIER on fitness: `adjusted_fitness = fitness * calibration`

**Minimum sample size: 20 signals before calibration is calculated.** Below that, calibration = 1.0 (neutral).
Premature calibration scoring on small samples produces statistically meaningless results and could trigger false eliminations.

### Data Source Tracking
```
Track per-source signal quality over time:
- funding_rate_api: 65% hit rate across 40 signals
- spot_price_feed: 52% hit rate across 80 signals  
- social_sentiment: 41% hit rate across 20 signals
→ Inform which data sources to weight in future signal generation
```

### Fitness Tiers
- **Elite (>0.6)**: Agent's soul.md traits get cloned to replacements
- **Performing (0.2-0.6)**: Stable, continues operating
- **Underperforming (-0.2 to 0.2)**: Warning, soul.md reviewed for drift
- **Eliminated (<-0.2)**: Soul archived, replaced via Natural Selection Engine

## Signal Flow

```
1. Scanner agents (Sakura, Rei, Pixel, Phantom, Sentry) detect edge → emit signal
2. Analyst agents (Wren, Jinx, Viper, Atlas) review → add to reviewed_by, may adjust confidence
3. Wren calculates Kelly sizing → fills position fields
4. Jinx checks correlation with existing open signals → flags if correlated
5. Helena approves/vetoes/overrides → signal goes to Signal Board
6. Signal Board logs to persistent store (timestamped, immutable)
7. Outcome tracking fills outcome fields as market resolves
8. NSE evaluates fitness scores at episode boundaries
```

## x402 API Response Format

When external agents query the Signal Board via x402:

```json
{
  "desk_status": "active",
  "open_signals": 3,
  "signals": [
    { /* signal object without meta.nse_fitness_weight */ }
  ],
  "desk_performance": {
    "total_signals": 147,
    "win_rate": 0.68,
    "avg_pnl_pct": 2.3,
    "sharpe": 1.8,
    "period_days": 30,
    "last_updated": "2026-02-19T00:55:00Z",
    "oldest_open_signal": "2026-02-17T14:30:00Z"
  }
}
```

## Polymarket-Specific Fields

For binary/multi-outcome markets:

```json
{
  "signal": {
    "direction": "BUY_YES",
    "confidence": 0.75,
    "edge_type": "complement_arb",
    "thesis": "YES at $0.42 + NO at $0.55 = $0.97. Guaranteed $0.03 spread on resolution."
  },
  "position": {
    "complement_spread": 0.03,
    "resolution_date": "2026-03-15T00:00:00Z"
  }
}
```
