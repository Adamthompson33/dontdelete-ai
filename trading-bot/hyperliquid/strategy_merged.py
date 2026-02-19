"""
Hyperliquid Trading Strategy - 2026 Downside Specialist (MERGED)
=================================================================

Three layers merged into the existing strategy:

1. REGIME DETECTOR - auto-switches between trending/grid/volatile
   using volatility ratio + ADX + MA convergence.

2. RSI + BOLLINGER FILTERS - prevents entering momentum trades at
   overbought/oversold extremes.

3. CONFIDENCE SCORING - every signal gets a 0-100 confidence score.
   Position sizing scales with conviction.

Original architecture preserved:
- 13/33 MA cross for trend direction
- Grid mode for choppy markets
- Flash crash catchers always on
- Bearish 2026 Fire Horse bias (10x short / 3x long)

Author: Si + Jackbot + Temporal Edge upgrade
"""

import pandas as pd
import numpy as np
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants
import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional

# ============================================================
# CONFIGURATION
# ============================================================

AGENT_KEY = os.getenv("HL_AGENT_KEY")
ACCOUNT_ADDR = os.getenv("HL_MAIN_ADDR")
SYMBOL = "BTC"

# --- Leverage (bearish 2026 bias) ---
LEVERAGE_SHORT = 10
LEVERAGE_LONG = 3

# --- Grid settings (choppy mode) ---
GRID_LEVELS = 5
GRID_SPACING_PCT = 0.01
GRID_SIZE_USD = 100

# --- Stop loss ---
STOP_LOSS_PCT = 0.04

# --- Flash crash catcher ---
CRASH_LEVELS = [0.10, 0.15, 0.20, 0.25, 0.30]
CRASH_SIZE_USD = 200
CRASH_TAKE_PROFIT_PCT = 0.05

# --- Regime detection thresholds ---
MA_CONVERGENCE_PCT = 1.0
VOLATILITY_SPIKE_RATIO = 1.8
VOL_LOOKBACK_SHORT = 10
VOL_LOOKBACK_LONG = 40
ADX_TREND_THRESHOLD = 25
ADX_PERIOD = 14

# --- RSI + Bollinger filter settings ---
RSI_PERIOD = 14
RSI_OVERBOUGHT = 70
RSI_OVERSOLD = 30
BB_PERIOD = 20
BB_STD_MULT = 2.0

# --- Confidence scoring ---
MIN_CONFIDENCE_TO_TRADE = 40
CONFIDENCE_SCALE_POSITIONS = True

# --- Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("strategy.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger("TemporalEdge")

# --- Exchange clients ---
# Uncomment for live trading:
# info = Info(constants.MAINNET_API_URL, skip_ws=True)
# exchange = Exchange(ACCOUNT_ADDR, AGENT_KEY, constants.MAINNET_API_URL)

# For testing - use None
info = None
exchange = None


# ============================================================
# DATA FETCHING
# ============================================================

def get_candles(coin: str, timeframe: str = "1d", limit: int = 100) -> pd.DataFrame:
    """Fetch candle data and return as DataFrame."""
    if info is None:
        log.warning("[!] Running in test mode - no live data")
        dates = pd.date_range(end=datetime.now(), periods=limit, freq='D')
        np.random.seed(42)
        close = 95000 + np.cumsum(np.random.randn(limit) * 500)
        return pd.DataFrame({
            'open': close - np.random.rand(limit) * 200,
            'high': close + np.random.rand(limit) * 300,
            'low': close - np.random.rand(limit) * 300,
            'close': close,
            'volume': np.random.rand(limit) * 1000000
        }, index=dates)
    
    candles = info.candle_snapshot(coin, timeframe, startTime=0, endTime=0)
    df = pd.DataFrame(candles)
    df['close'] = df['c'].astype(float)
    df['high'] = df['h'].astype(float)
    df['low'] = df['l'].astype(float)
    df['open'] = df['o'].astype(float)
    return df.tail(limit)


# ============================================================
# LAYER 1: REGIME DETECTOR
# ============================================================

