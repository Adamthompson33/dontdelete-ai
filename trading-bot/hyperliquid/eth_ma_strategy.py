"""
ETH 13/33 MA Cross Strategy
============================
- Short 10x when 13 MA < 33 MA
- Long 5x when 13 MA > 33 MA  
- 4% stop loss both ways
"""

from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
import eth_account
import json
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# Config
COIN = "ETH"
LEVERAGE_SHORT = 10
LEVERAGE_LONG = 5
STOP_LOSS_PCT = 0.04  # 4%
POSITION_SIZE_USD = 20  # Start small with $61 account

# Load wallet
with open(r'C:\Users\adamt\clawd\.secrets\hyperliquid-bot.key', 'r') as f:
    key = f.read().strip()

account = eth_account.Account.from_key(key)
API_URL = 'https://api.hyperliquid.xyz'

info = Info(API_URL, skip_ws=True)
exchange = Exchange(account, API_URL)

def get_ma_status():
    """Get 13/33 MA values and determine regime."""
    import time
    
    # Get daily candles - need timestamps in ms
    end_time = int(time.time() * 1000)
    start_time = end_time - (50 * 24 * 60 * 60 * 1000)  # 50 days ago
    
    candles = info.candles_snapshot(COIN, "1d", start_time, end_time)
    
    closes = [float(c['c']) for c in candles]
    
    # Calculate MAs
    ma13 = sum(closes[-13:]) / 13
    ma33 = sum(closes[-33:]) / 33
    current_price = closes[-1]
    
    # Determine regime
    if ma13 < ma33:
        regime = "SHORT"
    else:
        regime = "LONG"
    
    diff_pct = ((ma13 - ma33) / ma33) * 100
    
    return {
        'ma13': ma13,
        'ma33': ma33,
        'price': current_price,
        'regime': regime,
        'diff_pct': diff_pct
    }

def get_current_position():
    """Get current ETH position if any."""
    user_state = info.user_state(account.address)
    positions = user_state.get('assetPositions', [])
    
    for pos in positions:
        p = pos['position']
        if p['coin'] == COIN and float(p['szi']) != 0:
            return {
                'size': float(p['szi']),
                'entry': float(p['entryPx']),
                'pnl': float(p.get('unrealizedPnl', 0)),
                'side': 'LONG' if float(p['szi']) > 0 else 'SHORT'
            }
    return None

def close_position():
    """Close any existing ETH position."""
    pos = get_current_position()
    if pos:
        print(f"Closing {pos['side']} position: {pos['size']} ETH")
        
        # Get current price for limit order
        mids = info.all_mids()
        price = float(mids[COIN])
        
        # Close with market-like limit order
        is_buy = pos['side'] == 'SHORT'  # Buy to close short
        close_size = abs(pos['size'])
        limit_price = round(price * 1.002) if is_buy else round(price * 0.998)
        
        result = exchange.order(
            name=COIN,
            is_buy=is_buy,
            sz=close_size,
            limit_px=limit_price,
            order_type={'limit': {'tif': 'Ioc'}},
            reduce_only=True
        )
        
        statuses = result.get('response', {}).get('data', {}).get('statuses', [])
        for status in statuses:
            if 'filled' in status:
                print(f"✅ Closed @ ${float(status['filled']['avgPx']):,.2f}")
                return True
            elif 'error' in status:
                print(f"❌ Error: {status['error']}")
        return False
    return True

