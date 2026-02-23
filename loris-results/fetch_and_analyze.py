#!/usr/bin/env python3
"""Fetch historical funding rates from HyperLiquid and run carry backtest analysis."""

import json
import requests
import time
import os
from datetime import datetime, timezone

RESULTS_DIR = "/Users/adam/.openclaw/workspace/academy/loris-results"

def fetch_funding_history(coin, start_ms, end_ms=None):
    """Fetch all funding history with pagination."""
    all_records = []
    current_start = start_ms
    if end_ms is None:
        end_ms = int(time.time() * 1000)
    
    while current_start < end_ms:
        resp = requests.post("https://api.hyperliquid.xyz/info",
            json={"type": "fundingHistory", "coin": coin, "startTime": current_start})
        data = resp.json()
        if not data:
            break
        all_records.extend(data)
        last_time = data[-1]["time"]
        if last_time <= current_start:
            break
        current_start = last_time + 1
        print(f"  {coin}: fetched {len(all_records)} records so far, last: {datetime.fromtimestamp(last_time/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M')}")
        if len(data) < 500:
            break
        time.sleep(0.2)
    
    return all_records

def fetch_candles(coin, start_ms, interval="1h"):
    """Fetch hourly candles from HyperLiquid for SMA calculation."""
    all_candles = []
    current_start = start_ms
    end_ms = int(time.time() * 1000)
    
    while current_start < end_ms:
        resp = requests.post("https://api.hyperliquid.xyz/info",
            json={"type": "candleSnapshot", "req": {"coin": coin, "interval": interval, "startTime": current_start, "endTime": end_ms}})
        data = resp.json()
        if not data:
            break
        all_candles.extend(data)
        last_time = data[-1]["t"]
        if last_time <= current_start:
            break
        current_start = last_time + 1
        print(f"  {coin} candles: {len(all_candles)} so far")
        if len(data) < 500:
            break
        time.sleep(0.2)
    
    return all_candles

def classify_regime(candles, timestamp_ms):
    """Classify regime at a given timestamp using 13/33 SMA cross on hourly closes."""
    # Find candles up to this timestamp
    relevant = [c for c in candles if c["t"] <= timestamp_ms]
    if len(relevant) < 33:
        return "unknown"
    
    closes = [float(c["c"]) for c in relevant[-33:]]
    sma13 = sum(closes[-13:]) / 13
    sma33 = sum(closes) / 33
    
    diff_pct = (sma13 - sma33) / sma33 * 100
    
    if abs(diff_pct) < 0.5:  # Within 0.5% = chop
        return "chop"
    elif diff_pct > 0:
        return "uptrend"
    else:
        return "downtrend"

def adx_approx(candles, timestamp_ms, period=14):
    """Approximate ADX from candle data."""
    relevant = [c for c in candles if c["t"] <= timestamp_ms]
    if len(relevant) < period + 2:
        return None
    
    recent = relevant[-(period+1):]
    # Calculate +DM, -DM, TR
    plus_dm_list = []
    minus_dm_list = []
    tr_list = []
    
    for i in range(1, len(recent)):
        h = float(recent[i]["h"])
        l = float(recent[i]["l"])
        c_prev = float(recent[i-1]["c"])
        h_prev = float(recent[i-1]["h"])
        l_prev = float(recent[i-1]["l"])
        
        plus_dm = max(h - h_prev, 0)
        minus_dm = max(l_prev - l, 0)
        if plus_dm > minus_dm:
            minus_dm = 0
        elif minus_dm > plus_dm:
            plus_dm = 0
        else:
            plus_dm = minus_dm = 0
        
        tr = max(h - l, abs(h - c_prev), abs(l - c_prev))
        plus_dm_list.append(plus_dm)
        minus_dm_list.append(minus_dm)
        tr_list.append(tr)
    
    avg_tr = sum(tr_list) / period
    if avg_tr == 0:
        return 0
    avg_plus_dm = sum(plus_dm_list) / period
    avg_minus_dm = sum(minus_dm_list) / period
    
    plus_di = avg_plus_dm / avg_tr * 100
    minus_di = avg_minus_dm / avg_tr * 100
    
    if plus_di + minus_di == 0:
        return 0
    dx = abs(plus_di - minus_di) / (plus_di + minus_di) * 100
    return dx

def ma_convergence(candles, timestamp_ms):
    """Check if 13/33 SMAs are within 1% of each other."""
    relevant = [c for c in candles if c["t"] <= timestamp_ms]
    if len(relevant) < 33:
        return None
    closes = [float(c["c"]) for c in relevant[-33:]]
    sma13 = sum(closes[-13:]) / 13
    sma33 = sum(closes) / 33
    return abs(sma13 - sma33) / sma33 * 100

