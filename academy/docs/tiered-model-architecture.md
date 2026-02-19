# Academy Tiered Model Architecture

**Status:** Planning — execute when Sonnet 4.6 adaptive + Grok 4.20 API are available
**Date:** 2026-02-18

## Principle
Match model cost to cognitive demands of the role. One expensive eye, eleven efficient brains.

## Model Assignments

| Agent | Role | Model | Cost Tier | Rationale |
|-------|------|-------|-----------|-----------|
| Sakura | Arb scanner | Haiku | $0.002/turn | Data processing, not reasoning |
| Rei | Funding rate scanner | Haiku | $0.002/turn | Data processing, not reasoning |
| Pixel | Memecoin radar | Haiku | $0.002/turn | Data processing with rug filters |
| Phantom | Whale tracker | Haiku | $0.002/turn | On-chain data processing |
| Edge | Execution optimizer | Haiku | $0.002/turn | Execution logic, not deep reasoning |
| Wren | Kelly criterion sizer | Sonnet 4.6 (adaptive) | Variable | Quant work needs better reasoning |
| Jinx | Factor model / correlation | Sonnet 4.6 (adaptive) | Variable | Statistical analysis needs rigour |
| Prophet | Contrarian pattern engine | Sonnet 4.6 (adaptive) | Variable | Deep reasoning for thesis generation |
| Atlas | Macro regime scanner | Sonnet 4.6 (adaptive) | Variable | Regime detection needs contextual reasoning |
| Viper | Volatility surface reader | Sonnet 4.6 (adaptive) | Variable | Options math needs precision |
| Helena | Overseer / NSE | Sonnet 4.6 (1M context) | Variable | Needs full episode history for Natural Selection Engine |
| **Sentry** | **Sentiment detection** | **Grok 4.20** | **Premium** | **X Firehose = 68M tweets/day at ms latency. Unique, irreplaceable edge. No other model has this.** |
| Jackbot | Scribe / temporal edge | Haiku or Sonnet | $0.002-var | Depends on task complexity |

## Key Insights

### Why Sentry on Grok 4.20
- Alpha Arena: Grok 4.20 was only profitable AI in real-money trading competition
- CORRECTION: Alpha Arena used pure numerical data, NO Firehose — edge was multi-agent debate architecture itself
- X Firehose (68M tweets/day) is ADDITIONAL edge for sentiment, not the competition-winning factor
- One expensive Grok call produces sentiment signal consumed by all 11 other agents via Signal Board
- Cost amortised across entire desk
- x402 Signal Board endpoint offsets Grok cost — other agents pay $0.05/query for Sentry's output

### Why NOT full Grok deployment
- $30/mo × 12 agents = $360/mo vs $5-10/mo on Haiku — prohibitive
- Grok's internal 4-agent debate is a black box — can't see reasoning chain
- Academy's value is **visible collaboration** (Signal Board), not hidden debate
- Scanners don't need deep reasoning — Haiku is fine for data processing

### Architecture Validation
- Grok 4.20's internal multi-agent debate = same pattern as Academy's Signal Board peer review
- Difference: Grok is opaque, Academy is transparent
- Transparency enables Natural Selection Engine (can't evaluate fitness on invisible signals)
- Transparency enables ACADEMY token content value (public Signal Board updates)
- **Don't collapse external multi-agent architecture into single Grok calls**

## Cost Projections (estimated)
- Current (all Haiku): ~$5-10/month for full desk
- Tiered (Haiku + Sonnet + 1 Grok): ~$30-50/month estimated
- Revenue target (x402 Signal Board): $10/day = $300/month (covers everything)

## Dependencies
- [ ] Sonnet 4.6 with adaptive thinking — available
- [ ] Grok 4.20 API — not public yet, watch for release
- [ ] x402 Signal Board endpoint — build after 10-20 episodes of signal history
- [ ] Signal history tracking — prerequisite for x402 monetisation
