"""
Skill A: Funding Rate Arbitrage ("The Funding Arb Striker")

Strategy: Collect funding payments by taking the opposite side of crowded trades.
- If funding rate is positive (longs paying shorts) → Go SHORT
- If funding rate is negative (shorts paying longs) → Go LONG

This is a "delta-neutral" passive income strategy.
"""
import requests
import time
from datetime import datetime
from config import (
    MAINNET_API_URL, 
    TRADING_PAIRS,
    FUNDING_CONFIG,
    NANSEN_API_KEY,
)

def get_all_funding_rates():
    """Fetch current funding rates for all perpetual markets."""
    try:
        response = requests.post(
            f"{MAINNET_API_URL}/info",
            json={"type": "metaAndAssetCtxs"}
        )
        data = response.json()
        
        funding_rates = {}
        
        # Parse the response
        if isinstance(data, list) and len(data) >= 2:
            asset_ctxs = data[1]  # Second element contains asset contexts
            meta = data[0]  # First element contains metadata
            
            for i, asset in enumerate(asset_ctxs):
                if i < len(meta.get('universe', [])):
                    symbol = meta['universe'][i]['name']
                    funding_rate = float(asset.get('funding', 0))
                    mark_price = float(asset.get('markPx', 0))
                    open_interest = float(asset.get('openInterest', 0))
                    
                    funding_rates[symbol] = {
                        'rate': funding_rate,
                        'rate_pct': funding_rate * 100,
                        'annualized_pct': funding_rate * 100 * 3 * 365,  # 8hr funding
                        'mark_price': mark_price,
                        'open_interest': open_interest,
                        'oi_usd': open_interest * mark_price,
                    }
        
        return funding_rates
    except Exception as e:
        print(f"[Funding] Error fetching rates: {e}")
        return {}


def get_top_funding_opportunities(min_rate=None):
    """Get the best funding rate opportunities sorted by absolute rate."""
    if min_rate is None:
        min_rate = FUNDING_CONFIG['min_funding_rate']
    
    rates = get_all_funding_rates()
    
    opportunities = []
    for symbol, data in rates.items():
        if symbol not in TRADING_PAIRS:
            continue
            
        rate = data['rate']
        if abs(rate) >= min_rate:
            direction = "SHORT" if rate > 0 else "LONG"
            opportunities.append({
                'symbol': symbol,
                'rate': rate,
                'rate_pct': data['rate_pct'],
                'annualized_pct': data['annualized_pct'],
                'direction': direction,
                'mark_price': data['mark_price'],
                'oi_usd': data['oi_usd'],
                'signal_strength': min(abs(rate) / FUNDING_CONFIG['high_funding_rate'], 1.0),
            })
    
    # Sort by absolute rate (highest first)
    opportunities.sort(key=lambda x: abs(x['rate']), reverse=True)
    return opportunities


def check_nansen_whale_alignment(symbol: str, direction: str) -> dict:
    """Check if smart money is aligned with our funding direction."""
    try:
        # Nansen API endpoint for token flows
        headers = {
            "Authorization": f"Bearer {NANSEN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # This is a placeholder - actual Nansen API endpoints may differ
        response = requests.get(
            f"https://api.nansen.ai/v1/smart-money/flows/{symbol}",
            headers=headers
        )
        
        if response.status_code != 200:
            print(f"[Nansen] API returned {response.status_code}")
            return {'aligned': None, 'reason': 'API unavailable'}
        
        data = response.json()
        
        # Analyze smart money direction
        net_flow = data.get('net_flow_usd', 0)
        whale_direction = "LONG" if net_flow > 0 else "SHORT"
        
        aligned = whale_direction == direction
        
        return {
            'aligned': aligned,
            'whale_direction': whale_direction,
            'net_flow_usd': net_flow,
            'reason': f"Whales are {'accumulating' if net_flow > 0 else 'distributing'}"
        }
    except Exception as e:
        print(f"[Nansen] Error: {e}")
        return {'aligned': None, 'reason': str(e)}


def generate_funding_signals():
    """Generate trading signals based on funding rates + whale alignment."""
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 🏦 Scanning Funding Rates...")
    
    opportunities = get_top_funding_opportunities()
    
    if not opportunities:
        print("[Funding] No significant funding opportunities found")
        return []
    
    signals = []
    
    for opp in opportunities[:5]:  # Top 5 opportunities
        print(f"\n  {opp['symbol']}: {opp['rate_pct']:.4f}% ({opp['annualized_pct']:.1f}% APR)")
        print(f"    Direction: {opp['direction']} | Strength: {opp['signal_strength']:.2f}")
        
        # Check whale alignment (optional)
        whale_check = check_nansen_whale_alignment(opp['symbol'], opp['direction'])
        
        signal = {
            **opp,
            'whale_aligned': whale_check.get('aligned'),
            'whale_reason': whale_check.get('reason'),
            'timestamp': datetime.now().isoformat(),
        }
        
        # Only include high-confidence signals
        if opp['signal_strength'] >= 0.5:
            if whale_check.get('aligned') is None or whale_check.get('aligned'):
                signal['action'] = 'TRADE'
                signal['confidence'] = opp['signal_strength']
                if whale_check.get('aligned'):
                    signal['confidence'] = min(signal['confidence'] + 0.2, 1.0)
            else:
                signal['action'] = 'WATCH'
                signal['reason'] = 'Whale flow opposite to funding direction'
        else:
            signal['action'] = 'SKIP'
            signal['reason'] = 'Signal strength too low'
        
        signals.append(signal)
    
    return signals


def display_funding_dashboard():
    """Display a formatted funding rate dashboard."""
    rates = get_all_funding_rates()
    
    print("\n" + "="*70)
    print("  💰 HYPERLIQUID FUNDING RATE DASHBOARD")
    print("="*70)
    print(f"  {'Symbol':<10} {'Rate':<12} {'APR':<12} {'Direction':<10} {'OI ($M)':<10}")
    print("-"*70)
    
    # Sort by absolute rate
    sorted_rates = sorted(
        [(k, v) for k, v in rates.items() if k in TRADING_PAIRS],
        key=lambda x: abs(x[1]['rate']),
        reverse=True
    )
    
    for symbol, data in sorted_rates:
        direction = "🔴 SHORT" if data['rate'] > 0 else "🟢 LONG"
        rate_str = f"{data['rate_pct']:+.4f}%"
        apr_str = f"{data['annualized_pct']:+.1f}%"
        oi_str = f"${data['oi_usd']/1e6:.1f}M"
        
        print(f"  {symbol:<10} {rate_str:<12} {apr_str:<12} {direction:<10} {oi_str:<10}")
    
    print("="*70)
    print("  Strategy: Go opposite of funding to collect payments")
    print("  🔴 Positive rate = Longs pay Shorts = Go SHORT")
    print("  🟢 Negative rate = Shorts pay Longs = Go LONG")
    print("="*70 + "\n")


# Run standalone
if __name__ == "__main__":
    print("🦀 Hyperliquid Funding Rate Scanner")
    display_funding_dashboard()
    
    print("\n📊 Generating Trading Signals...")
    signals = generate_funding_signals()
    
    for sig in signals:
        if sig['action'] == 'TRADE':
            print(f"\n✅ SIGNAL: {sig['direction']} {sig['symbol']}")
            print(f"   Funding: {sig['rate_pct']:.4f}% | Confidence: {sig['confidence']:.2f}")
