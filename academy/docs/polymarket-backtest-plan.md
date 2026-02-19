# Polymarket Backtest Plan

**Date:** 2026-02-19
**Status:** Execute on Mac Mini arrival
**Goal:** Prove or disprove three edges with data before deploying capital

---

## Strategy 1: Complement Arbitrage (Sakura)
**Priority: FIRST — simplest to prove, lowest risk**

### The Edge
Binary markets: YES + NO should = $1.00. When YES + NO < $0.99, buy both for guaranteed profit on resolution. Pure math, zero directional risk.

### What to Test
- How often does complement pricing gap > $0.01 occur?
- Average spread when it occurs
- Duration of gap (how long do you have to execute?)
- After fees (Polymarket charges ~2%), is the edge still positive?
- Distribution: is it concentrated in illiquid markets or does it appear in high-volume ones too?

### Data Needed
- Historical YES/NO prices for all resolved binary markets (minimum 1,000 markets)
- Timestamp granularity: 1-minute or better
- Polymarket API: `GET /markets` + `GET /prices` endpoints

### Starting Repo
- **discountry/polymarket-arbitrage** — Python, already implements complement detection
- Clone, point at historical data, run

### Statistical Threshold
- Minimum 200 occurrences to be meaningful
- Edge must be > 1% after fees (2% Polymarket fee on winnings)
- If average spread is < $0.02 after fees, strategy is NOT viable at current fee structure

### Pass/Fail
- **PASS:** >200 occurrences, >1% net edge, average gap duration >30 seconds (executable)
- **FAIL:** <100 occurrences OR net edge <0.5% after fees OR gaps close in <5 seconds (unexecutable)

---

## Strategy 2: Flash Crash Mean Reversion (Sakura/Rei)
**Priority: SECOND — higher return potential, needs more data**

### The Edge
Probability drops >30% in under 10 seconds on binary markets. These are panic sells / liquidity gaps, not fundamental re-pricing. Price reverts within minutes. Buy the crash, sell the reversion.

### What to Test
- Frequency of >30% drops in <10 seconds across all markets
- What % of these drops fully revert vs represent real re-pricing?
- Average reversion magnitude and time to recovery
- Optimal entry point (how far into the drop?) and exit point
- Does market liquidity/volume predict which crashes revert?

### Data Needed
- Tick-level or 1-second price data for high-volume markets
- Minimum 6 months of data across 500+ markets
- Order book snapshots if available (to distinguish liquidity gaps from real selling)

### Starting Repo
- **discountry/polymarket-flash-crash** — has detection logic
- May need to build custom data pipeline for tick-level historical data

### Statistical Threshold
- Minimum 50 crash events to analyse
- Reversion rate must be >70% (7 out of 10 crashes revert)
- Average reversion profit must be >5% per event (to justify the 30% of events that don't revert)
- Expected value per event: (0.7 × avg_win) - (0.3 × avg_loss) must be positive

### Pass/Fail
- **PASS:** >50 events, >70% reversion rate, positive expected value >2% per event
- **FAIL:** <30 events OR <60% reversion rate OR negative expected value

---

## Strategy 3: Latency Arbitrage (Phantom)
**Priority: THIRD — highest potential, hardest to backtest**

### The Edge
Asian bookmaker lines (Pinnacle, SBOBET) move 2-3 hours before Polymarket sports markets re-price. The PhD wallet ($2.67M profit) exploited this window. Buy/sell Polymarket positions based on bookmaker line movements before the crowd catches up.

### What to Test
- Time lag between Pinnacle line movement and Polymarket price adjustment
- Is the lag consistent or has it compressed as more bots entered?
- Average profit per trade if you front-run by X minutes
- Which sports/markets have the longest lag? (likely niche markets, not major events)
- Is the edge still there in Feb 2026 or has it been arbitraged away?

### Data Needed
- Historical Pinnacle/SBOBET line movements with timestamps (the-odds-api.com or similar)
- Historical Polymarket prices for corresponding sports markets with timestamps
- Minimum 3 months of overlapping data across 200+ sports markets
- Need sub-minute timestamps to measure lag accurately

### Starting Repo
- **kratos-te** (Rust) — arb detection framework, may need adaptation for cross-platform
- May need custom build — pull odds API data and Polymarket data, align timestamps, measure lag

### Statistical Threshold
- Minimum 100 lag events where bookmaker moved >2% before Polymarket
- Average lag must be >15 minutes (if <5 minutes, too fast to reliably execute)
- Win rate when front-running must be >65%
- Edge may have decayed — compare lag duration in months 1-3 vs recent data

### Pass/Fail
- **PASS:** >100 events, >15 min average lag, >65% win rate, edge hasn't fully decayed
- **FAIL:** <50 events OR average lag <5 min OR win rate <55% OR clear decay trend toward zero

---

## Execution Order (Mac Mini Day 1)

```
Hour 1: Set up Mac Mini, install Node/Python/Rust, clone repos
  - git clone discountry/polymarket-arbitrage
  - git clone discountry/polymarket-flash-crash  
  - git clone kratos-te (Rust arb bot)
  - pip install polymarket-py / npm install @polymarket/sdk

Hour 2-3: Pull Polymarket historical data
  - GET /markets (all resolved markets, paginated)
  - GET /prices (historical price series per market)
  - Store locally as SQLite or Parquet for fast querying
  - Target: 1,000+ resolved binary markets with price history

Hour 4-5: Run Strategy 1 backtest (complement arb)
  - Scan all resolved markets for YES+NO < 0.99 events
  - Log: timestamp, spread, duration, market volume
  - Calculate: frequency, average spread, net edge after fees
  - OUTPUT: pass/fail verdict with data

Hour 6-7: Run Strategy 2 backtest (flash crash)
  - Scan for >30% drops in <10 seconds
  - Track reversion rate and magnitude
  - Calculate expected value per event
  - OUTPUT: pass/fail verdict with data

Strategy 3 (latency arb) requires external odds data — scope data sources 
and build pipeline as a separate session.
```

## What "Proven Edge" Means

A strategy is approved for live deployment when:

1. **Statistical significance:** Minimum sample size met (per strategy thresholds above)
2. **Positive expected value:** After ALL fees (platform fees, gas, slippage)
3. **Executable:** Gap/window duration is long enough to reliably place trades
4. **Not decaying:** Edge hasn't compressed to zero over the data period
5. **Defined risk:** Max drawdown scenario is quantified and survivable

A strategy that passes gets:
- A Signal Board signal type in the canonical schema
- An agent assignment (which soul.md produces these signals)
- A position sizing rule from Wren's Kelly engine
- An invalidation condition set

A strategy that fails gets archived with the data — "we tested this, here's why it doesn't work." That's still valuable for the x402 endpoint: paying customers want to know what was tested and rejected, not just what was approved.

## Signal Board Integration

Every backtest result becomes a reference document:

```json
{
  "strategy": "complement_arb",
  "backtest_date": "2026-02-19",
  "dataset": "1,247 resolved Polymarket binary markets, Oct 2025 - Feb 2026",
  "result": "PASS",
  "stats": {
    "occurrences": 342,
    "avg_spread_after_fees": 0.013,
    "avg_gap_duration_seconds": 127,
    "win_rate": 0.97,
    "expected_value_per_trade": 0.011
  },
  "assigned_agent": "Sakura",
  "live_deployment_date": null
}
```

This goes in the ACADEMY token comments when strategies are proven: "Complement arb backtested across 1,247 markets. 342 opportunities detected. 97% win rate. 1.3% average edge after fees. Sakura deploying live."

That's the kind of comment that converts browsers into holders.