def calculate_adx(df: pd.DataFrame, period: int = ADX_PERIOD) -> pd.Series:
    """
    Average Directional Index - measures trend STRENGTH.
    ADX > 25 = trending, ADX < 20 = choppy.
    """
    high = df['high']
    low = df['low']
    close = df['close']

    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    up_move = high - high.shift(1)
    down_move = low.shift(1) - low
    plus_dm = pd.Series(
        np.where((up_move > down_move) & (up_move > 0), up_move, 0),
        index=df.index
    )
    minus_dm = pd.Series(
        np.where((down_move > up_move) & (down_move > 0), down_move, 0),
        index=df.index
    )

    atr = tr.ewm(alpha=1/period, min_periods=period).mean()
    plus_di = 100 * (plus_dm.ewm(alpha=1/period, min_periods=period).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(alpha=1/period, min_periods=period).mean() / atr)

    dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di + 1e-10))
    adx = dx.ewm(alpha=1/period, min_periods=period).mean()

    return adx


def calculate_rsi(series: pd.Series, period: int = RSI_PERIOD) -> pd.Series:
    """Relative Strength Index."""
    delta = series.diff()
    gains = delta.where(delta > 0, 0.0)
    losses = (-delta).where(delta < 0, 0.0)
    avg_gain = gains.ewm(alpha=1/period, min_periods=period).mean()
    avg_loss = losses.ewm(alpha=1/period, min_periods=period).mean()
    rs = avg_gain / (avg_loss + 1e-10)
    return 100 - (100 / (1 + rs))


def calculate_bollinger(series: pd.Series, period: int = BB_PERIOD,
                        std_mult: float = BB_STD_MULT) -> pd.DataFrame:
    """Bollinger Bands - upper, mid, lower."""
    mid = series.rolling(window=period).mean()
    std = series.rolling(window=period).std()
    return pd.DataFrame({
        'bb_upper': mid + std_mult * std,
        'bb_mid': mid,
        'bb_lower': mid - std_mult * std
    }, index=series.index)


def calculate_volatility_ratio(df: pd.DataFrame) -> float:
    """
    Ratio of recent volatility to baseline volatility.
    > 1.8 = regime shift likely happening.
    """
    returns = df['close'].pct_change().dropna()
    if len(returns) < VOL_LOOKBACK_LONG:
        return 1.0

    recent_vol = returns.tail(VOL_LOOKBACK_SHORT).std()
    long_vol = returns.tail(VOL_LOOKBACK_LONG).std()

    if long_vol == 0 or pd.isna(long_vol):
        return 1.0

    return recent_vol / long_vol


def detect_market_regime(coin: str) -> dict:
    """
    ENHANCED regime detection using three signals:
    
    1. MA convergence - 13/33 cross direction
    2. ADX - trend strength
    3. Volatility ratio - regime shift detection
    
    Regimes:
    - TRENDING_SHORT: MA13 < MA33 + ADX confirms
    - TRENDING_LONG:  MA13 > MA33 + ADX confirms
    - CHOPPY:         MAs converged OR ADX weak
    - VOLATILE:       Volatility spike - reduce exposure
    """
    df = get_candles(coin)

    df['ma13'] = df['close'].rolling(window=13).mean()
    df['ma33'] = df['close'].rolling(window=33).mean()
    df['adx'] = calculate_adx(df)
    df['rsi'] = calculate_rsi(df['close'])

    bb = calculate_bollinger(df['close'])
    df = pd.concat([df, bb], axis=1)

    vol_ratio = calculate_volatility_ratio(df)

    current = df.iloc[-1]
    ma13 = current['ma13']
    ma33 = current['ma33']
    adx = current['adx']
    rsi_val = current['rsi']
    price = current['close']

    ma_diff_pct = ((ma13 - ma33) / ma33) * 100

    recent = df.tail(4)
    cross_up = (recent['ma13'].iloc[-1] > recent['ma33'].iloc[-1]) and \
               (recent['ma13'].iloc[-4] <= recent['ma33'].iloc[-4])
    cross_down = (recent['ma13'].iloc[-1] < recent['ma33'].iloc[-1]) and \
                 (recent['ma13'].iloc[-4] >= recent['ma33'].iloc[-4])
    fresh_cross = cross_up or cross_down

    # === REGIME CLASSIFICATION ===

    if vol_ratio > VOLATILITY_SPIKE_RATIO:
        regime = "VOLATILE"
        regime_note = f"Volatility spike (ratio: {vol_ratio:.2f}). Reducing exposure."

    elif abs(ma_diff_pct) >= MA_CONVERGENCE_PCT and adx >= ADX_TREND_THRESHOLD:
        if ma13 < ma33:
            regime = "TRENDING_SHORT"
            regime_note = f"Confirmed downtrend (MA diff: {ma_diff_pct:.2f}%, ADX: {adx:.1f})"
        else:
            regime = "TRENDING_LONG"
            regime_note = f"Confirmed uptrend (MA diff: {ma_diff_pct:.2f}%, ADX: {adx:.1f})"

    elif abs(ma_diff_pct) >= MA_CONVERGENCE_PCT and adx < ADX_TREND_THRESHOLD:
        regime = "CHOPPY"
        regime_note = f"MAs diverged ({ma_diff_pct:.2f}%) but ADX weak ({adx:.1f}). Fake cross."

    else:
        regime = "CHOPPY"
        regime_note = f"MAs converged ({ma_diff_pct:.2f}%). Grid mode."

    result = {
        'regime': regime,
        'regime_note': regime_note,
        'ma13': ma13,
        'ma33': ma33,
        'ma_diff_pct': ma_diff_pct,
        'adx': adx,
        'rsi': rsi_val,
        'bb_upper': current['bb_upper'],
        'bb_mid': current['bb_mid'],
        'bb_lower': current['bb_lower'],
        'vol_ratio': vol_ratio,
        'fresh_cross': fresh_cross,
        'price': price,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }

    log.info(f"REGIME: {regime} | {regime_note}")
    log.info(f"  MA13={ma13:.2f} MA33={ma33:.2f} ADX={adx:.1f} "
             f"RSI={rsi_val:.1f} VolRatio={vol_ratio:.2f} Price={price:.2f}")

    return result


