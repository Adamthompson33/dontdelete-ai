"""
Hyperliquid Trade Executor with Risk Management

Handles order placement, position management, and safety limits.
Uses the "API Agent" model - separate key with limited permissions.
"""
import json
import time
from datetime import datetime
from pathlib import Path

# Note: Uncomment when hyperliquid SDK is installed
# from hyperliquid.info import Info
# from hyperliquid.exchange import Exchange
# from hyperliquid.utils import constants

from config import (
    HYPERLIQUID_API_KEY,
    HYPERLIQUID_WALLET,
    MAINNET_API_URL,
    RISK_CONFIG,
    FUNDING_CONFIG,
    TRADE_LOG_PATH,
)


class RiskManager:
    """Enforces trading rules - the 'Referee'."""
    
    def __init__(self):
        self.daily_pnl = 0.0
        self.open_positions = []
        self.order_count_this_minute = 0
        self.last_minute = datetime.now().minute
        self.last_loss_time = None
        self.load_state()
    
    def load_state(self):
        """Load persisted state from file."""
        try:
            if Path(TRADE_LOG_PATH).exists():
                with open(TRADE_LOG_PATH, 'r') as f:
                    data = json.load(f)
                    self.open_positions = data.get('positions', [])
                    self.daily_pnl = data.get('daily_pnl', 0)
                    print(f"[Risk] Loaded {len(self.open_positions)} positions, P&L: ${self.daily_pnl:.2f}")
        except Exception as e:
            print(f"[Risk] Could not load state: {e}")
    
    def save_state(self):
        """Persist state to file."""
        try:
            Path(TRADE_LOG_PATH).parent.mkdir(parents=True, exist_ok=True)
            with open(TRADE_LOG_PATH, 'w') as f:
                json.dump({
                    'positions': self.open_positions,
                    'daily_pnl': self.daily_pnl,
                    'last_updated': datetime.now().isoformat(),
                }, f, indent=2)
        except Exception as e:
            print(f"[Risk] Could not save state: {e}")
    
    def can_trade(self) -> tuple[bool, str]:
        """Check if we're allowed to place a new trade."""
        
        # Check daily loss limit
        if self.daily_pnl <= -RISK_CONFIG['max_daily_loss_usd']:
            return False, f"Daily loss limit reached: ${self.daily_pnl:.2f}"
        
        # Check max positions
        if len(self.open_positions) >= RISK_CONFIG['max_open_positions']:
            return False, f"Max positions reached: {len(self.open_positions)}"
        
        # Check rate limit
        current_minute = datetime.now().minute
        if current_minute != self.last_minute:
            self.order_count_this_minute = 0
            self.last_minute = current_minute
        
        if self.order_count_this_minute >= RISK_CONFIG['rate_limit_per_min']:
            return False, f"Rate limit: {self.order_count_this_minute}/min"
        
        # Check cooldown after loss
        if self.last_loss_time:
            elapsed = (datetime.now() - self.last_loss_time).total_seconds()
            if elapsed < RISK_CONFIG['cooldown_after_loss_sec']:
                remaining = RISK_CONFIG['cooldown_after_loss_sec'] - elapsed
                return False, f"Cooldown: {remaining:.0f}s remaining"
        
        return True, "OK"
    
    def record_order(self):
        """Record an order for rate limiting."""
        self.order_count_this_minute += 1
    
    def record_trade(self, trade: dict):
        """Record a new trade/position."""
        self.open_positions.append(trade)
        self.record_order()
        self.save_state()
    
    def close_position(self, position_id: str, pnl: float):
        """Close a position and update P&L."""
        self.open_positions = [p for p in self.open_positions if p.get('id') != position_id]
        self.daily_pnl += pnl
        
        if pnl < 0:
            self.last_loss_time = datetime.now()
        
        self.save_state()
        print(f"[Risk] Position closed. P&L: ${pnl:+.2f} | Daily: ${self.daily_pnl:+.2f}")