def enter_position(direction: str):
    """Enter a position with stop loss."""
    mids = info.all_mids()
    price = float(mids[COIN])
    
    is_short = direction == "SHORT"
    leverage = LEVERAGE_SHORT if is_short else LEVERAGE_LONG
    
    # Calculate size
    size = round(POSITION_SIZE_USD / price, 4)
    
    # Entry price (slightly worse to ensure fill)
    if is_short:
        entry_price = round(price * 0.998)  # Sell slightly below
        stop_price = round(price * (1 + STOP_LOSS_PCT))  # Stop above
    else:
        entry_price = round(price * 1.002)  # Buy slightly above
        stop_price = round(price * (1 - STOP_LOSS_PCT))  # Stop below
    
    print(f"\n{'='*50}")
    print(f"ENTERING {direction} @ {leverage}x")
    print(f"{'='*50}")
    print(f"Price: ${price:,.2f}")
    print(f"Size: {size} ETH (~${POSITION_SIZE_USD})")
    print(f"Stop Loss: ${stop_price:,.2f} ({STOP_LOSS_PCT*100:.0f}%)")
    
    # Set leverage first
    try:
        exchange.update_leverage(leverage, COIN)
    except Exception as e:
        print(f"Leverage update: {e}")
    
    # Place entry order
    result = exchange.order(
        name=COIN,
        is_buy=not is_short,
        sz=size,
        limit_px=entry_price,
        order_type={'limit': {'tif': 'Ioc'}},
        reduce_only=False
    )
    
    filled = False
    fill_price = 0
    statuses = result.get('response', {}).get('data', {}).get('statuses', [])
    for status in statuses:
        if 'filled' in status:
            filled = True
            fill_price = float(status['filled']['avgPx'])
            print(f"✅ FILLED @ ${fill_price:,.2f}")
        elif 'error' in status:
            print(f"❌ Error: {status['error']}")
            return False
    
    if not filled:
        print("❌ Order not filled")
        return False
    
    # Place stop loss
    # Recalculate stop based on actual fill
    if is_short:
        stop_price = round(fill_price * (1 + STOP_LOSS_PCT))
    else:
        stop_price = round(fill_price * (1 - STOP_LOSS_PCT))
    
    print(f"Setting stop loss @ ${stop_price:,.2f}")
    
    try:
        stop_result = exchange.order(
            name=COIN,
            is_buy=is_short,  # Buy to close short, sell to close long
            sz=size,
            limit_px=stop_price,
            order_type={
                'trigger': {
                    'triggerPx': stop_price,
                    'isMarket': True,
                    'tpsl': 'sl'
                }
            },
            reduce_only=True
        )
        print(f"✅ Stop loss set")
    except Exception as e:
        print(f"⚠️ Stop loss error: {e}")
    
    return True

def run_strategy():
    """Main strategy logic."""
    print(f"\n{'='*60}")
    print(f"ETH 13/33 MA STRATEGY - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}")
    
    # Get account info
    user_state = info.user_state(account.address)
    margin = user_state.get('marginSummary', {})
    account_value = float(margin.get('accountValue', 0))
    print(f"Account Value: ${account_value:,.2f}")
    
    # Get MA status
    ma = get_ma_status()
    print(f"\n13 MA: ${ma['ma13']:,.2f}")
    print(f"33 MA: ${ma['ma33']:,.2f}")
    print(f"Diff: {ma['diff_pct']:+.2f}%")
    print(f"Signal: {ma['regime']}")
    
    # Get current position
    pos = get_current_position()
    if pos:
        print(f"\nCurrent Position: {pos['side']} {abs(pos['size'])} ETH @ ${pos['entry']:,.2f}")
        print(f"PnL: ${pos['pnl']:,.2f}")
    else:
        print(f"\nNo current position")
    
    # Check if we need to flip
    if pos:
        if pos['side'] != ma['regime']:
            print(f"\n⚡ SIGNAL FLIP: {pos['side']} → {ma['regime']}")
            print("Closing current position...")
            close_position()
            print("Entering new position...")
            enter_position(ma['regime'])
        else:
            print(f"\n✅ Already {ma['regime']} - holding position")
    else:
        print(f"\n🎯 No position - entering {ma['regime']}")
        enter_position(ma['regime'])
    
    # Final status
    pos = get_current_position()
    if pos:
        print(f"\n{'='*60}")
        print(f"POSITION: {pos['side']} {abs(pos['size'])} ETH @ ${pos['entry']:,.2f}")
        print(f"{'='*60}")

def check_status():
    """Just check status without trading."""
    print(f"\n{'='*60}")
    print(f"ETH STATUS CHECK - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}")
    
    ma = get_ma_status()
    print(f"13 MA: ${ma['ma13']:,.2f}")
    print(f"33 MA: ${ma['ma33']:,.2f}")
    print(f"Diff: {ma['diff_pct']:+.2f}%")
    print(f"Signal: {ma['regime']}")
    
    pos = get_current_position()
    if pos:
        print(f"\nPosition: {pos['side']} {abs(pos['size'])} ETH @ ${pos['entry']:,.2f}")
        print(f"PnL: ${pos['pnl']:,.2f}")
    else:
        print(f"\nNo position")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "status":
        check_status()
    else:
        run_strategy()