# ============================================================
# LAYER 2: RSI + BOLLINGER ENTRY FILTERS
# ============================================================

def should_enter_trade(regime_data: dict, direction: str) -> dict:
    """
    Filter layer between regime detection and order execution.
    
    Prevents entering at terrible prices:
    - Don't SHORT when RSI < 30 (oversold)
    - Don't LONG when RSI > 70 (overbought)
    - Don't SHORT below lower BB
    - Don't LONG above upper BB
    """
    rsi = regime_data['rsi']
    price = regime_data['price']
    bb_upper = regime_data['bb_upper']
    bb_lower = regime_data['bb_lower']

    filters_passed = []
    filters_failed = []

    if direction == "SHORT":
        if rsi < RSI_OVERSOLD:
            filters_failed.append(f"RSI oversold ({rsi:.1f} < {RSI_OVERSOLD})")
        else:
            filters_passed.append(f"RSI OK ({rsi:.1f})")

        if price < bb_lower:
            filters_failed.append(f"Price below lower BB (${price:.0f} < ${bb_lower:.0f})")
        else:
            filters_passed.append(f"BB position OK")

        if rsi > 60 and price > bb_upper * 0.98:
            filters_passed.append("IDEAL: overbought near upper BB")

    elif direction == "LONG":
        if rsi > RSI_OVERBOUGHT:
            filters_failed.append(f"RSI overbought ({rsi:.1f} > {RSI_OVERBOUGHT})")
        else:
            filters_passed.append(f"RSI OK ({rsi:.1f})")

        if price > bb_upper:
            filters_failed.append(f"Price above upper BB (${price:.0f} > ${bb_upper:.0f})")
        else:
            filters_passed.append(f"BB position OK")

        if rsi < 40 and price < bb_lower * 1.02:
            filters_passed.append("IDEAL: oversold near lower BB")

    approved = len(filters_failed) == 0

    result = {
        'approved': approved,
        'direction': direction,
        'filters_passed': filters_passed,
        'filters_failed': filters_failed,
        'adjustment': "WAIT" if not approved else "ENTER",
        'reason': "; ".join(filters_failed) if filters_failed else "All filters passed"
    }

    status = "[+] APPROVED" if approved else "[-] BLOCKED"
    log.info(f"FILTER {status}: {direction} | {result['reason']}")

    return result


# ============================================================
# LAYER 3: CONFIDENCE SCORING
# ============================================================

