"""
Withdraw all USDC from Hyperliquid to specified address
"""
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
import eth_account
import sys
sys.stdout.reconfigure(encoding='utf-8')

DESTINATION = '0xc035967c19f5c984517ee136110a64635d0f04ce'

with open(r'C:\Users\adamt\clawd\.secrets\hyperliquid-bot.key', 'r') as f:
    key = f.read().strip()

account = eth_account.Account.from_key(key)
API_URL = 'https://api.hyperliquid.xyz'
info = Info(API_URL, skip_ws=True)
exchange = Exchange(account, API_URL)

# Check balance
user_state = info.user_state(account.address)
margin = user_state.get('marginSummary', {})
account_value = float(margin.get('accountValue', 0))
withdrawable = float(margin.get('totalRawUsd', account_value))

print(f'Account Value: ${account_value:,.2f}')
print(f'Withdrawable: ${withdrawable:,.2f}')
print(f'Destination: {DESTINATION}')

if withdrawable <= 0:
    print('Nothing to withdraw')
    sys.exit(0)

# Withdraw - Hyperliquid withdrawal is in USDC
# Need to leave small dust for gas
withdraw_amount = round(withdrawable - 0.01, 2)
if withdraw_amount <= 0:
    print('Balance too small to withdraw')
    sys.exit(0)

print(f'\nWithdrawing ${withdraw_amount:,.2f} USDC to {DESTINATION}...')

try:
    result = exchange.withdraw(withdraw_amount, DESTINATION)
    print(f'Result: {result}')
except Exception as e:
    print(f'Error: {e}')
    # Try usd_class_transfer or alternative method
    print('\nTrying alternative withdrawal method...')
    try:
        result = exchange.usd_class_transfer(withdraw_amount, True, DESTINATION)
        print(f'Result: {result}')
    except Exception as e2:
        print(f'Alternative also failed: {e2}')
        print('You may need to withdraw manually from app.hyperliquid.xyz')
