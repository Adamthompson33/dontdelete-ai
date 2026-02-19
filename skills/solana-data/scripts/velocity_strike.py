#!/usr/bin/env python3
"""
Velocity Strike - Volume/Price Divergence Detector
Spots hidden accumulation: volume spikes while price stays flat.

Signal: Volume > 3x Average AND Price Change < threshold
"""

import requests
from dataclasses import dataclass
from typing import Optional

# --- CONFIG ---
VOLUME_MULTIPLIER = 3.0      # Volume must be 3x above average
PRICE_FLAT_THRESHOLD = 5.0   # Price change must be < 5% to be "flat"


@dataclass
class VelocitySignal:
    token: str
    symbol: str
    pool_address: str
    volume_1h: float
    volume_6h_avg: float      # Hourly average over 6h
    volume_ratio: float       # How many x above average
    price_change_1h: float
    signal_strength: str      # "STRONG", "MODERATE", "WEAK"
    url: str


def get_dexscreener_data(token_address: str) -> Optional[dict]:
    """Fetch token data from DexScreener."""
    url = f"https://api.dexscreener.com/tokens/v1/solana/{token_address}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data and len(data) > 0:
            # Return the most liquid pair
            return max(data, key=lambda x: float(x.get("liquidity", {}).get("usd", 0) or 0))
    except Exception as e:
        print(f"DexScreener error: {e}")
    return None


def get_gecko_trending() -> list:
    """Get trending Solana pools from GeckoTerminal."""
    url = "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json().get("data", [])
    except Exception as e:
        print(f"GeckoTerminal error: {e}")
    return []


def analyze_velocity(pair_data: dict, source: str = "dexscreener") -> Optional[VelocitySignal]:
    """Analyze a pair for velocity strike signal."""
    
    if source == "dexscreener":
        return _analyze_dexscreener(pair_data)
    elif source == "gecko":
        return _analyze_gecko(pair_data)
    return None


def _analyze_dexscreener(pair: dict) -> Optional[VelocitySignal]:
    """Analyze DexScreener pair data."""
    try:
        volume = pair.get("volume", {})
        price_change = pair.get("priceChange", {})
        
        vol_1h = float(volume.get("h1", 0) or 0)
        vol_6h = float(volume.get("h6", 0) or 0)
        vol_6h_avg = vol_6h / 6 if vol_6h > 0 else 0
        
        price_1h = float(price_change.get("h1", 0) or 0)
        
        if vol_6h_avg == 0:
            return None
        
        volume_ratio = vol_1h / vol_6h_avg
        
        # Check for velocity strike
        if volume_ratio >= VOLUME_MULTIPLIER and abs(price_1h) < PRICE_FLAT_THRESHOLD:
            strength = _calc_strength(volume_ratio, price_1h)
            
            return VelocitySignal(
                token=pair.get("baseToken", {}).get("address", ""),
                symbol=pair.get("baseToken", {}).get("symbol", "???"),
                pool_address=pair.get("pairAddress", ""),
                volume_1h=vol_1h,
                volume_6h_avg=vol_6h_avg,
                volume_ratio=volume_ratio,
                price_change_1h=price_1h,
                signal_strength=strength,
                url=pair.get("url", "")
            )
    except Exception as e:
        print(f"Analysis error: {e}")
    return None


def _analyze_gecko(pool: dict) -> Optional[VelocitySignal]:
    """Analyze GeckoTerminal pool data."""
    try:
        attrs = pool.get("attributes", {})
        volume = attrs.get("volume_usd", {})
        price_change = attrs.get("price_change_percentage", {})
        
        vol_1h = float(volume.get("h1", 0) or 0)
        vol_6h = float(volume.get("h6", 0) or 0)
        vol_6h_avg = vol_6h / 6 if vol_6h > 0 else 0
        
        price_1h = float(price_change.get("h1", 0) or 0)
        
        if vol_6h_avg == 0:
            return None
        
        volume_ratio = vol_1h / vol_6h_avg
        
        # Check for velocity strike
        if volume_ratio >= VOLUME_MULTIPLIER and abs(price_1h) < PRICE_FLAT_THRESHOLD:
            strength = _calc_strength(volume_ratio, price_1h)
            
            return VelocitySignal(
                token=pool.get("id", "").replace("solana_", ""),
                symbol=attrs.get("name", "???").split("/")[0].strip(),
                pool_address=attrs.get("address", ""),
                volume_1h=vol_1h,
                volume_6h_avg=vol_6h_avg,
                volume_ratio=volume_ratio,
                price_change_1h=price_1h,
                signal_strength=strength,
                url=f"https://www.geckoterminal.com/solana/pools/{attrs.get('address', '')}"
            )
    except Exception as e:
        print(f"Analysis error: {e}")
    return None


def _calc_strength(volume_ratio: float, price_change: float) -> str:
    """Calculate signal strength."""
    # Higher volume + flatter price = stronger signal
    if volume_ratio >= 5.0 and abs(price_change) < 2.0:
        return "STRONG"
    elif volume_ratio >= 4.0 and abs(price_change) < 3.0:
        return "MODERATE"
    else:
        return "WEAK"


def scan_trending_for_velocity() -> list[VelocitySignal]:
    """Scan trending pools for velocity strike signals."""
    signals = []
    
    print("Scanning GeckoTerminal trending pools...")
    trending = get_gecko_trending()
    
    for pool in trending:
        signal = analyze_velocity(pool, source="gecko")
        if signal:
            signals.append(signal)
    
    return signals


def check_token(token_address: str) -> Optional[VelocitySignal]:
    """Check a specific token for velocity strike."""
    print(f"Checking {token_address}...")
    data = get_dexscreener_data(token_address)
    if data:
        return analyze_velocity(data, source="dexscreener")
    return None


def format_signal(signal: VelocitySignal) -> str:
    """Format signal for display."""
    return f"""
🎯 VELOCITY STRIKE [{signal.signal_strength}]
Token: {signal.symbol}
Volume 1h: ${signal.volume_1h:,.0f}
Avg hourly: ${signal.volume_6h_avg:,.0f}
Volume ratio: {signal.volume_ratio:.1f}x
Price change 1h: {signal.price_change_1h:+.2f}%
{signal.url}
"""


# --- CLI ---
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        # Check specific token
        token = sys.argv[1]
        signal = check_token(token)
        if signal:
            print(format_signal(signal))
        else:
            print(f"No velocity strike signal for {token}")
    else:
        # Scan trending
        signals = scan_trending_for_velocity()
        
        if signals:
            print(f"\n{'='*50}")
            print(f"Found {len(signals)} velocity strike signals:")
            print('='*50)
            for sig in sorted(signals, key=lambda x: x.volume_ratio, reverse=True):
                print(format_signal(sig))
        else:
            print("No velocity strike signals in trending pools right now.")