def calculate_confidence(regime_data: dict, direction: str) -> dict:
    """
    Scores signal confidence 0-100 based on multiple factors.
    Position size scales linearly with confidence.
    
    Factors (each 0-20 points):
    1. ADX strength
    2. RSI alignment
    3. BB position
    4. MA separation
    5. Volatility regime
    """
    adx = regime_data['adx']
    rsi = regime_data['rsi']
    price = regime_data['price']
    bb_upper = regime_data['bb_upper']
    bb_lower = regime_data['bb_lower']
    ma_diff = abs(regime_data['ma_diff_pct'])
    vol_ratio = regime_data['vol_ratio']
    fresh_cross = regime_data['fresh_cross']

    scores = {}

    # 1. ADX strength (0-20)
    if adx >= 40:
        scores['adx_strength'] = 20
    elif adx >= 25:
        scores['adx_strength'] = int(10 + (adx - 25) / 15 * 10)
    else:
        scores['adx_strength'] = int(adx / 25 * 10)

    # 2. RSI alignment (0-20)
    if direction == "SHORT":
        if rsi > 65:
            scores['rsi_alignment'] = 20
        elif rsi > 50:
            scores['rsi_alignment'] = 12
        elif rsi > 35:
            scores['rsi_alignment'] = 6
        else:
            scores['rsi_alignment'] = 0
    else:
        if rsi < 35:
            scores['rsi_alignment'] = 20
        elif rsi < 50:
            scores['rsi_alignment'] = 12
        elif rsi < 65:
            scores['rsi_alignment'] = 6
        else:
            scores['rsi_alignment'] = 0

    # 3. BB position (0-20)
    bb_range = bb_upper - bb_lower if (bb_upper - bb_lower) > 0 else 1
    bb_percentile = (price - bb_lower) / bb_range

    if direction == "SHORT":
        scores['bb_position'] = int(bb_percentile * 20)
    else:
        scores['bb_position'] = int((1 - bb_percentile) * 20)

    # 4. MA separation (0-20)
    if ma_diff >= 3.0:
        scores['ma_separation'] = 20
    elif ma_diff >= 1.5:
        scores['ma_separation'] = int(10 + (ma_diff - 1.5) / 1.5 * 10)
    else:
        scores['ma_separation'] = int(ma_diff / 1.5 * 10)

    # 5. Volatility (0-20)
    if 0.8 <= vol_ratio <= 1.3:
        scores['volatility'] = 20
    elif 0.5 <= vol_ratio <= 1.8:
        scores['volatility'] = 12
    else:
        scores['volatility'] = 4

    if fresh_cross:
        scores['fresh_cross_bonus'] = 10
    else:
        scores['fresh_cross_bonus'] = 0

    total = min(sum(scores.values()), 100)
    size_multiplier = max(total / 100, 0.3) if CONFIDENCE_SCALE_POSITIONS else 1.0

    result = {
        'confidence': total,
        'scores': scores,
        'size_multiplier': size_multiplier,
        'grade': 'A' if total >= 80 else 'B' if total >= 60 else 'C' if total >= 40 else 'D',
        'action': 'FULL SIZE' if total >= 80 else 'REDUCED SIZE' if total >= MIN_CONFIDENCE_TO_TRADE else 'SKIP'
    }

    log.info(f"CONFIDENCE: {total}/100 (Grade {result['grade']}) -> {result['action']}")
    log.info(f"  Breakdown: {json.dumps(scores)}")

    return result


# ============================================================
# MODE 1: TRENDING - Leveraged Position
# ============================================================

def enter_trend_position(coin: str, direction: str, size_usd: float = 1000,
                         stop_loss_pct: float = None):
    """Enter a leveraged position in the trend direction."""
    stop_loss_pct = stop_loss_pct or STOP_LOSS_PCT
    regime = detect_market_regime(coin)
    price = regime['price']
    
    is_short = direction == "SHORT"
    leverage = LEVERAGE_SHORT if is_short else LEVERAGE_LONG
    
    if is_short:
        stop_price = price * (1 + stop_loss_pct)
    else:
        stop_price = price * (1 - stop_loss_pct)
    
    log.info(f"\n{'='*50}")
    log.info(f"[^] ENTERING {direction} POSITION")
    log.info(f"{'='*50}")
    log.info(f"   Coin: {coin}")
    log.info(f"   Price: ${price:,.2f}")
    log.info(f"   Direction: {direction}")
    log.info(f"   Leverage: {leverage}x")
    log.info(f"   Size: ${size_usd:,.2f}")
    log.info(f"   Stop Loss: ${stop_price:,.2f} ({stop_loss_pct*100:.1f}%)")
    log.info(f"   Liquidation: ~${price * (1 + 1/leverage) if is_short else price * (1 - 1/leverage):,.2f}")
    
    if exchange:
        exchange.update_leverage(leverage, coin, is_buy=not is_short)
        size = size_usd / price
        exchange.market_open(coin, is_buy=not is_short, sz=size)
        exchange.order(coin, is_buy=is_short, sz=size, px=stop_price, 
                       order_type={"trigger": {"triggerPx": stop_price, "isMarket": True, "tpsl": "sl"}})
        log.info(f"\n[+] Position opened with stop loss")
    else:
        log.info(f"\n[!] Test mode - no order placed")
    
    return {
        'action': 'ENTER_TREND',
        'direction': direction,
        'price': price,
        'leverage': leverage,
        'size_usd': size_usd,
        'stop_price': stop_price
    }


