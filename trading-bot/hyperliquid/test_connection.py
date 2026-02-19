"""
Test connection to Hyperliquid
"""
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
import eth_account
from eth_account.signers.local import LocalAccount
import sys
import os
from dotenv import load_dotenv

# Fix Windows encoding
sys.stdout.reconfigure(encoding='utf-8')

# Load config
load_dotenv()

WALLET_ADDR = os.getenv("HL_WALLET_ADDR", "0x551C4bDd737A0CE89234948C789B1DA4ae647B31")
KEY_FILE = os.getenv("HL_WALLET_KEY_FILE", r"C:\Users\adamt\clawd\.secrets\hyperliquid-bot.key")
NETWORK = os.getenv("HL_NETWORK", "mainnet")

# Set API URL based on network
if NETWORK == "testnet":
    API_URL = "https://api.hyperliquid-testnet.xyz"
else:
    API_URL = "https://api.hyperliquid.xyz"

print("=" * 50)
print(f"HYPERLIQUID {NETWORK.upper()} CONNECTION TEST")
print("=" * 50)

print(f"\nConnecting to: {API_URL}")
print(f"Wallet: {WALLET_ADDR}")

# Read the private key
with open(KEY_FILE, "r") as f:
    WALLET_KEY = f.read().strip()

# Initialize Info client (read-only)
try:
    info = Info(API_URL, skip_ws=True)
    print("\n[OK] Info client connected!")
except Exception as e:
    print(f"\n[FAIL] Info client failed: {e}")
    exit(1)

# Check account state
print("\nACCOUNT STATE:")
account_value = 0
try:
    user_state = info.user_state(WALLET_ADDR)
    
    if user_state and 'marginSummary' in user_state:
        margin = user_state['marginSummary']
        account_value = float(margin.get('accountValue', 0))
        print(f"   Account Value: ${account_value:,.2f}")
        print(f"   Total Margin: ${float(margin.get('totalMarginUsed', 0)):,.2f}")
        print(f"   Available: ${float(margin.get('withdrawable', 0)):,.2f}")
    else:
        print("   No margin data (account may need funding)")
        
except Exception as e:
    print(f"   Error fetching state: {e}")

# Check open positions
print("\nOPEN POSITIONS:")
try:
    if user_state and 'assetPositions' in user_state:
        positions = user_state['assetPositions']
        if positions:
            for pos in positions:
                p = pos['position']
                if float(p['szi']) != 0:
                    print(f"   {p['coin']}: {p['szi']} @ ${float(p['entryPx']):,.2f}")
        else:
            print("   No open positions")
    else:
        print("   No positions data")
except Exception as e:
    print(f"   Error: {e}")

# Get BTC price
print("\nCURRENT PRICES:")
try:
    all_mids = info.all_mids()
    if 'BTC' in all_mids:
        print(f"   BTC: ${float(all_mids['BTC']):,.2f}")
    if 'ETH' in all_mids:
        print(f"   ETH: ${float(all_mids['ETH']):,.2f}")
except Exception as e:
    print(f"   Error: {e}")

# Test Exchange client (write operations)
print("\nEXCHANGE CLIENT:")
try:
    account: LocalAccount = eth_account.Account.from_key(WALLET_KEY)
    print(f"   Wallet loaded: {account.address}")
    
    exchange = Exchange(account, API_URL)
    print("   [OK] Exchange client initialized")
    
except Exception as e:
    print(f"   [FAIL] Exchange client failed: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 50)
print("CONNECTION TEST COMPLETE")
print("=" * 50)

# Summary
print("\nSTATUS:")
if account_value == 0:
    print("   ⚠️  Account has $0 balance")
    print(f"   Send USDC to: {WALLET_ADDR}")
    print("   Use deBridge to bridge from Solana/ETH/Arb")
else:
    print(f"   ✅ Account funded with ${account_value:,.2f}")
    print("   Ready to trade!")
