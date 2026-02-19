"""
Skill B: Orderbook Wall Scout ("The L1 Orderbook Scout")

Strategy: Detect large buy/sell walls in the orderbook and trade with them.
- If a huge buy wall appears → Potential support, consider LONG
- If a huge sell wall appears → Potential resistance, consider SHORT

Combines with Grok sentiment for confirmation.
"""
import requests
import json
from datetime import datetime
from config import (
    MAINNET_API_URL,
    TRADING_PAIRS,
    ORDERBOOK_CONFIG,
    XAI_API_KEY,
)


def get_orderbook(symbol: str, depth: int = 20) -> dict:
    """Fetch L2 orderbook data from Hyperliquid."""
    try:
        response = requests.post(
            f"{MAINNET_API_URL}/info",
            json={
                "type": "l2Book",
                "coin": symbol
            }
        )
        data = response.json()
        
        if 'levels' not in data:
            return None
        
        bids = []
        asks = []
        
        for level in data['levels'][0]:  # Bids
            price = float(level['px'])
            size = float(level['sz'])
            bids.append({'price': price, 'size': size, 'value_usd': price * size})
        
        for level in data['levels'][1]:  # Asks
            price = float(level['px'])
            size = float(level['sz'])
            asks.append({'price': price, 'size': size, 'value_usd': price * size})
        
        return {
            'symbol': symbol,
            'bids': bids,
            'asks': asks,
            'best_bid': bids[0]['price'] if bids else 0,
            'best_ask': asks[0]['price'] if asks else 0,
            'spread_pct': ((asks[0]['price'] - bids[0]['price']) / bids[0]['price'] * 100) if bids and asks else 0,
            'timestamp': datetime.now().isoformat(),
        }
    except Exception as e:
        print(f"[Orderbook] Error fetching {symbol}: {e}")
        return None


def detect_walls(orderbook: dict, threshold_usd: float = None) -> list:
    """Detect significant buy/sell walls in the orderbook."""
    if not orderbook:
        return []
    
    if threshold_usd is None:
        threshold_usd = ORDERBOOK_CONFIG['wall_threshold_usd']
    
    walls = []
    
    # Check bids for buy walls
    for i, bid in enumerate(orderbook['bids'][:10]):
        if bid['value_usd'] >= threshold_usd:
            distance_pct = (orderbook['best_bid'] - bid['price']) / orderbook['best_bid'] * 100
            walls.append({
                'type': 'BUY_WALL',
                'side': 'bid',
                'price': bid['price'],
                'size': bid['size'],
                'value_usd': bid['value_usd'],
                'distance_pct': distance_pct,
                'level': i,
            })
    
    # Check asks for sell walls
    for i, ask in enumerate(orderbook['asks'][:10]):
        if ask['value_usd'] >= threshold_usd:
            distance_pct = (ask['price'] - orderbook['best_ask']) / orderbook['best_ask'] * 100
            walls.append({
                'type': 'SELL_WALL',
                'side': 'ask',
                'price': ask['price'],
                'size': ask['size'],
                'value_usd': ask['value_usd'],
                'distance_pct': distance_pct,
                'level': i,
            })
    
    return walls


def get_grok_sentiment(symbol: str) -> dict:
    """Get sentiment analysis from Grok for the asset."""
    if not XAI_API_KEY:
        return {'score': None, 'reason': 'No API key configured'}
    
    try:
        response = requests.post(
            "https://api.x.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {XAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "grok-3",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a crypto sentiment analyst. Analyze current X/Twitter sentiment. Respond only in JSON."
                    },
                    {
                        "role": "user", 
                        "content": f"""Analyze current sentiment on X for ${symbol} (crypto).
Is the sentiment bullish or bearish right now?

Respond in JSON:
{{
  "sentiment_score": <1-10, 10=very bullish>,
  "direction": "<bullish|bearish|neutral>",
  "confidence": <0.0-1.0>,
  "key_narratives": ["<narrative1>", "<narrative2>"],
  "summary": "<1 sentence>"
}}"""
                    }
                ],
                "temperature": 0.3,
            },
            timeout=30,
        )
        
        if response.status_code != 200:
            return {'score': None, 'reason': f'API error: {response.status_code}'}
        
        data = response.json()
        content = data['choices'][0]['message']['content']
        
        # Parse JSON from response
        json_match = content[content.find('{'):content.rfind('}')+1]
        sentiment = json.loads(json_match)
        
        return {
            'score': sentiment.get('sentiment_score'),
            'direction': sentiment.get('direction'),
            'confidence': sentiment.get('confidence'),
            'narratives': sentiment.get('key_narratives', []),
            'summary': sentiment.get('summary'),
        }
    except Exception as e:
        print(f"[Grok] Error: {e}")
        return {'score': None, 'reason': str(e)}