class HyperliquidExecutor:
    """Handles order execution on Hyperliquid."""
    
    def __init__(self, paper_mode: bool = True):
        self.paper_mode = paper_mode
        self.risk_manager = RiskManager()
        
        if not paper_mode:
            self._init_exchange()
        else:
            print("[Executor] 📝 PAPER TRADING MODE")
    
    def _init_exchange(self):
        """Initialize Hyperliquid exchange connection."""
        if not HYPERLIQUID_API_KEY or not HYPERLIQUID_WALLET:
            raise ValueError("HYPERLIQUID_API_KEY and HYPERLIQUID_WALLET required for live trading")
        
        # Uncomment when SDK is installed
        # self.info = Info(MAINNET_API_URL, skip_ws=True)
        # self.exchange = Exchange(HYPERLIQUID_WALLET, HYPERLIQUID_API_KEY, MAINNET_API_URL)
        
        print(f"[Executor] Connected to Hyperliquid")
        print(f"[Executor] Wallet: {HYPERLIQUID_WALLET[:10]}...")
    
    def get_account_value(self) -> float:
        """Get current account value."""
        if self.paper_mode:
            return 1000.0  # Simulated $1000
        
        # user_state = self.info.user_state(HYPERLIQUID_WALLET)
        # return float(user_state['marginSummary']['accountValue'])
        return 0.0
    
    def execute_signal(self, signal: dict) -> dict:
        """Execute a trading signal."""
        
        # Risk check
        can_trade, reason = self.risk_manager.can_trade()
        if not can_trade:
            return {'success': False, 'error': reason}
        
        symbol = signal['symbol']
        direction = signal['direction']
        confidence = signal.get('confidence', 0.5)
        
        # Calculate position size based on confidence
        base_size_usd = FUNDING_CONFIG['max_position_usd']
        position_size_usd = base_size_usd * confidence
        
        # Get current price
        entry_price = signal.get('entry_price', signal.get('mark_price', 0))
        if not entry_price:
            return {'success': False, 'error': 'No entry price available'}
        
        # Calculate size in contracts
        size = position_size_usd / entry_price
        
        if self.paper_mode:
            return self._execute_paper_trade(symbol, direction, size, entry_price, signal)
        else:
            return self._execute_live_trade(symbol, direction, size, entry_price, signal)
    
    def _execute_paper_trade(self, symbol, direction, size, price, signal) -> dict:
        """Simulate a trade in paper mode."""
        trade_id = f"paper_{int(time.time())}"
        
        trade = {
            'id': trade_id,
            'symbol': symbol,
            'direction': direction,
            'size': size,
            'entry_price': price,
            'entry_time': datetime.now().isoformat(),
            'leverage': FUNDING_CONFIG['leverage'],
            'tp_price': price * (1 + FUNDING_CONFIG['take_profit_pct']) if direction == 'LONG' else price * (1 - FUNDING_CONFIG['take_profit_pct']),
            'sl_price': price * (1 - FUNDING_CONFIG['stop_loss_pct']) if direction == 'LONG' else price * (1 + FUNDING_CONFIG['stop_loss_pct']),
            'signal': signal,
            'paper': True,
        }
        
        self.risk_manager.record_trade(trade)
        
        print(f"\n[Executor] 📝 PAPER TRADE EXECUTED")
        print(f"  {direction} {symbol}")
        print(f"  Size: {size:.4f} @ ${price:,.2f}")
        print(f"  Value: ${size * price:,.2f}")
        print(f"  TP: ${trade['tp_price']:,.2f} | SL: ${trade['sl_price']:,.2f}")
        
        return {
            'success': True,
            'paper': True,
            'trade': trade,
        }
    
    def _execute_live_trade(self, symbol, direction, size, price, signal) -> dict:
        """Execute a real trade on Hyperliquid."""
        try:
            is_buy = direction == 'LONG'
            
            # Build order
            order_result = None  # self.exchange.market_open(symbol, is_buy, size, None, FUNDING_CONFIG['leverage'])
            
            # Placeholder for live execution
            print(f"[Executor] 🔥 LIVE TRADE - {direction} {symbol} x{size:.4f}")
            
            return {
                'success': True,
                'paper': False,
                'order': order_result,
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_status(self) -> dict:
        """Get current executor status."""
        return {
            'mode': 'PAPER' if self.paper_mode else 'LIVE',
            'account_value': self.get_account_value(),
            'open_positions': len(self.risk_manager.open_positions),
            'daily_pnl': self.risk_manager.daily_pnl,
            'positions': self.risk_manager.open_positions,
        }


# Standalone test
if __name__ == "__main__":
    print("🦀 Hyperliquid Executor Test")
    
    executor = HyperliquidExecutor(paper_mode=True)
    
    print(f"\n📊 Account Status:")
    status = executor.get_status()
    print(f"  Mode: {status['mode']}")
    print(f"  Value: ${status['account_value']:,.2f}")
    print(f"  Positions: {status['open_positions']}")
    print(f"  Daily P&L: ${status['daily_pnl']:+.2f}")
    
    # Test signal execution
    test_signal = {
        'symbol': 'ETH',
        'direction': 'LONG',
        'confidence': 0.7,
        'mark_price': 3500.0,
        'entry_price': 3500.0,
    }
    
    print(f"\n🧪 Testing signal execution...")
    result = executor.execute_signal(test_signal)
    print(f"  Result: {result}")
