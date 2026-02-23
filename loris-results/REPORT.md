# Loris Funding Rate Backtest — Oracle's Questions Answered

**Data Source:** HyperLiquid API (loris.tools wraps this — their API is real-time only, no historical endpoint)  
**Period:** 2025-08-27 to 2026-02-23 (6 months, 4,320 hourly data points per asset)  
**Assets:** BTC, ETH  
**Regime Classification:** 13/33 SMA cross on hourly candles (±0.5% = chop)

---

## 🚨 Critical Finding: BTC/ETH Funding is Too Low for Carry

Before the questions — the data screams one thing:

| Metric | BTC | ETH |
|--------|-----|-----|
| Mean APR | 9.6% | 9.6% |
| Median APR | 11.0% | 11.0% |
| P99 APR | 24.1% | 25.9% |
| Max APR | 203.8% | 337.8% |
| Hours > 20% APR | 79 (1.8%) | 83 (1.9%) |
| Hours > 50% APR | 3 | 5 |
| Hours > 100% APR | 1 | 2 |

**BTC and ETH funding rates on HyperLiquid almost never deviate enough for carry.** 98%+ of the time, funding is under 20% APR — meaning you'd collect ~0.002% per hour while paying ~0.05% per side in slippage. This is a losing proposition on majors.

**Implication for Rei's scanner:** If Rei triggers carry trades on BTC/ETH at reasonable APR thresholds (50%+), signals are extraordinarily rare (3-5 hours in 6 months). The carry alpha is almost entirely on altcoins.

---

## Question C: At What Funding APR Threshold Does Carry Become Profitable?

**Answer: It doesn't — not on BTC/ETH in this period.**

| Threshold | BTC Trades | ETH Trades | Win Rate |
|-----------|-----------|-----------|----------|
| 20% APR | 27 total | 33 total | 0% |
| 50% APR | 2 | 3 | 0% |
| 100%+ APR | 1 | 1 | 0% |
| 500%+ | 0 | 0 | n/a |

Every single trade lost money after 10bps round-trip slippage. The fundamental problem: trades at the 20% threshold average only ~1-3 hours duration, collecting ~0.005% in funding vs 0.10% in costs.

**By regime (20% APR threshold, BTC):**
- **Uptrend:** 7 trades, avg P&L: -0.092%
- **Downtrend:** 8 trades, avg P&L: -0.094%  
- **Chop:** 12 trades, avg P&L: -0.086%

No regime produced positive carry on BTC/ETH. The regime effect seen in Rei's signals likely comes from altcoin positions or directional alpha, not funding carry on majors.

**Recommendation:** Rerun this analysis on the top 10 altcoins by Rei signal frequency (likely SOL, DOGE, PEPE, WIF etc.) where funding dislocations are much larger and more persistent.

---

## Question A: What Metrics Best Predict Chop?

**Answer: Insufficient signal count for statistical significance on BTC/ETH.**

With only 1-3 signals above 100% APR total, there's nothing to filter. However, the regime distribution itself is informative:

**Time spent in each regime (BTC):**
- Chop: 2,245 hours (52%)
- Downtrend: 1,143 hours (26%)
- Uptrend: 901 hours (21%)

**More than half the period was chop** — confirming the regime analysis finding that chop is the dominant state and a filter is critical.

**MA Convergence (13/33 within X%) as chop proxy:**
- This naturally aligns with our regime classifier (they use the same SMAs)
- The 0.5% threshold is effectively our chop definition

**ADX:** Could not meaningfully test with only 1-2 signals. Need altcoin data with more frequent extreme funding.

---

## Question B: Does Negative Basis Cluster Away from Chop?

**Answer: No — negative basis is ubiquitous across all regimes.**

| Regime | Hours | Negative Basis % (BTC) | Negative Basis % (ETH) |
|--------|-------|----------------------|----------------------|
| Uptrend | 901 / 1,112 | 78.7% | 75.1% |
| Downtrend | 1,143 / 1,393 | 82.7% | 83.0% |
| Chop | 2,245 / 1,784 | 76.2% | 76.3% |

**BTC and ETH perpetuals on HyperLiquid trade below index (mark < oracle) 75-83% of the time regardless of regime.** This means:

- The Surgeon's dual-condition (negative basis) does NOT naturally filter chop — it's present in chop ~76% of the time
- Negative basis is *slightly* more common in downtrends (82-83%) vs chop (76%), but the difference is marginal
- The basis condition would need to be combined with magnitude thresholds (e.g., basis > 0.05% below index) to have discriminating power

**Implication:** The Surgeon needs a basis *magnitude* threshold, not just direction. A simple "mark < index" check is nearly always true on HL.

---

## Question D: Average Signal Duration in Chop vs Trending

**Answer: Signals are extremely short-lived on BTC/ETH.**

At 100% APR threshold:
- **Downtrend:** 1 signal, 1 hour (BTC); 1 signal, 2 hours (ETH)
- **Uptrend:** 0 signals
- **Chop:** 0 signals

At 20% APR threshold: trades average 2-4 hours across all regimes before funding normalizes.

**BTC/ETH funding dislocations on HyperLiquid are fleeting** — the market is too efficient on majors. Carry signals that persist for 8-24+ hours (needed for profitability after costs) simply don't occur on BTC/ETH.

---

## Summary & Recommendations

### Key Takeaways
1. **BTC/ETH carry on HyperLiquid is a dead strategy** — funding barely deviates from the ~0.01% base rate
2. **The carry alpha in Rei's scanner must come from altcoins** — need to repeat this analysis on alts
3. **Negative basis is NOT a chop filter** on HL — it's the baseline state (76-83% of all hours)
4. **Chop dominates** — 52% of the 6-month period was classified as chop

### Next Steps
1. **Priority: Run same analysis on altcoins** (SOL, DOGE, PEPE, WIF, HYPE) where funding extremes actually occur
2. **Test basis magnitude thresholds** (e.g., -0.1%, -0.2%) instead of simple direction
3. **Consider using Binance/Bybit funding data** for the carry analysis — 8-hour funding cycles may show different patterns than HL's hourly
4. **The chop filter remains critical** but needs to be tested where there are enough signals to measure

---

*Generated: 2026-02-23 | Data: HyperLiquid API | Analysis: academy/loris-results/*