def run_analysis():
    # 6 months ago
    six_months_ms = int(time.time() * 1000) - 86400000 * 180
    
    results = {}
    
    for coin in ["BTC", "ETH"]:
        print(f"\n=== Fetching {coin} data ===")
        
        # Check if we have cached data
        funding_file = os.path.join(RESULTS_DIR, f"{coin.lower()}_funding.json")
        candles_file = os.path.join(RESULTS_DIR, f"{coin.lower()}_candles.json")
        
        if os.path.exists(funding_file):
            print(f"  Loading cached funding data...")
            funding = json.load(open(funding_file))
        else:
            funding = fetch_funding_history(coin, six_months_ms)
            json.dump(funding, open(funding_file, "w"))
        
        if os.path.exists(candles_file):
            print(f"  Loading cached candle data...")
            candles = json.load(open(candles_file))
        else:
            candles = fetch_candles(coin, six_months_ms)
            json.dump(candles, open(candles_file, "w"))
        
        print(f"  {coin}: {len(funding)} funding records, {len(candles)} candles")
        
        # Sort by time
        funding.sort(key=lambda x: x["time"])
        candles.sort(key=lambda x: x["t"])
        
        # ========================================
        # QUESTION C: Funding APR thresholds by regime
        # ========================================
        print(f"\n  Running Question C analysis for {coin}...")
        
        # Funding rate is per hour on HL, APR = rate * 8760 * 100
        thresholds_apr = [20, 50, 100, 200, 500, 1000, 2000]
        
        # For each funding record, simulate: if |funding_apr| > threshold, enter carry trade
        # Carry trade: collect funding for next N hours until funding drops below threshold
        # Simplified: each hour where |funding| > threshold is a "signal". 
        # We track consecutive hours and the cumulative funding collected.
        
        threshold_results = {}
        for threshold in thresholds_apr:
            regime_stats = {"uptrend": {"trades": 0, "wins": 0, "total_pnl": 0, "pnl_list": []},
                           "downtrend": {"trades": 0, "wins": 0, "total_pnl": 0, "pnl_list": []},
                           "chop": {"trades": 0, "wins": 0, "total_pnl": 0, "pnl_list": []},
                           "unknown": {"trades": 0, "wins": 0, "total_pnl": 0, "pnl_list": []}}
            
            threshold_rate = threshold / 100 / 8760  # Convert APR to hourly rate
            
            # Group funding into "carry trades": consecutive hours above threshold
            in_trade = False
            trade_pnl = 0
            trade_regime = None
            
            for f in funding:
                rate = float(f["fundingRate"])
                apr = abs(rate) * 8760 * 100
                
                if apr >= threshold:
                    if not in_trade:
                        # Start new trade
                        in_trade = True
                        trade_pnl = 0
                        trade_regime = classify_regime(candles, f["time"])
                    # Collect funding (if rate > 0, shorts collect; if < 0, longs collect)
                    # Assume we always take the carry side (opposite to high funding)
                    trade_pnl += abs(rate) * 100  # as percentage
                else:
                    if in_trade:
                        # Close trade
                        # Estimate slippage/price impact: assume 0.05% entry + exit
                        net_pnl = trade_pnl - 0.1
                        regime_stats[trade_regime]["trades"] += 1
                        regime_stats[trade_regime]["total_pnl"] += net_pnl
                        regime_stats[trade_regime]["pnl_list"].append(net_pnl)
                        if net_pnl > 0:
                            regime_stats[trade_regime]["wins"] += 1
                        in_trade = False
            
            # Close any open trade
            if in_trade and trade_regime:
                net_pnl = trade_pnl - 0.1
                regime_stats[trade_regime]["trades"] += 1
                regime_stats[trade_regime]["total_pnl"] += net_pnl
                regime_stats[trade_regime]["pnl_list"].append(net_pnl)
                if net_pnl > 0:
                    regime_stats[trade_regime]["wins"] += 1
            
            threshold_results[threshold] = {}
            for regime in ["uptrend", "downtrend", "chop", "unknown"]:
                s = regime_stats[regime]
                threshold_results[threshold][regime] = {
                    "trades": s["trades"],
                    "win_rate": round(s["wins"] / s["trades"] * 100, 1) if s["trades"] > 0 else 0,
                    "avg_pnl": round(s["total_pnl"] / s["trades"], 4) if s["trades"] > 0 else 0,
                    "total_pnl": round(s["total_pnl"], 4)
                }
        
        # ========================================
        # QUESTION A: Chop prediction metrics
        # ========================================
        print(f"  Running Question A analysis for {coin}...")
        
        # For every funding signal (|APR| > 100%), check if ADX and MA convergence predict outcomes
        chop_metrics = {"adx": {"thresholds": {}}, "ma_conv": {"thresholds": {}}}
        
        # Collect all signals with their metrics
        signals_with_metrics = []
        for f in funding:
            rate = float(f["fundingRate"])
            apr = abs(rate) * 8760 * 100
            if apr >= 100:  # Use 100% APR as baseline signal
                adx_val = adx_approx(candles, f["time"])
                ma_val = ma_convergence(candles, f["time"])
                regime = classify_regime(candles, f["time"])
                signals_with_metrics.append({
                    "time": f["time"],
                    "apr": apr,
                    "adx": adx_val,
                    "ma_convergence": ma_val,
                    "regime": regime,
                    "rate": abs(rate) * 100
                })
        
        # Test ADX thresholds for chop filtering
        for adx_thresh in [15, 20, 25, 30]:
            filtered_out_loss = 0
            filtered_out_gain = 0
            kept_loss = 0
            kept_gain = 0
            filtered_count = 0
            kept_count = 0
            
            for s in signals_with_metrics:
                if s["adx"] is not None:
                    is_chop = s["regime"] == "chop"
                    pnl = s["rate"] - 0.01  # rough per-hour P&L
                    
                    if s["adx"] < adx_thresh:  # Would filter (low ADX = chop)
                        filtered_count += 1
                        if pnl < 0:
                            filtered_out_loss += abs(pnl)
                        else:
                            filtered_out_gain += pnl
                    else:
                        kept_count += 1
                        if pnl < 0:
                            kept_loss += abs(pnl)
                        else:
                            kept_gain += pnl
            
            chop_metrics["adx"]["thresholds"][adx_thresh] = {
                "filtered_signals": filtered_count,
                "kept_signals": kept_count,
                "loss_avoided": round(filtered_out_loss, 4),
                "winners_filtered": round(filtered_out_gain, 4)
            }
        
        # Test MA convergence thresholds
        for ma_thresh in [0.5, 1.0, 1.5, 2.0]:
            filtered_count = 0
            kept_count = 0
            chop_correct = 0
            
            for s in signals_with_metrics:
                if s["ma_convergence"] is not None:
                    if s["ma_convergence"] < ma_thresh:  # SMAs close = chop
                        filtered_count += 1
                        if s["regime"] == "chop":
                            chop_correct += 1
                    else:
                        kept_count += 1
            
            chop_metrics["ma_conv"]["thresholds"][str(ma_thresh)] = {
                "filtered_signals": filtered_count,
                "kept_signals": kept_count,
                "chop_precision": round(chop_correct / filtered_count * 100, 1) if filtered_count > 0 else 0
            }
        
        # ========================================
        # QUESTION B: Basis dislocations by regime
        # ========================================
        print(f"  Running Question B analysis for {coin}...")
        
        # premium < 0 means mark < index (negative basis / backwardation)
        basis_by_regime = {"uptrend": {"negative": 0, "total": 0},
                          "downtrend": {"negative": 0, "total": 0},
                          "chop": {"negative": 0, "total": 0},
                          "unknown": {"negative": 0, "total": 0}}
        
        for f in funding:
            premium = float(f["premium"])
            regime = classify_regime(candles, f["time"])
            basis_by_regime[regime]["total"] += 1
            if premium < 0:
                basis_by_regime[regime]["negative"] += 1
        
        basis_results = {}
        for regime in ["uptrend", "downtrend", "chop"]:
            s = basis_by_regime[regime]
            basis_results[regime] = {
                "total_hours": s["total"],
                "negative_basis_hours": s["negative"],
                "negative_basis_pct": round(s["negative"] / s["total"] * 100, 1) if s["total"] > 0 else 0
            }
        
        # ========================================
        # QUESTION D: Signal duration by regime
        # ========================================
        print(f"  Running Question D analysis for {coin}...")
        
        duration_by_regime = {"uptrend": [], "downtrend": [], "chop": [], "unknown": []}
        threshold_rate = 100 / 100 / 8760  # 100% APR threshold
        
        in_signal = False
        signal_start = 0
        signal_regime = None
        
        for f in funding:
            rate = float(f["fundingRate"])
            if abs(rate) * 8760 * 100 >= 100:
                if not in_signal:
                    in_signal = True
                    signal_start = f["time"]
                    signal_regime = classify_regime(candles, f["time"])
            else:
                if in_signal:
                    duration_hours = (f["time"] - signal_start) / 3600000
                    if signal_regime:
                        duration_by_regime[signal_regime].append(duration_hours)
                    in_signal = False
        
        duration_results = {}
        for regime in ["uptrend", "downtrend", "chop"]:
            durations = duration_by_regime[regime]
            if durations:
                duration_results[regime] = {
                    "count": len(durations),
                    "avg_hours": round(sum(durations) / len(durations), 1),
                    "median_hours": round(sorted(durations)[len(durations)//2], 1),
                    "max_hours": round(max(durations), 1)
                }
            else:
                duration_results[regime] = {"count": 0, "avg_hours": 0, "median_hours": 0, "max_hours": 0}
        
        results[coin] = {
            "data_range": {
                "start": datetime.fromtimestamp(funding[0]["time"]/1000, tz=timezone.utc).isoformat() if funding else None,
                "end": datetime.fromtimestamp(funding[-1]["time"]/1000, tz=timezone.utc).isoformat() if funding else None,
                "funding_records": len(funding),
                "candle_records": len(candles)
            },
            "question_c_thresholds": threshold_results,
            "question_a_chop_metrics": chop_metrics,
            "question_b_basis": basis_results,
            "question_d_duration": duration_results
        }
    
    # Save results
    with open(os.path.join(RESULTS_DIR, "analysis.json"), "w") as f:
        json.dump(results, f, indent=2)
    
    print("\n\n=== ANALYSIS COMPLETE ===")
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    results = run_analysis()
