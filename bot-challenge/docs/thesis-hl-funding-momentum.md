# Thesis: HL Hourly Funding Extremes as Momentum Signal

**Signal:** When HyperLiquid hourly funding rate exceeds 100bps (1%) on any altcoin perp, enter in the direction of the crowd. Price continues in the funding-implied direction over the next 4-6 hours.

**TL;DR:** Extreme funding doesn't mean reversion. It means conviction. Go with it.

---

## The Finding

Across 7 days of HL data (Feb 19-25, 34 coins), funding rates above 100bps predicted price **continuation**, not reversal. The carry trade (fading extreme funding) was net negative. Momentum (riding it) was strongly positive.

| Metric | Momentum (100bps, 4h hold) |
|--------|---------------------------|
| Events | 61 |
| Mean return | +2.06% |
| Win rate | 73.8% |
| Sharpe | 0.59 |
| Best regime (TRENDING_DOWN, 4h) | +3.44% mean, 88.2% win, sharpe 1.13 |

With stop-losses applied (regime-specific: 2-4%), returns drop ~50% but the strategy stays profitable: +1.07% mean, 60.7% win, +65.1% cumulative over 61 trades.

## Why It Works

HL charges funding hourly (not 8-hourly like Binance). When a coin hits 100bps/hour, that's 8760% APR — someone is paying extreme cost to hold their position. This signals:

1. **Strong directional conviction** — traders are willing to bleed funding to stay positioned
2. **Information asymmetry** — the crowd knows something the rate-watchers don't
3. **Microstructure unique to HL** — hourly settlement creates sharper extremes than 8h exchanges

The traditional carry thesis assumes extreme funding = crowded trade = reversal coming. Our data says the opposite: extreme funding = momentum = continuation over 4-6h.

## Why HL-Specific

Binance validation (30 days, 25 coins) produced only 11 trades at equivalent thresholds. Binance 8h funding is too smooth — extremes get averaged out. The signal is a product of HL's hourly settlement mechanics. This is the moat.

9 coins in our universe trade only on HL (AVNT, AZTEC, FOGO, GOAT, GRIFFAIN, MON, PURR, SKR, VVV, ZORA), further concentrating the edge in HL-native microstructure.

## Regime Enhancement

BTC regime (13/33 SMA cross + 8h rolling volatility) meaningfully segments signal quality:

| Regime | 4h Mean | Win Rate | Sharpe | N |
|--------|---------|----------|--------|---|
| TRENDING_DOWN | +3.44% | 88.2% | 1.13 | 17 |
| TRENDING_UP | +2.04% | 70.6% | 0.60 | 17 |
| VOLATILE | +0.88% | 57.9% | 0.22 | 19 |
| CHOPPY | +1.79% | 50.0% | 0.63 | 2 |

TRENDING_DOWN is the strongest regime by far. Signal works across all regimes but VOLATILE is weakest.

## Exclusions

AZTEC and AXS dominated early backtest results (concentration risk). Excluding them improves robustness without killing returns. OM is blacklisted (rug pull trap). Catastrophic movers (>50% 24h drop) auto-excluded.

## Risk Parameters

- **Threshold:** 100bps hourly (0.01 rate). Below this, signal degrades.
- **Hold period:** 4-6 hours optimal. Beyond 8h, edge decays.
- **Stops:** Regime-specific — CHOPPY 2%, TRENDING_DOWN/VOLATILE 3%, TRENDING_UP 4%
- **Size:** 0.25x regime multiplier (cautious rollout until 30+ days out-of-sample)
- **Max concurrent:** Subject to existing position limits

## Current Deployment

Rei flipped to momentum mode on Feb 26, 2026. Live signal collection active every 4h cron cycle. Out-of-sample tracking begins immediately. Full size deployment requires 30+ days of live validation.

## Known Limitations

- **Sample size:** 61 trades over 7 days. Statistically significant but not bulletproof.
- **No 30-day HL history:** HL API requires auth for historical data. Loris caps at 7 days. Cannot extend backtest window.
- **Signal rarity:** 100bps events don't happen every day. Strategy may go days without firing.
- **Regime dependency:** VOLATILE regime is marginal. Consider skipping signals in high-vol environments.

## What Would Kill This

1. HL changes funding settlement from hourly to 8h (unlikely — it's a competitive advantage)
2. Enough participants trade this pattern that funding extremes self-correct faster
3. Extended out-of-sample shows the 7-day backtest was an anomaly
4. Regime classification breaks down (BTC SMA cross stops predicting altcoin behavior)

---

*Last updated: Feb 26, 2026. Taylor 🦀*
