"""
Hyperliquid Trading Bot Configuration
"""
import os
from dotenv import load_dotenv

load_dotenv()

# =============================================================================
# API KEYS (Set these in .env file or environment)
# =============================================================================
HYPERLIQUID_API_KEY = os.getenv("HYPERLIQUID_API_KEY", "")  # API Agent private key
HYPERLIQUID_WALLET = os.getenv("HYPERLIQUID_WALLET", "")    # Main wallet address
NANSEN_API_KEY = os.getenv("NANSEN_API_KEY", "wHCI8lMtIc0heMWOM0y4clnKoQOqZo8t")
XAI_API_KEY = os.getenv("XAI_API_KEY", "")  # Grok for sentiment

# =============================================================================
# HYPERLIQUID SETTINGS
# =============================================================================
MAINNET_API_URL = "https://api.hyperliquid.xyz"

# Trading pairs to monitor
TRADING_PAIRS = [
    "BTC",
    "ETH", 
    "SOL",
    "ARB",
    "DOGE",
    "AVAX",
]

# =============================================================================
# FUNDING RATE STRATEGY
# =============================================================================
FUNDING_CONFIG = {
    "min_funding_rate": 0.0001,    # 0.01% minimum to consider
    "high_funding_rate": 0.001,    # 0.1% = strong signal
    "check_interval_sec": 60,      # Check every minute
    "max_position_usd": 100,       # Max $100 per position
    "leverage": 3,                 # 3x leverage (conservative)
    "take_profit_pct": 0.02,       # 2% TP
    "stop_loss_pct": 0.015,        # 1.5% SL
}

# =============================================================================
# ORDERBOOK STRATEGY
# =============================================================================
ORDERBOOK_CONFIG = {
    "wall_threshold_usd": 50000,   # $50k order = "wall"
    "sentiment_required": True,    # Require Grok confirmation
    "min_sentiment_score": 7,      # Minimum bullish score
}

# =============================================================================
# RISK MANAGEMENT (REFEREE RULES)
# =============================================================================
RISK_CONFIG = {
    "max_daily_loss_usd": 50,      # Stop trading if down $50
    "max_open_positions": 3,       # Max concurrent positions
    "use_isolated_margin": True,   # Always use isolated (safer)
    "rate_limit_per_min": 30,      # Max 30 orders/min (under 1200 weight)
    "cooldown_after_loss_sec": 300, # 5 min cooldown after a loss
}

# =============================================================================
# NANSEN SMART MONEY TRACKING
# =============================================================================
NANSEN_CONFIG = {
    "track_labels": [
        "Smart Money",
        "Whale",
        "Fund",
    ],
    "min_flow_usd": 100000,        # Track flows > $100k
    "signal_threshold": 3,          # Need 3+ whales moving same direction
}

# =============================================================================
# LOGGING
# =============================================================================
LOG_PATH = "C:/Users/adamt/clawd/hyperliquid-bot/logs"
TRADE_LOG_PATH = "C:/Users/adamt/clawd/hyperliquid-bot/trades.json"