def exit_trend_position(coin: str):
    """Close all positions for a coin."""
    log.info(f"\n[x] Closing all {coin} positions...")
    
    if exchange:
        exchange.market_close(coin)
        log.info("[+] Positions closed")
    else:
        log.info("[!] Test mode - no action taken")
    
    return {'status': 'closed', 'coin': coin}


# ============================================================
# MODE 2: CHOPPY - Neutral Grid Bot
# ============================================================

def setup_neutral_grid(coin: str, center_price: float = None, 
                       size_per_level: float = None,
                       spacing_mult: float = 1.0, size_mult: float = 1.0):
    """Set up a neutral grid that profits from chop."""
    regime = detect_market_regime(coin)
    price = center_price or regime['price']
    base_size = size_per_level or GRID_SIZE_USD
    size = base_size * size_mult
    spacing = GRID_SPACING_PCT * spacing_mult
    
    log.info(f"\n{'='*50}")
    log.info(f"[#] SETTING UP NEUTRAL GRID")
    log.info(f"{'='*50}")
    log.info(f"   Coin: {coin}")
    log.info(f"   Center Price: ${price:,.2f}")
    log.info(f"   Levels: {GRID_LEVELS} above + {GRID_LEVELS} below")
    log.info(f"   Spacing: {spacing*100:.1f}% (mult: {spacing_mult}x)")
    log.info(f"   Size per level: ${size:.2f} (mult: {size_mult}x)")
    log.info(f"   Total capital needed: ${size * GRID_LEVELS * 2:,.2f}")
    
    buy_orders = []
    sell_orders = []
    
    log.info(f"\n   [v] BUY ORDERS (below price):")
    for i in range(1, GRID_LEVELS + 1):
        buy_price = price * (1 - spacing * i)
        buy_orders.append({'side': 'BUY', 'price': buy_price, 'size_usd': size, 'level': i})
        log.info(f"      Level {i}: ${buy_price:,.2f}")
        
        if exchange:
            sz = size / buy_price
            exchange.order(coin, is_buy=True, sz=sz, px=buy_price, 
                           order_type={"limit": {"tif": "Gtc"}})
    
    log.info(f"\n   [^] SELL ORDERS (above price):")
    for i in range(1, GRID_LEVELS + 1):
        sell_price = price * (1 + spacing * i)
        sell_orders.append({'side': 'SELL', 'price': sell_price, 'size_usd': size, 'level': i})
        log.info(f"      Level {i}: ${sell_price:,.2f}")
        
        if exchange:
            sz = size / sell_price
            exchange.order(coin, is_buy=False, sz=sz, px=sell_price,
                           order_type={"limit": {"tif": "Gtc"}})
    
    profit_per_trip = size * spacing * 2
    log.info(f"\n   [$] PROFIT PER ROUND TRIP: ~${profit_per_trip:.2f} per level (before fees)")
    
    if not exchange:
        log.info(f"\n[!] Test mode - no orders placed")
    
    return {
        'action': 'SETUP_GRID',
        'center_price': price,
        'spacing': spacing,
        'size': size,
        'buy_orders': buy_orders,
        'sell_orders': sell_orders
    }


def cancel_grid(coin: str):
    """Cancel all grid orders."""
    log.info(f"\n[x] Cancelling all {coin} grid orders...")
    
    if exchange and info:
        open_orders = info.open_orders(ACCOUNT_ADDR)
        cancelled = 0
        for order in open_orders:
            if order['coin'] == coin:
                exchange.cancel(coin, order['oid'])
                cancelled += 1
        log.info(f"[+] Cancelled {cancelled} orders")
    else:
        log.info("[!] Test mode - no action taken")
    
    return {'status': 'cancelled', 'coin': coin}


# ============================================================
# MODE 3: FLASH CRASH CATCHER
# ============================================================

