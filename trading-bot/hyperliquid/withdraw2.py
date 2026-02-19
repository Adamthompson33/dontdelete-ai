from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
import eth_account, sys
sys.stdout.reconfigure(encoding='utf-8')

DEST = '0xc035967c19f5c984517ee136110a64635d0f04ce'

with open(r'C:\Users\adamt\clawd\.secrets\hyperliquid-bot.key', 'r') as f:
    key = f.read().strip()

account = eth_account.Account.from_key(key)
info = Info('https://api.hyperliquid.xyz', skip_ws=True)
exchange = Exchange(account, 'https://api.hyperliquid.xyz')

user_state = info.user_state(account.address)
margin = user_state.get('marginSummary', {})
account_value = float(margin.get('accountValue', 0))
print(f'Account: ${account_value:,.2f}')

# Withdraw via bridge (leaves small dust)
amount = round(account_value - 0.50, 2)  # leave 50c buffer
print(f'Withdrawing ${amount:,.2f} to {DEST}...')
result = exchange.withdraw_from_bridge(amount, DEST)
print(f'Result: {result}')
