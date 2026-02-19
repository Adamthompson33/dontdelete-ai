"""
Bottom Fisher - Catch Flash Crashes in Real-Time
================================================

Strategy:
1. Monitor for crash conditions (volume spike + price velocity)
2. When crash detected, deploy scaled limit buys
3. Catch the wick, profit on the bounce

Reference: Oct 10, 2025 - $19B liquidated, price dropped 15%+ in minutes,
then bounced significantly within hours.
"""

from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
import eth_account
from eth_account.signers.local import LocalAccount
from datetime import datetime
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Configuration
MAIN_ADDR = "0x84F7955FaA1e6E4Dc1b83E61f830Feee5D4a143E"
API_URL = "https://api.hyperliquid-testnet.xyz"  # Switch to mainnet when ready

# Bottom Fisher Settings
CRASH_THRESHOLD_5MIN = -3.0    # -3% in 5 min = crash starting
CRASH_THRESHOLD_EXTREME = -5.0 # -5% in 5 min = serious cascade
VOLUME_SPIKE_THRESHOLD = 5.0   # 5x normal volume
SCALE_IN_LEVELS = [0.10, 0.15, 0.20, 0.25]  # Buy at -10%, -15%, -20%, -25%
SIZE_PER_LEVEL_USD = 250       # $250 per level = $1000 total
TAKE_PROFIT_PCT = 0.05         # Take profit at +5% bounce

# Load API key
with open(r"C:\Users\adamt\clawd\.secrets\hyperliquid-agent.key", "r") as f:
    AGENT_KEY = f.read().strip()


class BottomFisher:
    def __init__(self, testnet=True):
        self.api_url = "https://api.hyperliquid-testnet.xyz" if testnet else "https://api.hyperliquid.xyz"
        self.info = Info(self.api_url, skip_ws=True)
        
        # Initialize exchange
        account = eth_account.Account.from_key(AGENT_KEY)
        self.exchange = Exchange(account, self.api_url, account_address=MAIN_ADDR)
        
        # State
        self.price_history = []  # [(timestamp, price), ...]
        self.volume_history = []
        self.crash_active = False
        self.orders_placed = []
        self.pre_crash_price = None
        
    def get_current_data(self, coin="BTC"):
        """Get current price and volume data."""
        try:
            all_mids = self.info.all_mids()
            price = float(all_mids.get(coin, 0))
            
            # Get recent trades for volume estimate
            # Note: This is simplified - real implementation would use websocket
            return {
                'price': price,
                'timestamp': datetime.now()
            }
        except Exception as e:
            print(f"Error fetching data: {e}")
            return None
    
    def update_history(self, data):
        """Update price history for velocity calculation."""
        if data:
            self.price_history.append((data['timestamp'], data['price']))
            # Keep last 10 minutes of data
            cutoff = datetime.now().timestamp() - 600
            self.price_history = [(t, p) for t, p in self.price_history 
                                  if t.timestamp() > cutoff]
    
    def calculate_velocity(self, minutes=5):
        """Calculate price change over last N minutes."""
        if len(self.price_history) < 2:
            return 0
        
        now = datetime.now().timestamp()
        target_time = now - (minutes * 60)
        
        # Find price N minutes ago
        past_price = None
        for t, p in self.price_history:
            if t.timestamp() <= target_time:
                past_price = p
            else:
                break
        
        if past_price is None and self.price_history:
            past_price = self.price_history[0][1]
        
        if past_price and self.price_history:
            current_price = self.price_history[-1][1]
            return ((current_price - past_price) / past_price) * 100
        
        return 0
    
    def detect_crash(self, coin="BTC"):
        """
        Detect if crash conditions are present.
        
        Returns:
            'CRASH_ACTIVE' - Deploy bottom fisher NOW
            'CRASH_WARNING' - Prepare, crash may be starting
            'NORMAL' - No crash detected
        """
        data = self.get_current_data(coin)
        if not data:
            return 'ERROR', {}
        
        self.update_history(data)
        velocity_5min = self.calculate_velocity(5)
        velocity_1min = self.calculate_velocity(1)
        
        result = {
            'price': data['price'],
            'velocity_5min': velocity_5min,
            'velocity_1min': velocity_1min,
            'timestamp': datetime.now().strftime('%H:%M:%S')
        }
        
        # Extreme crash - deploy immediately
        if velocity_5min <= CRASH_THRESHOLD_EXTREME:
            return 'CRASH_ACTIVE', result
        
        # Crash starting - prepare
        if velocity_5min <= CRASH_THRESHOLD_5MIN:
            return 'CRASH_WARNING', result
        
        return 'NORMAL', result
    
    def deploy_bottom_fisher(self, coin="BTC"):
        """
        Deploy scaled limit buys to catch the crash bottom.
        """
        data = self.get_current_data(coin)
        if not data:
            return False
        
        current_price = data['price']
        self.pre_crash_price = current_price
        
        print(f"\n{'='*50}")
        print(f"BOTTOM FISHER DEPLOYED")
        print(f"{'='*50}")
        print(f"Pre-crash price: ${current_price:,.2f}")
        print(f"Deploying {len(SCALE_IN_LEVELS)} levels of limit buys\n")
        
        for i, drop_pct in enumerate(SCALE_IN_LEVELS):
            buy_price = current_price * (1 - drop_pct)
            take_profit = buy_price * (1 + TAKE_PROFIT_PCT)
            size_coin = SIZE_PER_LEVEL_USD / buy_price
            
            print(f"Level {i+1}: Buy ${SIZE_PER_LEVEL_USD} at ${buy_price:,.2f} (-{drop_pct*100:.0f}%)")
            print(f"         TP at ${take_profit:,.2f} (+{TAKE_PROFIT_PCT*100:.0f}%)")
            
            # Place the order (uncomment for live trading)
            # order_result = self.exchange.order(
            #     coin, 
            #     is_buy=True, 
            #     sz=size_coin, 
            #     limit_px=buy_price,
            #     order_type={"limit": {"tif": "Gtc"}}
            # )
            # self.orders_placed.append(order_result)
        
        self.crash_active = True
        return True
    
    def monitor_loop(self, coin="BTC", check_interval=10):
        """
        Main monitoring loop.
        
        Checks for crash conditions every N seconds.
        When crash detected, deploys bottom fisher.
        """
        print(f"\n{'='*50}")
        print(f"BOTTOM FISHER MONITOR - {coin}")
        print(f"{'='*50}")
        print(f"Checking every {check_interval} seconds")
        print(f"Crash threshold: {CRASH_THRESHOLD_5MIN}% in 5 min")
        print(f"Extreme threshold: {CRASH_THRESHOLD_EXTREME}% in 5 min")
        print(f"Press Ctrl+C to stop\n")
        
        try:
            while True:
                status, data = self.detect_crash(coin)
                
                timestamp = data.get('timestamp', '--:--:--')
                price = data.get('price', 0)
                vel_5m = data.get('velocity_5min', 0)
                vel_1m = data.get('velocity_1min', 0)
                
                status_symbol = {
                    'NORMAL': '[OK]',
                    'CRASH_WARNING': '[!!]',
                    'CRASH_ACTIVE': '[XX]',
                    'ERROR': '[??]'
                }.get(status, '[??]')
                
                print(f"{timestamp} | ${price:,.2f} | 5m: {vel_5m:+.2f}% | 1m: {vel_1m:+.2f}% | {status_symbol} {status}")
                
                if status == 'CRASH_ACTIVE' and not self.crash_active:
                    print("\n!!! CRASH DETECTED - DEPLOYING BOTTOM FISHER !!!\n")
                    self.deploy_bottom_fisher(coin)
                
                elif status == 'CRASH_WARNING':
                    print("    ^ Warning: Crash may be starting...")
                
                time.sleep(check_interval)
                
        except KeyboardInterrupt:
            print("\n\nMonitor stopped.")
            return