def generate_wall_signals():
    """Generate trading signals based on orderbook walls + sentiment."""
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 📊 Scanning Orderbooks for Walls...")
    
    signals = []
    
    for symbol in TRADING_PAIRS:
        orderbook = get_orderbook(symbol)
        if not orderbook:
            continue
        
        walls = detect_walls(orderbook)
        
        if not walls:
            continue
        
        print(f"\n  {symbol}: Found {len(walls)} wall(s)")
        
        for wall in walls:
            print(f"    {wall['type']}: ${wall['value_usd']:,.0f} @ {wall['price']:.2f}")
            
            # Determine signal direction
            if wall['type'] == 'BUY_WALL':
                direction = 'LONG'
                entry_price = wall['price'] * 1.001  # Slightly above wall
            else:
                direction = 'SHORT'
                entry_price = wall['price'] * 0.999  # Slightly below wall
            
            # Get sentiment confirmation
            sentiment = None
            if ORDERBOOK_CONFIG['sentiment_required']:
                sentiment = get_grok_sentiment(symbol)
                
                if sentiment.get('score'):
                    print(f"    Sentiment: {sentiment['score']}/10 ({sentiment.get('direction', 'unknown')})")
            
            # Build signal
            signal = {
                'symbol': symbol,
                'wall': wall,
                'direction': direction,
                'entry_price': entry_price,
                'sentiment': sentiment,
                'timestamp': datetime.now().isoformat(),
            }
            
            # Determine action
            sentiment_ok = (
                not ORDERBOOK_CONFIG['sentiment_required'] or
                sentiment is None or
                sentiment.get('score') is None or
                (direction == 'LONG' and sentiment.get('score', 0) >= ORDERBOOK_CONFIG['min_sentiment_score']) or
                (direction == 'SHORT' and sentiment.get('score', 10) <= (10 - ORDERBOOK_CONFIG['min_sentiment_score']))
            )
            
            if wall['distance_pct'] < 1.0 and sentiment_ok:  # Wall within 1%
                signal['action'] = 'TRADE'
                signal['confidence'] = 0.7 if sentiment_ok else 0.5
            elif wall['distance_pct'] < 2.0:
                signal['action'] = 'WATCH'
                signal['reason'] = 'Wall detected but not close enough'
            else:
                signal['action'] = 'SKIP'
                signal['reason'] = 'Wall too far from current price'
            
            signals.append(signal)
    
    return signals


def display_orderbook_summary(symbol: str):
    """Display a formatted orderbook summary."""
    orderbook = get_orderbook(symbol)
    if not orderbook:
        print(f"Could not fetch orderbook for {symbol}")
        return
    
    print(f"\n{'='*60}")
    print(f"  📊 {symbol} ORDERBOOK")
    print(f"{'='*60}")
    print(f"  Best Bid: ${orderbook['best_bid']:,.2f}")
    print(f"  Best Ask: ${orderbook['best_ask']:,.2f}")
    print(f"  Spread: {orderbook['spread_pct']:.4f}%")
    print(f"\n  TOP BIDS (Buy Orders)")
    for i, bid in enumerate(orderbook['bids'][:5]):
        wall_marker = " 🧱 WALL" if bid['value_usd'] >= ORDERBOOK_CONFIG['wall_threshold_usd'] else ""
        print(f"    {i+1}. ${bid['price']:,.2f} | {bid['size']:.4f} | ${bid['value_usd']:,.0f}{wall_marker}")
    
    print(f"\n  TOP ASKS (Sell Orders)")
    for i, ask in enumerate(orderbook['asks'][:5]):
        wall_marker = " 🧱 WALL" if ask['value_usd'] >= ORDERBOOK_CONFIG['wall_threshold_usd'] else ""
        print(f"    {i+1}. ${ask['price']:,.2f} | {ask['size']:.4f} | ${ask['value_usd']:,.0f}{wall_marker}")
    print(f"{'='*60}\n")


# Run standalone
if __name__ == "__main__":
    print("🦀 Hyperliquid Orderbook Wall Scanner")
    
    for symbol in TRADING_PAIRS[:3]:
        display_orderbook_summary(symbol)
    
    print("\n📊 Generating Trading Signals...")
    signals = generate_wall_signals()
    
    for sig in signals:
        if sig['action'] == 'TRADE':
            print(f"\n✅ SIGNAL: {sig['direction']} {sig['symbol']}")
            print(f"   Wall: ${sig['wall']['value_usd']:,.0f} @ {sig['wall']['price']}")
            print(f"   Entry: ${sig['entry_price']:,.2f} | Confidence: {sig['confidence']:.2f}")