def setup_crash_catcher(coin: str, current_price: float = None):
    """Flash Crash Catcher - limit buys at extreme prices."""
    regime = detect_market_regime(coin)
    price = current_price or regime['price']
    
    log.info(f"\n{'='*50}")
    log.info(f"[!] FLASH CRASH CATCHER SETUP")
    log.info(f"{'='*50}")
    log.info(f"   Purpose: Catch liquidation cascades")
    log.info(f"   Current Price: ${price:,.2f}")
    
    crash_orders = []
    total_capital = 0
    
    log.info(f"\n   [>] CRASH BUY ORDERS:")
    for pct in CRASH_LEVELS:
        crash_price = price * (1 - pct)
        take_profit = crash_price * (1 + CRASH_TAKE_PROFIT_PCT)
        
        crash_orders.append({
            'type': 'CRASH_BUY',
            'trigger_drop': f"{pct*100:.0f}%",
            'buy_price': crash_price,
            'take_profit': take_profit,
            'size_usd': CRASH_SIZE_USD
        })
        total_capital += CRASH_SIZE_USD
        
        log.info(f"      {pct*100:.0f}% crash -> Buy at ${crash_price:,.2f}")
        log.info(f"                   -> TP at ${take_profit:,.2f} (+5%)")
        
        if exchange:
            sz = CRASH_SIZE_USD / crash_price
            exchange.order(coin, is_buy=True, sz=sz, px=crash_price,
                           order_type={"limit": {"tif": "Gtc"}})
    
    log.info(f"\n   [$] TOTAL CAPITAL RESERVED: ${total_capital:,.2f}")
    log.info(f"   [=] IF ALL HIT: ${total_capital * CRASH_TAKE_PROFIT_PCT:,.2f} profit")
    
    if not exchange:
        log.info(f"\n[!] Test mode - no orders placed")
    
    return {'action': 'SETUP_CRASH_CATCHER', 'orders': crash_orders, 'total_capital': total_capital}


def setup_pump_catcher(coin: str, current_price: float = None):
    """Pump Catcher - shorts violent upward wicks."""
    regime = detect_market_regime(coin)
    price = current_price or regime['price']
    
    log.info(f"\n{'='*50}")
    log.info(f"[^] SHORT SQUEEZE CATCHER SETUP")
    log.info(f"{'='*50}")
    log.info(f"   Purpose: Short violent upward wicks")
    log.info(f"   Current Price: ${price:,.2f}")
    
    pump_levels = [0.08, 0.12, 0.15, 0.20]
    pump_orders = []
    total_capital = 0
    
    log.info(f"\n   [>] SQUEEZE SHORT ORDERS:")
    for pct in pump_levels:
        pump_price = price * (1 + pct)
        take_profit = pump_price * (1 - CRASH_TAKE_PROFIT_PCT)
        
        pump_orders.append({
            'type': 'SQUEEZE_SHORT',
            'trigger_pump': f"{pct*100:.0f}%",
            'short_price': pump_price,
            'take_profit': take_profit,
            'size_usd': CRASH_SIZE_USD
        })
        total_capital += CRASH_SIZE_USD
        
        log.info(f"      {pct*100:.0f}% pump -> Short at ${pump_price:,.2f}")
        log.info(f"                   -> TP at ${take_profit:,.2f} (-5%)")
        
        if exchange:
            sz = CRASH_SIZE_USD / pump_price
            exchange.order(coin, is_buy=False, sz=sz, px=pump_price,
                           order_type={"limit": {"tif": "Gtc"}})
    
    log.info(f"\n   [$] TOTAL CAPITAL RESERVED: ${total_capital:,.2f}")
    
    if not exchange:
        log.info(f"\n[!] Test mode - no orders placed")
    
    return {'action': 'SETUP_PUMP_CATCHER', 'orders': pump_orders, 'total_capital': total_capital}


# ============================================================
# MAIN STRATEGY EXECUTION
# ============================================================

