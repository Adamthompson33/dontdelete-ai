#!/usr/bin/env python3
"""
🦀 Hyperliquid Trading Bot - Main Entry Point

Strategies:
  A) Funding Arb - Collect funding payments by taking opposite side of crowded trades
  B) Orderbook Scout - Trade with large walls, confirmed by sentiment

Usage:
  python main.py --paper           # Paper trading mode
  python main.py --live            # Live trading (requires API keys)
  python main.py --scan            # Just scan for signals, don't trade
  python main.py --funding         # Show funding rate dashboard
  python main.py --orderbook BTC   # Show orderbook for a symbol
"""
import argparse
import time
import sys
from datetime import datetime

from config import FUNDING_CONFIG, TRADING_PAIRS
from funding_arb import generate_funding_signals, display_funding_dashboard
from orderbook_scout import generate_wall_signals, display_orderbook_summary
from executor import HyperliquidExecutor


def print_banner():
    print("""
╔═══════════════════════════════════════════════════════════════╗
║  🦀 HYPERLIQUID TRADING BOT                                   ║
║  ─────────────────────────────────────────────────────────────║
║  Strategies:                                                  ║
║    A) Funding Rate Arbitrage - Collect passive income         ║
║    B) Orderbook Wall Scout - Trade with smart money           ║
╚═══════════════════════════════════════════════════════════════╝
""")


def run_scan_cycle(executor: HyperliquidExecutor = None) -> list:
    """Run one scan cycle for all strategies."""
    all_signals = []
    
    # Strategy A: Funding Rate Signals
    print("\n" + "─"*60)
    print("  📊 STRATEGY A: Funding Rate Scan")
    print("─"*60)
    funding_signals = generate_funding_signals()
    all_signals.extend(funding_signals)
    
    # Strategy B: Orderbook Wall Signals
    print("\n" + "─"*60)
    print("  📊 STRATEGY B: Orderbook Wall Scan")
    print("─"*60)
    wall_signals = generate_wall_signals()
    all_signals.extend(wall_signals)
    
    # Filter actionable signals
    trade_signals = [s for s in all_signals if s.get('action') == 'TRADE']
    watch_signals = [s for s in all_signals if s.get('action') == 'WATCH']
    
    print(f"\n{'='*60}")
    print(f"  📋 SIGNAL SUMMARY")
    print(f"{'='*60}")
    print(f"  Actionable Trades: {len(trade_signals)}")
    print(f"  Watch List: {len(watch_signals)}")
    
    # Execute signals if executor provided
    if executor and trade_signals:
        print(f"\n  🎯 Executing {len(trade_signals)} signal(s)...")
        for signal in trade_signals:
            result = executor.execute_signal(signal)
            if result['success']:
                print(f"    ✅ {signal['direction']} {signal['symbol']}")
            else:
                print(f"    ❌ {signal['symbol']}: {result.get('error', 'Unknown error')}")
    
    return all_signals


def run_bot(paper_mode: bool = True, interval_sec: int = None):
    """Run the trading bot in a loop."""
    if interval_sec is None:
        interval_sec = FUNDING_CONFIG['check_interval_sec']
    
    executor = HyperliquidExecutor(paper_mode=paper_mode)
    
    print_banner()
    print(f"  Mode: {'📝 PAPER TRADING' if paper_mode else '💰 LIVE TRADING'}")
    print(f"  Pairs: {', '.join(TRADING_PAIRS)}")
    print(f"  Interval: {interval_sec}s")
    print(f"  Max Position: ${FUNDING_CONFIG['max_position_usd']}")
    print(f"  Leverage: {FUNDING_CONFIG['leverage']}x")
    
    status = executor.get_status()
    print(f"\n  Account Value: ${status['account_value']:,.2f}")
    print(f"  Open Positions: {status['open_positions']}")
    print()
    
    cycle = 0
    while True:
        try:
            cycle += 1
            print(f"\n{'#'*60}")
            print(f"  CYCLE {cycle} | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"{'#'*60}")
            
            signals = run_scan_cycle(executor)
            
            # Show current status
            status = executor.get_status()
            print(f"\n  📊 Status: {status['open_positions']} positions | P&L: ${status['daily_pnl']:+.2f}")
            
            # Wait for next cycle
            print(f"\n  ⏳ Next scan in {interval_sec}s... (Ctrl+C to stop)")
            time.sleep(interval_sec)
            
        except KeyboardInterrupt:
            print("\n\n[Bot] Shutting down...")
            break
        except Exception as e:
            print(f"\n[Bot] Error: {e}")
            time.sleep(10)  # Wait before retrying


def main():
    parser = argparse.ArgumentParser(description='Hyperliquid Trading Bot')
    parser.add_argument('--paper', action='store_true', help='Paper trading mode (default)')
    parser.add_argument('--live', action='store_true', help='Live trading mode')
    parser.add_argument('--scan', action='store_true', help='Scan once and exit')
    parser.add_argument('--funding', action='store_true', help='Show funding dashboard')
    parser.add_argument('--orderbook', type=str, help='Show orderbook for symbol')
    parser.add_argument('--interval', type=int, default=60, help='Scan interval in seconds')
    
    args = parser.parse_args()
    
    # Show specific dashboards
    if args.funding:
        display_funding_dashboard()
        return
    
    if args.orderbook:
        display_orderbook_summary(args.orderbook.upper())
        return
    
    # Scan mode
    if args.scan:
        print_banner()
        print("  Mode: 🔍 SCAN ONLY (no trades)")
        run_scan_cycle(executor=None)
        return
    
    # Trading mode
    paper_mode = not args.live
    
    if args.live:
        print("\n⚠️  WARNING: Live trading mode!")
        print("    This will use REAL funds on Hyperliquid.")
        confirm = input("    Type 'YES' to continue: ")
        if confirm != 'YES':
            print("    Aborted.")
            return
    
    run_bot(paper_mode=paper_mode, interval_sec=args.interval)


if __name__ == "__main__":
    main()
