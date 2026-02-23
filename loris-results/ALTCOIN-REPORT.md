# Altcoin Funding Rate Backtest — HyperLiquid

**Generated:** 2026-02-23T06:47:23.686154+00:00
**Period:** 2025-11-25 to 2026-02-23 (90 days)
**Coins:** SOL, DOGE, kPEPE, WIF, INJ, OP, ARB

## Data Summary

| Coin | Funding Records | Candle Records |
|------|----------------|----------------|
| SOL | 2160 | 2165 |
| DOGE | 2160 | 2165 |
| kPEPE | 2160 | 2165 |
| WIF | 2160 | 2165 |
| INJ | 2160 | 2165 |
| OP | 2160 | 2165 |
| ARB | 2160 | 2165 |
| BTC (candles only) | — | 2165 |

## BTC Regime Distribution

- **UPTREND:** 541h (25.0%)
- **DOWNTREND:** 614h (28.4%)
- **CHOP:** 973h (45.0%)
- **UNKNOWN:** 33h (1.5%)

---

## Question C: Carry Profitability by Threshold & Regime

*Entry: when hourly funding annualizes above threshold. Exit: below 10% APR or sign flip.*
*P&L = cumulative funding earned (pure carry, ignoring price moves).*

### 20% APR Threshold

| Regime | Trades | Win Rate | Avg P&L (bps) | Total P&L (bps) |
|--------|--------|----------|---------------|------------------|
| UPTREND | 50 | 88.0% | 2.54 | 126.95 |
| DOWNTREND | 99 | 94.9% | 2.57 | 254.82 |
| CHOP | 112 | 92.0% | 6.69 | 749.78 |

### 50% APR Threshold

| Regime | Trades | Win Rate | Avg P&L (bps) | Total P&L (bps) |
|--------|--------|----------|---------------|------------------|
| UPTREND | 6 | 100.0% | 8.29 | 49.73 |
| DOWNTREND | 19 | 100.0% | 3.37 | 64.11 |
| CHOP | 20 | 100.0% | 37.56 | 751.23 |

### 100% APR Threshold

| Regime | Trades | Win Rate | Avg P&L (bps) | Total P&L (bps) |
|--------|--------|----------|---------------|------------------|
| UPTREND | 2 | 100.0% | 5.11 | 10.22 |
| DOWNTREND | 4 | 100.0% | 6.97 | 27.9 |
| CHOP | 6 | 100.0% | 113.16 | 678.95 |

### 200% APR Threshold

| Regime | Trades | Win Rate | Avg P&L (bps) | Total P&L (bps) |
|--------|--------|----------|---------------|------------------|
| UPTREND | 0 | 0% | 0 | 0 |
| DOWNTREND | 1 | 100.0% | 67.23 | 67.23 |
| CHOP | 1 | 100.0% | 524.21 | 524.21 |

### 500% APR Threshold

| Regime | Trades | Win Rate | Avg P&L (bps) | Total P&L (bps) |
|--------|--------|----------|---------------|------------------|
| UPTREND | 0 | 0% | 0 | 0 |
| DOWNTREND | 0 | 0% | 0 | 0 |
| CHOP | 1 | 100.0% | 524.21 | 524.21 |

### 1000% APR Threshold

| Regime | Trades | Win Rate | Avg P&L (bps) | Total P&L (bps) |
|--------|--------|----------|---------------|------------------|
| UPTREND | 0 | 0% | 0 | 0 |
| DOWNTREND | 0 | 0% | 0 | 0 |
| CHOP | 1 | 100.0% | 524.21 | 524.21 |

---

## Question A: MA Convergence as Chop Detector

*Does MA convergence (BTC 13h/33h SMA within 1%) predict worse carry outcomes?*
*Using 100% APR entry threshold for this test.*

- **MAs CONVERGED:** 10 trades, 100.0% win rate, 66.55 bps avg P&L
- **MAs DIVERGED:** 2 trades, 100.0% win rate, 25.77 bps avg P&L

**❌ MA convergence is NOT a useful chop detector** in this sample.

---

## Question B: Negative Basis Clustering

*Note: HyperLiquid candle data does not include separate mark/oracle prices in the standard candleSnapshot endpoint.*
*Basis analysis requires the `allMids` or `metaAndAssetCtxs` endpoint for real-time data, or reconstructing from funding rate (which implies basis).*

**Proxy approach:** Since funding rate ≈ basis/8h, extreme negative funding implies negative basis.

**Negative funding (< -1bps/h) distribution by regime:**

- **UPTREND:** 48/3787 hours (1.3%)
- **DOWNTREND:** 35/4298 hours (0.8%)
- **CHOP:** 80/6811 hours (1.2%)

---

## Question D: Extreme Funding Episode Persistence

*How long do >100% APR funding episodes last by regime?*

| Regime | Episodes | Avg Hours | Median Hours | Max Hours |
|--------|----------|-----------|-------------|----------|
| UPTREND | 8 | 4.8 | 2 | 18 |
| DOWNTREND | 6 | 2.0 | 1 | 6 |
| CHOP | 9 | 9.4 | 3 | 42 |

---

## Key Takeaways

1. **Best carry threshold:** 50% in UPTREND (100.0% win rate)
2. **Chop kills carry:** At 100% APR threshold, chop win rate = 100.0% vs trending = 100.0%
3. **Episode duration:** Trending avg 4.8h vs chop avg 9.4h
4. **MA convergence filter:** Not useful — converged WR 100.0% vs diverged WR 100.0%
