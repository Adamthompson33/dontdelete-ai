"""
Test trade on Hyperliquid
"""
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
import eth_account
import sys
sys.stdout.reconfigure(encoding='utf-8')

# Load wallet
with open(r'C:\Users\adamt\clawd\.secrets\hyperliquid-bot.key', 'r') as f:
    key = f.read().strip()

account = eth_account.Account.from_key(key)
print(f'Wallet: {account.address}')

# Connect
API_URL = 'https://api.hyperliquid.xyz'
info = Info(API_URL, skip_ws=True)
exchange = Exchange(account, API_URL)

# Get account state
user_state = info.user_state(account.address)
margin = user_state.get('marginSummary', {})
account_value = float(margin.get('accountValue', 0))
print(f'Account Value: ${account_value:,.2f}')

# Get BTC price
mids = info.all_mids()
btc_price = float(mids['BTC'])
print(f'BTC Price: ${btc_price:,.2f}')

# Place a small test order - $10 worth of BTC
size = round(11 / btc_price, 5)  # ~$11 worth (min is $10)
limit_price = round(btc_price * 1.001)  # Round to nearest $1 (tick size)

print(f'Test order: BUY {size} BTC @ ${limit_price:,.1f}')
print('Placing order...')

result = exchange.order(
    name='BTC',
    is_buy=True,
    sz=size,
    limit_px=limit_price,
    order_type={'limit': {'tif': 'Ioc'}},  # Immediate or cancel
    reduce_only=False
)

print(f'Result: {result}')

if result.get('status') == 'ok':
    statuses = result.get('response', {}).get('data', {}).get('statuses', [])
    for status in statuses:
        if 'filled' in status:
            filled = status['filled']
            print(f"✅ FILLED: {filled['totalSz']} BTC @ ${float(filled['avgPx']):,.2f}")
        elif 'error' in status:
            print(f"❌ Error: {status['error']}")
        else:
            print(f"Status: {status}")
else:
    print(f"Order failed: {result}")

# Check position
print('\nChecking position...')
user_state = info.user_state(account.address)
positions = user_state.get('assetPositions', [])
for pos in positions:
    p = pos['position']
    if float(p['szi']) != 0:
        pnl = float(p.get('unrealizedPnl', 0))
        print(f"Position: {p['coin']} {p['szi']} @ ${float(p['entryPx']):,.2f} (PnL: ${pnl:,.2f})")
