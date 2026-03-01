# Research Library — Component Reference Map

Single source of truth: which reference code to look at when building each Academy component.

## Component Map

| Component | Reference Source | Key File |
|-----------|-----------------|----------|
| Kelly sizing (Wren) | nflalgorithm | nba_value_engine.py |
| Risk/drawdown (Medic) | nflalgorithm | utils/risk_utils.py |
| Confidence tiers (Jinx) | nflalgorithm | confidence_engine.py |
| Stacking ensemble (Prophet) | nflalgorithm | models/nba/stat_model.py |
| Polymarket API | polymarket-bot | src/utils/fetch_data.py |
| Whale tracking (Phantom) | polymarket-bot | scripts/research/ |
| Forecast calibration | AIA Forecaster | academy/src/utils/platt-scaling.ts |
| Supervisor reconciliation | AIA Forecaster | architecture doc (build later) |

## Extraction Guides

- `nflalgorithm/EXTRACTED_COMPONENTS.md`
- `polymarket-trading-bot-ts/EXTRACTED_COMPONENTS.md`
- `academy/docs/aia-forecaster-analysis.md`

## Key Findings

- **Platt scaling** (`academy/src/utils/platt-scaling.ts`): Implemented and tested. Corrects LLM probability hedging toward 0.5 using coefficient √3 (Bridgewater AIA Forecaster paper, arXiv:2511.07678v1). Apply to ALL agent probability outputs before aggregation.
- **Optimal ensemble size:** 10 agents (Bridgewater paper). Our 12-agent setup is in range.
- **Best forecasting model:** Claude Sonnet 4 (Brier 0.1195). Use Sonnet minimum for forecast calls; Haiku stays fine for crons/monitoring.
- **polymarket-trading-bot-ts** is actually Python, and it's a copy-trader — arb strategies need to be built from scratch.

## Model Routing (Forecasting)

Per Bridgewater paper results:
- Sonnet 4+ for forecast/probability calls
- Haiku for crons, monitoring, data collection
- Opus for strategy/reconciliation

---

*Created 2026-02-28. Source: Jackbot research email.*
