#!/usr/bin/env python3
"""Stop-Loss Crossover Backtest for HyperLiquid Funding Carry"""

import json, time, sys, os
from datetime import datetime, timezone
import urllib.request

BASE = "/Users/adam/.openclaw/workspace/academy/loris-results"
COINS = ["SOL", "DOGE", "PEPE", "WIF", "INJ", "OP", "ARB"]
STOP_LEVELS = [None, 0.01, 0.02, 0.03, 0.04, 0.05]  # None = no stop
ENTRY_THRESHOLD_APR = 1.0  # 100% APR
EXIT_THRESHOLD_APR = 0.10  # 10% APR
HOURS_PER_YEAR = 8766

def api_call(payload):
    req = urllib.request.Request(
        "https://api.hyperliquid.xyz/info",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

def fetch_candles(coin, start_ms, end_ms):
    """Fetch hourly candles, paginating by 500h chunks"""
    all_candles = []
    current = start_ms
    chunk = 500 * 3600 * 1000
    while current < end_ms:
        chunk_end = min(current + chunk, end_ms)
        data = api_call({"type": "candleSnapshot", "req": {"coin": coin, "interval": "1h", "startTime": current, "endTime": chunk_end}})
        if data:
            all_candles.extend(data)
            current = data[-1]["t"] + 3600000
        else:
            current = chunk_end
        time.sleep(0.2)
        print(f"  {coin} candles: {len(all_candles)} rows, up to {datetime.utcfromtimestamp(current/1000).strftime('%Y-%m-%d')}")
    return all_candles

def fetch_funding(coin, start_ms):
    """Fetch funding history, paginating by 500"""
    all_funding = []
    current = start_ms
    while True:
        data = api_call({"type": "fundingHistory", "coin": coin, "startTime": current})
        if not data:
            break
        all_funding.extend(data)
        if len(data) < 500:
            break
        # Next page starts after last timestamp
        raw_t = data[-1]["time"]
        if isinstance(raw_t, (int, float)):
            last_t = int(raw_t) + 1
        else:
            last_t = int(datetime.fromisoformat(raw_t.replace("Z", "+00:00")).timestamp() * 1000) + 1
        if last_t <= current:
            break
        current = last_t
        time.sleep(0.2)
        print(f"  {coin} funding: {len(all_funding)} rows")
    return all_funding

def load_or_fetch_coin_data(coin, start_ms, end_ms):
    candle_file = os.path.join(BASE, f"{coin.lower()}_candles.json")
    funding_file = os.path.join(BASE, f"{coin.lower()}_funding.json")
    
    if os.path.exists(candle_file) and os.path.exists(funding_file):
        candles = json.load(open(candle_file))
        funding = json.load(open(funding_file))
        if len(candles) > 100 and len(funding) > 100:
            print(f"  {coin}: loaded {len(candles)} candles, {len(funding)} funding from cache")
            return candles, funding
    
    print(f"  Fetching {coin} data from API...")
    candles = fetch_candles(coin, start_ms, end_ms)
    funding = fetch_funding(coin, start_ms)
    
    with open(candle_file, "w") as f: json.dump(candles, f)
    with open(funding_file, "w") as f: json.dump(funding, f)
    print(f"  {coin}: saved {len(candles)} candles, {len(funding)} funding")
    return candles, funding

def compute_regimes(btc_candles):
    """Compute BTC regime for each hourly timestamp using 13/33 SMA cross"""
    closes = [(c["t"], float(c["c"])) for c in btc_candles]
    closes.sort()
    
    regimes = {}
    for i in range(32, len(closes)):
        t = closes[i][0]
        sma13 = sum(c for _, c in closes[i-12:i+1]) / 13
        sma33 = sum(c for _, c in closes[i-32:i+1]) / 33
        
        # 6h momentum
        if i >= 6:
            mom6h = (closes[i][1] - closes[i-6][1]) / closes[i-6][1]
        else:
            mom6h = 0
        
        # Regime classification
        sma_ratio = abs(sma13 - sma33) / sma33
        if sma_ratio < 0.01:
            regime = "CHOP"
        elif sma13 > sma33 and mom6h > 0.003:
            regime = "TRENDING_UP"
        elif sma13 < sma33 and mom6h < -0.003:
            regime = "TRENDING_DOWN"
        else:
            regime = "VOLATILE"
        
        regimes[t] = regime
    
    return regimes

def funding_to_apr(rate):
    """Convert hourly funding rate to APR"""
    return abs(rate) * HOURS_PER_YEAR

def run_backtest(candles, funding_list, regimes, stop_level):
    """Run backtest for one coin with one stop level"""
    # Build lookup maps
    # Candle map: timestamp -> candle
    candle_map = {}
    candle_times = []
    for c in candles:
        t = c["t"]
        candle_map[t] = c
        candle_times.append(t)
    candle_times.sort()
    
    # Funding map: timestamp -> rate
    funding_map = {}
    for f in funding_list:
        # Parse time
        ts = f.get("time", "")
        if ts:
            try:
                if isinstance(ts, (int, float)):
                    t_ms = int(ts)
                else:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    t_ms = int(dt.timestamp() * 1000)
                # Round to nearest hour
                t_ms = (t_ms // 3600000) * 3600000
                funding_map[t_ms] = float(f["fundingRate"])
            except:
                pass
    
    trades = []
    in_trade = False
    entry_price = 0
    entry_time = 0
    direction = 0  # 1=long, -1=short
    funding_collected = 0
    
    for i, t in enumerate(candle_times):
        c = candle_map[t]
        close = float(c["c"])
        high = float(c["h"])
        low = float(c["l"])
        rate = funding_map.get(t, 0)
        apr = funding_to_apr(rate)
        regime = regimes.get(t, "UNKNOWN")
        
        if in_trade:
            # Collect funding this hour
            if direction == 1 and rate < 0:
                funding_collected += abs(rate)  # long collects negative funding
            elif direction == -1 and rate > 0:
                funding_collected += abs(rate)  # short collects positive funding
            elif direction == 1 and rate > 0:
                funding_collected -= abs(rate)  # long pays positive funding
            elif direction == -1 and rate < 0:
                funding_collected -= abs(rate)  # short pays negative funding
            
            # Check stop loss using high/low
            stopped = False
            if stop_level is not None:
                if direction == 1:  # long, stop if price drops
                    if low <= entry_price * (1 - stop_level):
                        exit_price = entry_price * (1 - stop_level)
                        stopped = True
                else:  # short, stop if price rises
                    if high >= entry_price * (1 + stop_level):
                        exit_price = entry_price * (1 + stop_level)
                        stopped = True
            
            # Check exit condition: funding drops below threshold or flips
            should_exit = False
            if not stopped:
                if apr < EXIT_THRESHOLD_APR:
                    should_exit = True
                elif direction == 1 and rate > 0:  # was collecting negative, now positive
                    if funding_to_apr(rate) < EXIT_THRESHOLD_APR:
                        should_exit = True
                elif direction == -1 and rate < 0:  # was collecting positive, now negative
                    if funding_to_apr(rate) < EXIT_THRESHOLD_APR:
                        should_exit = True
                # Also exit if funding flips sign significantly
                if direction == 1 and rate > 0 and apr > EXIT_THRESHOLD_APR:
                    should_exit = True  # funding flipped, we're now paying
                elif direction == -1 and rate < 0 and apr > EXIT_THRESHOLD_APR:
                    should_exit = True
            
            if stopped or should_exit:
                if not stopped:
                    exit_price = close
                
                price_pnl = (exit_price - entry_price) / entry_price * direction
                duration = (t - entry_time) / 3600000
                
                trades.append({
                    "entry_time": entry_time,
                    "exit_time": t,
                    "regime": regimes.get(entry_time, "UNKNOWN"),
                    "direction": direction,
                    "entry_price": entry_price,
                    "exit_price": exit_price,
                    "price_pnl": price_pnl,
                    "funding_pnl": funding_collected,
                    "net_pnl": price_pnl + funding_collected,
                    "duration_hours": max(duration, 1),
                    "stopped": stopped
                })
                in_trade = False
        
        if not in_trade:
            # Check entry: funding annualizes above 100% APR
            if apr >= ENTRY_THRESHOLD_APR and regime != "UNKNOWN":
                in_trade = True
                entry_price = close
                entry_time = t
                funding_collected = 0
                # Go opposite to funding direction
                if rate > 0:
                    direction = -1  # funding positive = shorts pay longs, go short to... wait
                    # Actually: positive funding = longs pay shorts. Go SHORT to collect.
                    direction = -1
                else:
                    direction = 1  # negative funding = shorts pay longs. Go LONG to collect.
    
    return trades

def aggregate_trades(trades, regimes_list=None):
    """Aggregate trade stats by regime"""
    regime_trades = {}
    for t in trades:
        r = t["regime"]
        if r not in regime_trades:
            regime_trades[r] = []
        regime_trades[r].append(t)
    
    # Also compute ALL
    regime_trades["ALL"] = trades
    
    stats = {}
    for regime, tlist in regime_trades.items():
        if not tlist:
            continue
        n = len(tlist)
        survived = sum(1 for t in tlist if not t["stopped"])
        winners = sum(1 for t in tlist if t["net_pnl"] > 0)
        
        stats[regime] = {
            "num_trades": n,
            "survival_rate": survived / n * 100,
            "win_rate": winners / n * 100,
            "avg_net_pnl_bps": sum(t["net_pnl"] for t in tlist) / n * 10000,
            "avg_funding_bps": sum(t["funding_pnl"] for t in tlist) / n * 10000,
            "avg_price_pnl_bps": sum(t["price_pnl"] for t in tlist) / n * 10000,
            "avg_duration_hours": sum(t["duration_hours"] for t in tlist) / n,
            "total_net_pnl_bps": sum(t["net_pnl"] for t in tlist) * 10000,
        }
    
    return stats

def main():
    print("=== Stop-Loss Crossover Backtest ===\n")
    
    # Load BTC candles for regime detection
    print("Loading BTC candles...")
    btc_candles = json.load(open(os.path.join(BASE, "btc_candles.json")))
    start_ms = btc_candles[0]["t"]
    end_ms = btc_candles[-1]["t"]
    print(f"BTC data: {len(btc_candles)} candles, {datetime.utcfromtimestamp(start_ms/1000)} to {datetime.utcfromtimestamp(end_ms/1000)}")
    
    print("\nComputing BTC regimes...")
    regimes = compute_regimes(btc_candles)
    regime_counts = {}
    for r in regimes.values():
        regime_counts[r] = regime_counts.get(r, 0) + 1
    print(f"Regime distribution: {regime_counts}")
    
    # Load/fetch altcoin data
    print("\nLoading altcoin data...")
    coin_data = {}
    for coin in COINS:
        print(f"\n{coin}:")
        try:
            candles, funding = load_or_fetch_coin_data(coin, start_ms, end_ms)
            if len(candles) > 50 and len(funding) > 50:
                coin_data[coin] = (candles, funding)
            else:
                print(f"  Skipping {coin}: insufficient data")
        except Exception as e:
            print(f"  Error loading {coin}: {e}")
    
    if not coin_data:
        print("ERROR: No coin data available!")
        sys.exit(1)
    
    # Run backtests
    print(f"\n\nRunning backtests for {len(coin_data)} coins × {len(STOP_LEVELS)} stop levels...")
    
    all_results = {}
    
    for stop in STOP_LEVELS:
        stop_name = f"{int(stop*100)}%" if stop else "no_stop"
        print(f"\n--- Stop Level: {stop_name} ---")
        
        all_trades = []
        per_coin = {}
        
        for coin, (candles, funding) in coin_data.items():
            trades = run_backtest(candles, funding, regimes, stop)
            all_trades.extend(trades)
            per_coin[coin] = aggregate_trades(trades)
            print(f"  {coin}: {len(trades)} trades")
        
        combined_stats = aggregate_trades(all_trades)
        all_results[stop_name] = {
            "combined": combined_stats,
            "per_coin": per_coin,
            "total_trades": len(all_trades)
        }
    
    # Save JSON
    print("\n\nSaving results...")
    with open(os.path.join(BASE, "stop-loss-backtest.json"), "w") as f:
        json.dump(all_results, f, indent=2)
    
    # Generate report
    generate_report(all_results)
    print("\nDone!")

def generate_report(results):
    lines = ["# Stop-Loss Crossover Backtest Report\n"]
    lines.append(f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n")
    lines.append("**Coins:** " + ", ".join(COINS) + "\n")
    lines.append("**Entry:** Funding annualizes > 100% APR → go opposite direction\n")
    lines.append("**Exit:** Funding drops below 10% APR or flips sign, or stop-loss hit\n")
    lines.append("**Benchmark:** Zhivkov paper — 95% of positions forced out by spread reversals\n\n")
    
    regimes = ["ALL", "TRENDING_UP", "TRENDING_DOWN", "CHOP", "VOLATILE"]
    stop_names = ["no_stop", "1%", "2%", "3%", "4%", "5%"]
    
    for regime in regimes:
        lines.append(f"## {regime}\n")
        lines.append("| Stop | Trades | Survival% | Win% | Avg Net (bps) | Avg Funding (bps) | Avg Price (bps) | Avg Hours | Total Net (bps) |")
        lines.append("|------|--------|-----------|------|---------------|--------------------|-----------------|-----------|-----------------|\n")
        
        for sn in stop_names:
            r = results.get(sn, {}).get("combined", {}).get(regime, None)
            if r:
                lines.append(f"| {sn} | {r['num_trades']} | {r['survival_rate']:.1f} | {r['win_rate']:.1f} | {r['avg_net_pnl_bps']:.1f} | {r['avg_funding_bps']:.1f} | {r['avg_price_pnl_bps']:.1f} | {r['avg_duration_hours']:.1f} | {r['total_net_pnl_bps']:.0f} |")
            else:
                lines.append(f"| {sn} | 0 | - | - | - | - | - | - | - |")
        lines.append("\n")
    
    # Crossover analysis
    lines.append("## 🎯 Crossover Points\n")
    lines.append("The stop-loss level where net P&L flips from negative to positive:\n")
    
    for regime in regimes:
        prev_pnl = None
        crossover = "None found"
        for sn in stop_names:
            r = results.get(sn, {}).get("combined", {}).get(regime, None)
            if r:
                cur_pnl = r["avg_net_pnl_bps"]
                if prev_pnl is not None and prev_pnl < 0 and cur_pnl >= 0:
                    crossover = sn
                    break
                prev_pnl = cur_pnl
        lines.append(f"- **{regime}:** {crossover}")
    
    lines.append("\n\n## Per-Coin Breakdown (Best Stop Level)\n")
    for sn in stop_names:
        r = results.get(sn, {})
        if not r:
            continue
        per_coin = r.get("per_coin", {})
        for coin, stats in per_coin.items():
            all_s = stats.get("ALL", {})
            if all_s and all_s.get("avg_net_pnl_bps", 0) > 0:
                lines.append(f"- **{coin}** @ {sn}: {all_s['num_trades']} trades, "
                           f"survival {all_s['survival_rate']:.0f}%, "
                           f"win {all_s['win_rate']:.0f}%, "
                           f"avg net {all_s['avg_net_pnl_bps']:.1f} bps")
    
    report = "\n".join(lines)
    with open(os.path.join(BASE, "STOP-LOSS-REPORT.md"), "w") as f:
        f.write(report)
    print("Report saved to STOP-LOSS-REPORT.md")

if __name__ == "__main__":
    main()
