# Bot Challenge — Show Me The Money

Standalone trading tools running parallel to the Academy experiment.
Each tool maps to an Academy agent but runs independently — no soul.md, no Helena, no Signal Board overhead.

## Rules
- Standardised output: direction, confidence, entry, exit, invalidation
- Paper trade results tracked on leaderboard
- Win rate, P&L, Sharpe ratio, max drawdown
- No Academy dependency — clean separation

## Tools (by agent mapping)
| Tool | Agent | Status | Description |
|------|-------|--------|-------------|
| sakura-arb | Sakura | ⬜ TODO | Polymarket complement arb (YES+NO gaps) |
| rei-funding | Rei | ⬜ TODO | Funding rate carry trade (HL extreme funding) |
| jackbot-temporal | Jackbot | ⬜ TODO | Temporal edge (funding reset windows + regime) |
| wren-kelly | Wren | ⬜ TODO | Kelly position sizer (takes any signal → optimal size) |
| jinx-correlation | Jinx | ⬜ TODO | Correlation monitor (shared risk factor detection) |
| phantom-flash | Phantom | ⬜ TODO | Flash crash mean reversion |
| sentry-social | Sentry | ⬜ TODO | Social sentiment scanner (X/keyword alerts) |
| atlas-spread | Atlas | ⬜ TODO | Cross-exchange spread detector |
| viper-vol | Viper | ⬜ TODO | Options/vol surface scanner |
| pixel-momentum | Pixel | ⬜ TODO | Regime-aware SMA cross (from strategy_enhanced.py) |
| prophet-macro | Prophet | ⬜ TODO | Macro regime classifier (DXY, gold, VIX → crypto) |
| edge-micro | Edge | ⬜ TODO | Order book imbalance / bid-ask spread |

## Leaderboard
Updated weekly in `results/leaderboard.json`

## Compare
After 2-3 weeks: compare Bot Challenge results vs Academy episode signals.
Same strategies, different execution contexts. The data tells you which approach produces better signals.