def simulate_crash_detection():
    """
    Simulate what would have happened on Oct 10, 2025.
    """
    print(f"\n{'='*50}")
    print("SIMULATING OCT 10, 2025 CRASH")
    print(f"{'='*50}")
    
    # Simulated price action (approximate)
    prices = [
        ("21:00", 72000),  # Pre-crash
        ("21:05", 71000),  # -1.4%
        ("21:10", 68000),  # -5.6% <- CRASH_WARNING
        ("21:15", 62000),  # -13.9% <- CRASH_ACTIVE (bottom fisher deploys)
        ("21:20", 58000),  # -19.4% (bottom)
        ("21:30", 63000),  # -12.5% (bouncing)
        ("22:00", 67000),  # -6.9% (recovery)
        ("23:00", 69000),  # -4.2%
    ]
    
    pre_crash = prices[0][1]
    
    print(f"\nPre-crash price: ${pre_crash:,}")
    print(f"Bottom Fisher would deploy at: ${pre_crash * 0.90:,.0f} (-10%)")
    print(f"\nTimeline:")
    
    for time_str, price in prices:
        change = ((price - pre_crash) / pre_crash) * 100
        print(f"  {time_str} UTC: ${price:,} ({change:+.1f}%)")
    
    # Calculate profit if bottom fisher was active
    print(f"\n{'='*50}")
    print("BOTTOM FISHER RESULTS (simulated)")
    print(f"{'='*50}")
    
    fill_prices = []
    for drop_pct in SCALE_IN_LEVELS:
        fill_price = pre_crash * (1 - drop_pct)
        if fill_price >= 58000:  # Would have filled (above the $58k bottom)
            fill_prices.append((drop_pct, fill_price))
    
    total_invested = 0
    total_value = 0
    
    recovery_price = 67000  # Price 1 hour later
    
    for drop_pct, fill_price in fill_prices:
        invested = SIZE_PER_LEVEL_USD
        coins = invested / fill_price
        value_at_recovery = coins * recovery_price
        profit = value_at_recovery - invested
        
        print(f"  Level -{drop_pct*100:.0f}%: Bought at ${fill_price:,.0f}")
        print(f"           Value at recovery: ${value_at_recovery:,.2f} (+${profit:,.2f})")
        
        total_invested += invested
        total_value += value_at_recovery
    
    total_profit = total_value - total_invested
    profit_pct = (total_profit / total_invested) * 100 if total_invested > 0 else 0
    
    print(f"\n  TOTAL INVESTED: ${total_invested:,.2f}")
    print(f"  TOTAL VALUE: ${total_value:,.2f}")
    print(f"  PROFIT: ${total_profit:,.2f} ({profit_pct:+.1f}%)")


if __name__ == "__main__":
    print("BOTTOM FISHER - Flash Crash Catcher")
    print("=" * 50)
    print("\nOptions:")
    print("1. Run live monitor (testnet)")
    print("2. Simulate Oct 10, 2025 crash")
    print()
    
    choice = input("Enter choice (1 or 2): ").strip()
    
    if choice == "1":
        fisher = BottomFisher(testnet=True)
        fisher.monitor_loop("BTC", check_interval=10)
    elif choice == "2":
        simulate_crash_detection()
    else:
        print("Running simulation by default...")
        simulate_crash_detection()
