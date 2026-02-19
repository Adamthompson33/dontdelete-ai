"""
Close all positions on Hyperliquid
"""
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
import eth_account
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\adamt\clawd\.secrets\hyperliquid-bot.key', 'r') as f:
    key = f.read().strip()

account = eth_account.Account.from_key(key)
API_URL = 'https://api.hyperliquid.xyz'
info = Info(API_URL, skip_ws=True)
exchange = Exchange(account, API_URL)

# Get positions
user_state = info.user_state(account.address)
positions = user_state.get('assetPositions', [])

closed_any = False
for pos in positions:
    p = pos['position']
    size = float(p['szi'])
    if size != 0:
        closed_any = True
        coin = p['coin']
        # Close position - sell if long, buy if short
        is_buy = size < 0
        close_size = abs(size)
        
        # Get current price
        mids = info.all_mids()
        price = float(mids[coin])
        # Set limit price for immediate fill
        limit_price = round(price * 0.999) if not is_buy else round(price * 1.001)
        
        action = "BUY" if is_buy else "SELL"
        print(f'Closing {coin}: {action} {close_size} @ ${limit_price:,.0f}')
        
        result = exchange.order(
            name=coin,
            is_buy=is_buy,
            sz=close_size,
            limit_px=limit_price,
            order_type={'limit': {'tif': 'Ioc'}},
            reduce_only=True
        )
        
        statuses = result.get('response', {}).get('data', {}).get('statuses', [])
        for status in statuses:
            if 'filled' in status:
                filled = status['filled']
                print(f"✅ Closed: {filled['totalSz']} @ ${float(filled['avgPx']):,.2f}")
            elif 'error' in status:
                print(f"❌ Error: {status['error']}")

if not closed_any:
    print("No positions to close")

# Check final state
user_state = info.user_state(account.address)
margin = user_state.get('marginSummary', {})
print(f'\nAccount Value: ${float(margin.get("accountValue", 0)):,.2f}')
