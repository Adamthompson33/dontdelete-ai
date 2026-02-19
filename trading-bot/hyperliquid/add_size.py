"""Add to existing ETH short position"""
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

# Get account state
user_state = info.user_state(account.address)
margin = user_state.get('marginSummary', {})
account_value = float(margin.get('accountValue', 0))
available = float(margin.get('withdrawable', 0))

print(f'Account Value: ${account_value:,.2f}')
print(f'Available: ${available:,.2f}')

# Current position
positions = user_state.get('assetPositions', [])
current_size = 0
for pos in positions:
    p = pos['position']
    if p['coin'] == 'ETH' and float(p['szi']) != 0:
        current_size = float(p['szi'])
        entry = float(p['entryPx'])
        print(f'Current position: {current_size} ETH @ ${entry:,.2f}')

# Get current price
mids = info.all_mids()
price = float(mids['ETH'])
print(f'Current price: ${price:,.2f}')

# Use most of available margin, leave $5 buffer
add_margin = available - 5
if add_margin < 10:
    print(f'Not enough margin to add (need >$10, have ${add_margin:.2f})')
    exit()

# At 10x leverage
add_notional = add_margin * 10
add_size = round(add_notional / price, 4)

print(f'\nAdding to SHORT:')
print(f'  Margin: ${add_margin:.2f}')
print(f'  Size: {add_size} ETH (${add_notional:.2f} notional)')

# Place order - sell to add to short
limit_price = round(price * 0.998)  # Slightly below for fill

result = exchange.order(
    name='ETH',
    is_buy=False,  # Sell to short
    sz=add_size,
    limit_px=limit_price,
    order_type={'limit': {'tif': 'Ioc'}},
    reduce_only=False
)

statuses = result.get('response', {}).get('data', {}).get('statuses', [])
for status in statuses:
    if 'filled' in status:
        filled = status['filled']
        print(f"✅ Added {filled['totalSz']} ETH @ ${float(filled['avgPx']):,.2f}")
    elif 'error' in status:
        print(f"❌ Error: {status['error']}")

# Check new position
user_state = info.user_state(account.address)
positions = user_state.get('assetPositions', [])
for pos in positions:
    p = pos['position']
    if p['coin'] == 'ETH' and float(p['szi']) != 0:
        size = float(p['szi'])
        entry = float(p['entryPx'])
        pnl = float(p.get('unrealizedPnl', 0))
        print(f'\nNew total position: {size} ETH @ ${entry:,.2f}')
        print(f'PnL: ${pnl:,.2f}')

# Update stop loss for full position
new_size = abs(float(p['szi']))
new_entry = float(p['entryPx'])
stop_price = round(new_entry * 1.04)  # 4% above entry

print(f'\nUpdating stop loss to ${stop_price:,.2f}')

# Cancel existing stops first
open_orders = info.open_orders(account.address)
for order in open_orders:
    if order.get('coin') == 'ETH':
        try:
            exchange.cancel('ETH', order['oid'])
            print(f'Cancelled old order')
        except:
            pass

# Set new stop for full size
try:
    stop_result = exchange.order(
        name='ETH',
        is_buy=True,  # Buy to close short
        sz=new_size,
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
    print(f'✅ Stop loss set for full position')
except Exception as e:
    print(f'⚠️ Stop loss error: {e}')

# Final account state
user_state = info.user_state(account.address)
margin = user_state.get('marginSummary', {})
print(f'\nFinal account value: ${float(margin.get("accountValue", 0)):,.2f}')
print(f'Final margin used: ${float(margin.get("totalMarginUsed", 0)):,.2f}')