def run_strategy(coin: str, position_size_usd: float = 1000):
    """
    Main strategy loop.
    
    Flow:
    1. Detect regime (MA cross + ADX + volatility)
    2. If trending -> check filters -> calculate confidence -> size position
    3. If choppy -> close trends, set up grid
    4. If volatile -> reduce all exposure
    5. ALWAYS -> crash catchers running
    """
    regime_data = detect_market_regime(coin)
    regime = regime_data['regime']

    log.info("=" * 60)
    log.info(f"STRATEGY RUN - {coin} - {datetime.now(timezone.utc).isoformat()}")
    log.info(f"REGIME: {regime}")
    log.info("=" * 60)

    result = {'action': None, 'regime': regime, 'details': {}}

    if regime == "VOLATILE":
        log.warning("[!] VOLATILE REGIME - Reducing exposure")
        exit_trend_position(coin)
        cancel_grid(coin)
        result['action'] = 'VOLATILE_DEFENSE'
        result['details'] = {
            'vol_ratio': regime_data['vol_ratio'],
            'note': 'All positions closed. Waiting for volatility to normalize.'
        }

    elif regime in ("TRENDING_SHORT", "TRENDING_LONG"):
        direction = "SHORT" if regime == "TRENDING_SHORT" else "LONG"

        filter_result = should_enter_trade(regime_data, direction)

        if not filter_result['approved']:
            log.info(f"[~] WAITING - {direction} signal filtered: {filter_result['reason']}")
            result['action'] = 'FILTERED_WAIT'
            result['details'] = filter_result
        else:
            confidence = calculate_confidence(regime_data, direction)

            if confidence['confidence'] < MIN_CONFIDENCE_TO_TRADE:
                log.info(f"[~] LOW CONFIDENCE ({confidence['confidence']}) - Skipping")
                result['action'] = 'LOW_CONFIDENCE_SKIP'
                result['details'] = confidence
            else:
                adjusted_size = position_size_usd * confidence['size_multiplier']

                if direction == "LONG":
                    adjusted_size *= 0.5

                stop_loss = STOP_LOSS_PCT
                if regime_data['vol_ratio'] > 1.3:
                    stop_loss = STOP_LOSS_PCT * 1.5
                    log.info(f"  Stop widened to {stop_loss*100:.1f}% (elevated vol)")

                cancel_grid(coin)
                trade_result = enter_trend_position(coin, direction, adjusted_size, stop_loss_pct=stop_loss)

                result['action'] = f'ENTER_{direction}'
                result['details'] = {
                    'confidence': confidence,
                    'filter': filter_result,
                    'adjusted_size': adjusted_size,
                    'original_size': position_size_usd,
                    'stop_loss': stop_loss,
                    'trade': trade_result
                }

                log.info(f"[>] ENTERED {direction} | "
                         f"Size: ${adjusted_size:.0f} ({confidence['size_multiplier']:.0%} of ${position_size_usd}) | "
                         f"Confidence: {confidence['confidence']}/100 | "
                         f"Stop: {stop_loss*100:.1f}%")

    else:  # CHOPPY
        exit_trend_position(coin)
        grid_result = setup_neutral_grid(coin)
        result['action'] = 'GRID_MODE'
        result['details'] = {'grid': grid_result}
        log.info("[=] GRID MODE - Neutral grid deployed")

    # ALWAYS set up crash catchers
    crash_result = setup_crash_catcher(coin)
    pump_result = setup_pump_catcher(coin)

    result['crash_catcher'] = crash_result
    result['pump_catcher'] = pump_result

    # Log state
    log_state(regime_data, result)

    return result


def log_state(regime_data: dict, result: dict):
    """Persist state for dashboard / debugging."""
    state = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'regime': regime_data['regime'],
        'regime_note': regime_data.get('regime_note', ''),
        'price': regime_data['price'],
        'ma13': regime_data['ma13'],
        'ma33': regime_data['ma33'],
        'adx': regime_data['adx'],
        'rsi': regime_data['rsi'],
        'vol_ratio': regime_data['vol_ratio'],
        'action': result['action'],
    }

    try:
        with open("strategy_state.jsonl", "a") as f:
            f.write(json.dumps(state) + "\n")
    except Exception as e:
        log.error(f"Failed to write state: {e}")


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    log.info("[*] Temporal Edge - 2026 Downside Specialist (Merged)")
    log.info("=" * 60)

    result = run_strategy(SYMBOL)

    print(f"\n{'='*60}")
    print(f"Strategy: {result['action']}")
    print(f"Regime:   {result['regime']}")
    if 'confidence' in result.get('details', {}):
        c = result['details']['confidence']
        print(f"Confidence: {c['confidence']}/100 (Grade {c['grade']})")
        print(f"Size multiplier: {c['size_multiplier']:.0%}")
    print(f"{'='*60}")
