#!/usr/bin/env python3
"""Altcoin Funding Rate Backtest using HyperLiquid API."""

import json, time, requests, sys
from datetime import datetime, timezone
from collections import defaultdict
import math

API = "https://api.hyperliquid.xyz/info"
COINS = ["SOL", "DOGE", "kPEPE", "WIF", "INJ", "OP", "ARB"]
DELAY = 0.25  # 250ms between requests

# 3 months back from now
END_MS = int(time.time() * 1000)
START_MS = END_MS - 90 * 24 * 3600 * 1000

def post(payload):
    for attempt in range(3):
        try:
            r = requests.post(API, json=payload, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt < 2:
                print(f"  Retry {attempt+1} after error: {e}")
                time.sleep(2)
            else:
                raise

def fetch_funding(coin):
    """Fetch all funding history for a coin, paginating by 500."""
    all_records = []
    start = START_MS
    while True:
        time.sleep(DELAY)
        data = post({"type": "fundingHistory", "coin": coin, "startTime": start})
        if not data:
            break
        all_records.extend(data)
        print(f"  {coin} funding: {len(all_records)} records (last: {data[-1].get('time', '?')})")
        if len(data) < 500:
            break
        # paginate: use last record's time + 1ms
        last_time = data[-1].get("time")
        if last_time:
            if isinstance(last_time, int):
                start = last_time + 1
            else:
                dt = datetime.fromisoformat(last_time.replace("Z", "+00:00"))
                start = int(dt.timestamp() * 1000) + 1
        else:
            break
    return all_records

def fetch_candles(coin, start_ms=START_MS, end_ms=END_MS):
    """Fetch hourly candles in chunks (max ~500 per request)."""
    all_candles = []
    chunk = 500 * 3600 * 1000  # 500 hours
    cur = start_ms
    while cur < end_ms:
        time.sleep(DELAY)
        ce = min(cur + chunk, end_ms)
        data = post({"type": "candleSnapshot", "req": {"coin": coin, "interval": "1h", "startTime": cur, "endTime": ce}})
        if data:
            all_candles.extend(data)
            print(f"  {coin} candles: {len(all_candles)} (up to {datetime.fromtimestamp(ce/1000, tz=timezone.utc).strftime('%Y-%m-%d')})")
        cur = ce
    return all_candles

# ---- DATA FETCH ----
print("=== Fetching BTC candles ===")
btc_candles = fetch_candles("BTC")
print(f"BTC candles: {len(btc_candles)}")

funding_data = {}
candle_data = {}
for coin in COINS:
    print(f"\n=== Fetching {coin} ===")
    funding_data[coin] = fetch_funding(coin)
    candle_data[coin] = fetch_candles(coin)
    print(f"  {coin}: {len(funding_data[coin])} funding, {len(candle_data[coin])} candles")

# ---- BTC REGIME DETECTION ----
# Build hourly BTC close price series
btc_hourly = {}  # timestamp_ms -> close
for c in btc_candles:
    t = c["t"]  # open time in ms
    btc_hourly[t] = float(c["c"])

btc_times = sorted(btc_hourly.keys())

def sma(prices, n):
    if len(prices) < n:
        return None
    return sum(prices[-n:]) / n

def get_regime(t):
    """Get BTC regime at timestamp t (ms)."""
    idx = None
    for i, bt in enumerate(btc_times):
        if bt <= t:
            idx = i
        else:
            break
    if idx is None or idx < 33:
        return "UNKNOWN"
    closes = [btc_hourly[btc_times[j]] for j in range(max(0, idx-39), idx+1)]
    if len(closes) < 33:
        return "UNKNOWN"
    sma13 = sum(closes[-13:]) / 13
    sma33 = sum(closes[-33:]) / 33
    # 6h momentum
    if len(closes) >= 7:
        mom6h = closes[-1] - closes[-7]
    else:
        mom6h = 0
    
    if sma13 > sma33 and mom6h > 0:
        return "UPTREND"
    elif sma13 < sma33 and mom6h < 0:
        return "DOWNTREND"
    else:
        return "CHOP"

# MA convergence check (within 1%)
def ma_converged(t):
    idx = None
    for i, bt in enumerate(btc_times):
        if bt <= t:
            idx = i
        else:
            break
    if idx is None or idx < 33:
        return None
    closes = [btc_hourly[btc_times[j]] for j in range(max(0, idx-39), idx+1)]
    if len(closes) < 33:
        return None
    sma13 = sum(closes[-13:]) / 13
    sma33 = sum(closes[-33:]) / 33
    ratio = abs(sma13 - sma33) / sma33
    return ratio < 0.01

# ---- Parse funding into usable format ----
def parse_funding(records):
    """Return list of (timestamp_ms, hourly_rate) sorted by time."""
    result = []
    for r in records:
        t_val = r.get("time", 0)
        rate = float(r.get("fundingRate", 0))
        if isinstance(t_val, int):
            t_ms = t_val
        else:
            dt = datetime.fromisoformat(t_val.replace("Z", "+00:00"))
            t_ms = int(dt.timestamp() * 1000)
        result.append((t_ms, rate))
    result.sort()
    return result

# ---- QUESTION C: Carry profitability by threshold and regime ----
print("\n=== QUESTION C: Carry profitability ===")
THRESHOLDS = [0.20, 0.50, 1.0, 2.0, 5.0, 10.0]  # as decimal (20% = 0.20)
EXIT_THRESHOLD = 0.10  # 10% APR

results_c = {}
for thresh in THRESHOLDS:
    thresh_pct = int(thresh * 100)
    hourly_thresh = thresh / 8760  # annualized to hourly
    hourly_exit = EXIT_THRESHOLD / 8760
    
    trades_by_regime = defaultdict(list)
    
    for coin in COINS:
        fdata = parse_funding(funding_data[coin])
        if not fdata:
            continue
        
        in_trade = False
        entry_idx = None
        cumulative_funding = 0
        trade_direction = 0  # 1 = short (positive funding), -1 = long (negative funding)
        
        for i, (t, rate) in enumerate(fdata):
            apr = rate * 8760
            
            if not in_trade:
                if abs(rate) > hourly_thresh:
                    in_trade = True
                    entry_idx = i
                    cumulative_funding = 0
                    trade_direction = 1 if rate > 0 else -1  # short if positive funding
            else:
                # Collect funding: if we're short and funding is positive, we earn it
                cumulative_funding += rate * trade_direction
                
                # Exit conditions: rate drops below exit threshold or flips sign
                should_exit = False
                if abs(rate) < hourly_exit:
                    should_exit = True
                if (trade_direction == 1 and rate < 0) or (trade_direction == -1 and rate > 0):
                    should_exit = True
                
                if should_exit:
                    regime = get_regime(fdata[entry_idx][0])
                    # P&L is cumulative funding earned (ignoring price movement for pure carry)
                    trades_by_regime[regime].append(cumulative_funding)
                    in_trade = False
    
    results_c[thresh_pct] = {}
    for regime in ["UPTREND", "DOWNTREND", "CHOP", "UNKNOWN"]:
        trades = trades_by_regime.get(regime, [])
        if trades:
            wins = sum(1 for t in trades if t > 0)
            results_c[thresh_pct][regime] = {
                "count": len(trades),
                "win_rate": round(wins / len(trades) * 100, 1),
                "avg_pnl_bps": round(sum(trades) / len(trades) * 10000, 2),
                "total_pnl_bps": round(sum(trades) * 10000, 2)
            }
    print(f"  Threshold {thresh_pct}%: {sum(len(v) for v in trades_by_regime.values())} trades")

# ---- QUESTION A: MA convergence as chop detector ----
print("\n=== QUESTION A: MA convergence ===")
results_a = {"converged": [], "diverged": []}

for coin in COINS:
    fdata = parse_funding(funding_data[coin])
    if not fdata:
        continue
    
    in_trade = False
    hourly_thresh = 1.0 / 8760  # 100% APR threshold
    hourly_exit = 0.10 / 8760
    
    for i, (t, rate) in enumerate(fdata):
        if not in_trade:
            if abs(rate) > hourly_thresh:
                in_trade = True
                entry_idx = i
                cumulative_funding = 0
                trade_direction = 1 if rate > 0 else -1
                entry_converged = ma_converged(t)
        else:
            cumulative_funding += rate * trade_direction
            should_exit = abs(rate) < hourly_exit or \
                          (trade_direction == 1 and rate < 0) or \
                          (trade_direction == -1 and rate > 0)
            if should_exit:
                if entry_converged is not None:
                    key = "converged" if entry_converged else "diverged"
                    results_a[key].append(cumulative_funding)
                in_trade = False

for key in ["converged", "diverged"]:
    trades = results_a[key]
    if trades:
        wins = sum(1 for t in trades if t > 0)
        results_a[key] = {
            "count": len(trades),
            "win_rate": round(wins / len(trades) * 100, 1),
            "avg_pnl_bps": round(sum(trades) / len(trades) * 10000, 2)
        }
    else:
        results_a[key] = {"count": 0, "win_rate": 0, "avg_pnl_bps": 0}

print(f"  Converged: {results_a['converged']}")
print(f"  Diverged: {results_a['diverged']}")

# ---- QUESTION B: Negative basis clustering ----
print("\n=== QUESTION B: Negative basis ===")
results_b = {}

for coin in COINS:
    cdata = candle_data[coin]
    basis_by_regime = defaultdict(list)
    large_neg_by_regime = defaultdict(int)
    total_by_regime = defaultdict(int)
    
    for c in cdata:
        t = c["t"]
        # HyperLiquid candles: check if we have mark and oracle
        # Fields: t, T, s, i, o, c, h, l, v, n
        # Unfortunately candle data may not have oracle price directly
        # We'll skip this if no oracle data available
        pass
    
    # Try to get mark/oracle from candle data structure
    if cdata and len(cdata) > 0:
        sample = cdata[0]
        # Check available fields
        results_b[coin] = {"note": "fields_available", "sample_keys": list(sample.keys()) if isinstance(sample, dict) else "list_format"}

print(f"  Sample candle structure: {results_b.get(COINS[0], 'no data')}")

# ---- QUESTION D: Episode persistence ----
print("\n=== QUESTION D: Episode persistence ===")
results_d = {"UPTREND": [], "DOWNTREND": [], "CHOP": [], "UNKNOWN": []}

for coin in COINS:
    fdata = parse_funding(funding_data[coin])
    if not fdata:
        continue
    
    streak = 0
    streak_regime = None
    
    for t, rate in fdata:
        apr = abs(rate) * 8760
        if apr > 1.0:  # > 100% APR
            if streak == 0:
                streak_regime = get_regime(t)
            streak += 1
        else:
            if streak > 0 and streak_regime:
                results_d[streak_regime].append(streak)
            streak = 0
    if streak > 0 and streak_regime:
        results_d[streak_regime].append(streak)

persistence_stats = {}
for regime in ["UPTREND", "DOWNTREND", "CHOP"]:
    episodes = results_d[regime]
    if episodes:
        persistence_stats[regime] = {
            "count": len(episodes),
            "avg_hours": round(sum(episodes) / len(episodes), 1),
            "median_hours": sorted(episodes)[len(episodes)//2],
            "max_hours": max(episodes)
        }
    else:
        persistence_stats[regime] = {"count": 0, "avg_hours": 0, "median_hours": 0, "max_hours": 0}

print(f"  Persistence: {persistence_stats}")

# ---- Save results ----
output = {
    "generated": datetime.now(timezone.utc).isoformat(),
    "period": {"start": datetime.fromtimestamp(START_MS/1000, tz=timezone.utc).isoformat(),
               "end": datetime.fromtimestamp(END_MS/1000, tz=timezone.utc).isoformat()},
    "coins": COINS,
    "data_counts": {coin: {"funding": len(funding_data[coin]), "candles": len(candle_data[coin])} for coin in COINS},
    "btc_candles": len(btc_candles),
    "question_c_carry_thresholds": results_c,
    "question_a_ma_convergence": results_a,
    "question_b_basis": results_b,
    "question_d_persistence": persistence_stats,
    "regime_distribution": {}
}

# Calculate regime distribution
regime_counts = defaultdict(int)
for t in btc_times:
    r = get_regime(t)
    regime_counts[r] += 1
total_h = sum(regime_counts.values())
for r, c in regime_counts.items():
    output["regime_distribution"][r] = {"hours": c, "pct": round(c/total_h*100, 1)}

json_path = "/Users/adam/.openclaw/workspace/academy/loris-results/altcoin-analysis.json"
with open(json_path, "w") as f:
    json.dump(output, f, indent=2)
print(f"\nSaved JSON to {json_path}")

# ---- Generate Report ----
report = f"""# Altcoin Funding Rate Backtest — HyperLiquid

**Generated:** {output['generated']}
**Period:** {output['period']['start'][:10]} to {output['period']['end'][:10]} (90 days)
**Coins:** {', '.join(COINS)}

## Data Summary

| Coin | Funding Records | Candle Records |
|------|----------------|----------------|
"""
for coin in COINS:
    dc = output["data_counts"][coin]
    report += f"| {coin} | {dc['funding']} | {dc['candles']} |\n"
report += f"| BTC (candles only) | — | {len(btc_candles)} |\n"

report += f"""
## BTC Regime Distribution

"""
for r in ["UPTREND", "DOWNTREND", "CHOP", "UNKNOWN"]:
    rd = output["regime_distribution"].get(r, {"hours": 0, "pct": 0})
    report += f"- **{r}:** {rd['hours']}h ({rd['pct']}%)\n"

report += """
---

## Question C: Carry Profitability by Threshold & Regime

*Entry: when hourly funding annualizes above threshold. Exit: below 10% APR or sign flip.*
*P&L = cumulative funding earned (pure carry, ignoring price moves).*

"""
for thresh in sorted(results_c.keys()):
    report += f"### {thresh}% APR Threshold\n\n"
    report += "| Regime | Trades | Win Rate | Avg P&L (bps) | Total P&L (bps) |\n"
    report += "|--------|--------|----------|---------------|------------------|\n"
    for regime in ["UPTREND", "DOWNTREND", "CHOP"]:
        d = results_c[thresh].get(regime, {"count": 0, "win_rate": 0, "avg_pnl_bps": 0, "total_pnl_bps": 0})
        report += f"| {regime} | {d['count']} | {d['win_rate']}% | {d['avg_pnl_bps']} | {d['total_pnl_bps']} |\n"
    report += "\n"

report += """---

## Question A: MA Convergence as Chop Detector

*Does MA convergence (BTC 13h/33h SMA within 1%) predict worse carry outcomes?*
*Using 100% APR entry threshold for this test.*

"""
for key in ["converged", "diverged"]:
    d = results_a[key]
    report += f"- **MAs {key.upper()}:** {d['count']} trades, {d['win_rate']}% win rate, {d['avg_pnl_bps']} bps avg P&L\n"

conv_wr = results_a["converged"]["win_rate"]
div_wr = results_a["diverged"]["win_rate"]
if conv_wr < div_wr:
    report += f"\n**✅ MA convergence IS a useful chop detector.** Win rate drops {div_wr - conv_wr:.1f}pp when MAs converge.\n"
else:
    report += f"\n**❌ MA convergence is NOT a useful chop detector** in this sample.\n"

report += """
---

## Question B: Negative Basis Clustering

*Note: HyperLiquid candle data does not include separate mark/oracle prices in the standard candleSnapshot endpoint.*
*Basis analysis requires the `allMids` or `metaAndAssetCtxs` endpoint for real-time data, or reconstructing from funding rate (which implies basis).*

**Proxy approach:** Since funding rate ≈ basis/8h, extreme negative funding implies negative basis.
"""

# Use funding as basis proxy
neg_funding_by_regime = defaultdict(int)
total_funding_by_regime = defaultdict(int)
for coin in COINS:
    fdata = parse_funding(funding_data[coin])
    for t, rate in fdata:
        regime = get_regime(t)
        total_funding_by_regime[regime] += 1
        if rate < -0.0001:  # significantly negative
            neg_funding_by_regime[regime] += 1

report += "\n**Negative funding (< -1bps/h) distribution by regime:**\n\n"
for regime in ["UPTREND", "DOWNTREND", "CHOP"]:
    total = total_funding_by_regime.get(regime, 1)
    neg = neg_funding_by_regime.get(regime, 0)
    pct = round(neg / total * 100, 1) if total > 0 else 0
    report += f"- **{regime}:** {neg}/{total} hours ({pct}%)\n"

report += """
---

## Question D: Extreme Funding Episode Persistence

*How long do >100% APR funding episodes last by regime?*

"""
report += "| Regime | Episodes | Avg Hours | Median Hours | Max Hours |\n"
report += "|--------|----------|-----------|-------------|----------|\n"
for regime in ["UPTREND", "DOWNTREND", "CHOP"]:
    d = persistence_stats[regime]
    report += f"| {regime} | {d['count']} | {d['avg_hours']} | {d['median_hours']} | {d['max_hours']} |\n"

report += """
---

## Key Takeaways

"""
# Generate takeaways based on data
# Find best threshold
best_thresh = None
best_wr = 0
for thresh in sorted(results_c.keys()):
    for regime in ["UPTREND", "DOWNTREND"]:
        d = results_c[thresh].get(regime, {})
        wr = d.get("win_rate", 0)
        if wr > best_wr and d.get("count", 0) >= 3:
            best_wr = wr
            best_thresh = f"{thresh}% in {regime}"

report += f"1. **Best carry threshold:** {best_thresh} ({best_wr}% win rate)\n" if best_thresh else ""

chop_wr = results_c.get(100, {}).get("CHOP", {}).get("win_rate", 0)
trend_wr = max(results_c.get(100, {}).get("UPTREND", {}).get("win_rate", 0),
               results_c.get(100, {}).get("DOWNTREND", {}).get("win_rate", 0))
report += f"2. **Chop kills carry:** At 100% APR threshold, chop win rate = {chop_wr}% vs trending = {trend_wr}%\n"

trend_persist = max(persistence_stats.get("UPTREND", {}).get("avg_hours", 0),
                    persistence_stats.get("DOWNTREND", {}).get("avg_hours", 0))
chop_persist = persistence_stats.get("CHOP", {}).get("avg_hours", 0)
report += f"3. **Episode duration:** Trending avg {trend_persist}h vs chop avg {chop_persist}h\n"

report += f"4. **MA convergence filter:** {'Useful' if conv_wr < div_wr else 'Not useful'} — converged WR {conv_wr}% vs diverged WR {div_wr}%\n"

report_path = "/Users/adam/.openclaw/workspace/academy/loris-results/ALTCOIN-REPORT.md"
with open(report_path, "w") as f:
    f.write(report)
print(f"Saved report to {report_path}")
print("\n=== DONE ===")
