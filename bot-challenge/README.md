# Bot Challenge 🏆

Standalone trading tools — raw backtest, paper trade, leaderboard.
No Academy overhead. No soul.md. Just strategy → data → results.

## Tools (mapped to Academy agents)

| # | Tool | Agent | Status | Description |
|---|------|-------|--------|-------------|
| 1 | `temporal-edge.ts` | Jackbot | ✅ Port | Funding reset windows + regime detection |
| 2 | `funding-carry.ts` | Rei | ✅ Port | Extreme funding → counter-position |
| 3 | `complement-arb.ts` | Sakura | 🔲 Build | Polymarket YES+NO gaps < $0.99 |
| 4 | `kelly-sizer.ts` | Wren | 🔲 Build | Takes any signal, outputs optimal size |
| 5 | `correlation-monitor.ts` | Jinx | 🔲 Build | Flags correlated risk across positions |
| 6 | `flash-crash.ts` | Phantom | 🔲 Build | Probability drops >30% in <10s mean reversion |
| 7 | `sentiment-scanner.ts` | Sentry | 🔲 Build | X/social keyword alerts |
| 8 | `spread-detector.ts` | Atlas | 🔲 Build | Cross-exchange price gaps |
| 9 | `vol-surface.ts` | Viper | 🔲 Build | Implied vs realised vol gaps |
| 10 | `momentum.ts` | Pixel | 🔲 Build | Regime-aware SMA cross (from strategy_enhanced.py) |
| 11 | `macro-regime.ts` | Prophet | 🔲 Build | DXY, gold, VIX correlation to crypto |
| 12 | `microstructure.ts` | Edge | 🔲 Build | Order book imbalance, bid-ask spread |

## Standardised Output

Every tool emits:
```json
{
  "tool": "funding-carry",
  "timestamp": "2026-02-21T00:30:00Z",
  "direction": "SHORT",
  "asset": "INJ",
  "confidence": 0.68,
  "entry": 22.50,
  "exit": 21.80,
  "invalidation": "INJ breaks above 23.00",
  "kelly_pct": 8
}
```

## Leaderboard

Tracked weekly in `results/leaderboard.json`:
- Win rate
- P&L (paper)
- Sharpe ratio
- Max drawdown

## Rules

- No Academy code imports — fully standalone
- Each tool runs as a simple script: `npx ts-node tools/funding-carry.ts`
- Paper trade results logged to `results/`
- Compare against Academy episode signals after 2-3 weeks
