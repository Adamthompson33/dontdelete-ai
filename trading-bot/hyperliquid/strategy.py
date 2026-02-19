"""
Hyperliquid Trading Strategy - 2026 Downside Specialist (ENHANCED)
===================================================================

UPGRADE: Three new layers merged into the existing strategy:

1. REGIME DETECTOR — auto-switches between trending/grid/volatile
   using volatility ratio + ADX + MA convergence. No more manual mode switching.

2. RSI + BOLLINGER FILTERS — prevents entering momentum trades at
   overbought/oversold extremes. Filters out the worst entries.

3. CONFIDENCE SCORING — every signal gets a 0-100 confidence score.
   Position sizing scales with conviction. Low confidence = skip or reduce size.

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

# --- NEW: Regime detection thresholds ---
MA_CONVERGENCE_PCT = 1.0          # MAs within this % = choppy
VOLATILITY_SPIKE_RATIO = 1.8     # Recent vol / long vol > this = volatile regime
VOL_LOOKBACK_SHORT = 10          # Candles for recent volatility
VOL_LOOKBACK_LONG = 40           # Candles for baseline volatility
ADX_TREND_THRESHOLD = 25         # ADX above this = trending
ADX_PERIOD = 14

# --- NEW: RSI + Bollinger filter settings ---
RSI_PERIOD = 14
RSI_OVERBOUGHT = 70
RSI_OVERSOLD = 30
BB_PERIOD = 20
BB_STD_MULT = 2.0

# --- NEW: Confidence scoring ---
MIN_CONFIDENCE_TO_TRADE = 40     # Skip signals below this
CONFIDENCE_SCALE_POSITIONS = True # Scale position size by confidence

# --- Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("strategy.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger("TemporalEdge")


# ============================================================
# LAYER 1: REGIME DETECTOR
# ============================================================

def calculate_adx(df: pd.DataFrame, period: int = ADX_PERIOD) -> pd.Series:
    """
    Average Directional Index — measures trend STRENGTH regardless of direction.
    ADX > 25 = trending, ADX < 20 = choppy.
    """
    high = df['high']
    low = df['low']
    close = df['close']

    # True Range
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    # Directional Movement
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

    # Smoothed with Wilder's method
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
    """Bollinger Bands — upper, mid, lower."""
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
    ENHANCED regime detection using three independent signals:
    
    1. MA convergence (original) — 13/33 cross direction
    2. ADX — trend strength (is the trend real or noise?)
    3. Volatility ratio — is a regime SHIFT happening right now?
    
    Regimes:
    - TRENDING_SHORT: MA13 < MA33 + ADX confirms trend
    - TRENDING_LONG:  MA13 > MA33 + ADX confirms trend
    - CHOPPY:         MAs converged OR ADX says no trend
    - VOLATILE:       Volatility spike detected — reduce size, widen stops
    
    The key insight: your original bot only used MA convergence.
    Adding ADX filters out fake crossovers. Adding volatility ratio
    catches the moments when ALL strategies should reduce exposure.
    """
    df = get_candles(coin)

    # --- Original MA cross ---
    df['ma13'] = df['close'].rolling(window=13).mean()
    df['ma33'] = df['close'].rolling(window=33).mean()

    # --- NEW: ADX for trend strength ---
    df['adx'] = calculate_adx(df)

    # --- NEW: RSI ---
    df['rsi'] = calculate_rsi(df['close'])

    # --- NEW: Bollinger Bands ---
    bb = calculate_bollinger(df['close'])
    df = pd.concat([df, bb], axis=1)

    # --- NEW: Volatility ratio ---
    vol_ratio = calculate_volatility_ratio(df)

    current = df.iloc[-1]
    ma13 = current['ma13']
    ma33 = current['ma33']
    adx = current['adx']
    rsi_val = current['rsi']
    price = current['close']

    ma_diff_pct = ((ma13 - ma33) / ma33) * 100

    # Check for fresh cross (last 3 candles)
    recent = df.tail(4)
    cross_up = (recent['ma13'].iloc[-1] > recent['ma33'].iloc[-1]) and \
               (recent['ma13'].iloc[-4] <= recent['ma33'].iloc[-4])
    cross_down = (recent['ma13'].iloc[-1] < recent['ma33'].iloc[-1]) and \
                 (recent['ma13'].iloc[-4] >= recent['ma33'].iloc[-4])
    fresh_cross = cross_up or cross_down

    # === REGIME CLASSIFICATION (enhanced) ===

    # Priority 1: Volatility spike overrides everything
    if vol_ratio > VOLATILITY_SPIKE_RATIO:
        regime = "VOLATILE"
        regime_note = (f"Volatility spike detected (ratio: {vol_ratio:.2f}). "
                       "Reducing exposure, widening stops.")

    # Priority 2: Check if ADX confirms a real trend
    elif abs(ma_diff_pct) >= MA_CONVERGENCE_PCT and adx >= ADX_TREND_THRESHOLD:
        if ma13 < ma33:
            regime = "TRENDING_SHORT"
            regime_note = f"Confirmed downtrend (MA diff: {ma_diff_pct:.2f}%, ADX: {adx:.1f})"
        else:
            regime = "TRENDING_LONG"
            regime_note = f"Confirmed uptrend (MA diff: {ma_diff_pct:.2f}%, ADX: {adx:.1f})"

    # Priority 3: MAs crossed but ADX says trend is weak → choppy
    elif abs(ma_diff_pct) >= MA_CONVERGENCE_PCT and adx < ADX_TREND_THRESHOLD:
        regime = "CHOPPY"
        regime_note = (f"MAs diverged ({ma_diff_pct:.2f}%) but ADX weak ({adx:.1f}). "
                       "Fake cross -- staying in grid mode.")

    # Priority 4: MAs converged → definitely choppy
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
    Filter layer that sits BETWEEN regime detection and order execution.
    
    Prevents entering momentum trades at terrible prices:
    - Don't SHORT when RSI < 30 (already oversold, bounce likely)
    - Don't LONG when RSI > 70 (already overbought, pullback likely)
    - Don't SHORT below lower Bollinger (price stretched too far down)
    - Don't LONG above upper Bollinger (price stretched too far up)
    
    Returns:
        dict with 'approved' (bool), 'reason' (str), 'adjustment' (str)
    """
    rsi = regime_data['rsi']
    price = regime_data['price']
    bb_upper = regime_data['bb_upper']
    bb_lower = regime_data['bb_lower']

    filters_passed = []
    filters_failed = []

    if direction == "SHORT":
        # Don't short into oversold conditions
        if rsi < RSI_OVERSOLD:
            filters_failed.append(f"RSI oversold ({rsi:.1f} < {RSI_OVERSOLD}) -- bounce likely")
        else:
            filters_passed.append(f"RSI OK ({rsi:.1f})")

        # Don't short below lower Bollinger
        if price < bb_lower:
            filters_failed.append(f"Price below lower BB (${price:.0f} < ${bb_lower:.0f}) -- stretched")
        else:
            filters_passed.append(f"BB position OK")

        # IDEAL short: RSI > 60 AND price near upper BB
        if rsi > 60 and price > bb_upper * 0.98:
            filters_passed.append("IDEAL: overbought near upper BB -- high conviction short")

    elif direction == "LONG":
        # Don't buy into overbought conditions
        if rsi > RSI_OVERBOUGHT:
            filters_failed.append(f"RSI overbought ({rsi:.1f} > {RSI_OVERBOUGHT}) -- pullback likely")
        else:
            filters_passed.append(f"RSI OK ({rsi:.1f})")

        # Don't buy above upper Bollinger
        if price > bb_upper:
            filters_failed.append(f"Price above upper BB (${price:.0f} > ${bb_upper:.0f}) -- stretched")
        else:
            filters_passed.append(f"BB position OK")

        # IDEAL long: RSI < 40 AND price near lower BB
        if rsi < 40 and price < bb_lower * 1.02:
            filters_passed.append("IDEAL: oversold near lower BB -- high conviction long")

    approved = len(filters_failed) == 0
    adjustment = "WAIT" if not approved else "ENTER"

    result = {
        'approved': approved,
        'direction': direction,
        'filters_passed': filters_passed,
        'filters_failed': filters_failed,
        'adjustment': adjustment,
        'reason': "; ".join(filters_failed) if filters_failed else "All filters passed"
    }

    status = "APPROVED" if approved else "BLOCKED"
    log.info(f"FILTER [{status}]: {direction} | {result['reason']}")

    return result


# ============================================================
# LAYER 3: CONFIDENCE SCORING
# ============================================================

def calculate_confidence(regime_data: dict, direction: str) -> dict:
    """
    Scores signal confidence 0-100 based on multiple factors.
    Position size scales linearly with confidence.
    
    Factors (each 0-20 points, total max 100):
    
    1. ADX strength    — stronger trend = more confidence
    2. RSI alignment   — RSI agreeing with direction = more confidence
    3. BB position     — price position within bands
    4. MA separation   — wider MA gap = more confirmed
    5. Volatility      — moderate vol = good, extreme = uncertain
    
    This replaces the binary "trade or don't trade" with a spectrum.
    A 90-confidence signal gets full size. A 45-confidence gets half.
    """
    adx = regime_data['adx']
    rsi = regime_data['rsi']
    price = regime_data['price']
    bb_upper = regime_data['bb_upper']
    bb_lower = regime_data['bb_lower']
    bb_mid = regime_data['bb_mid']
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
            scores['rsi_alignment'] = 20  # Overbought → great for shorts
        elif rsi > 50:
            scores['rsi_alignment'] = 12
        elif rsi > 35:
            scores['rsi_alignment'] = 6
        else:
            scores['rsi_alignment'] = 0   # Oversold → terrible for shorts
    else:  # LONG
        if rsi < 35:
            scores['rsi_alignment'] = 20  # Oversold → great for longs
        elif rsi < 50:
            scores['rsi_alignment'] = 12
        elif rsi < 65:
            scores['rsi_alignment'] = 6
        else:
            scores['rsi_alignment'] = 0   # Overbought → terrible for longs

    # 3. Bollinger Band position (0-20)
    bb_range = bb_upper - bb_lower if (bb_upper - bb_lower) > 0 else 1
    bb_percentile = (price - bb_lower) / bb_range  # 0 = at lower, 1 = at upper

    if direction == "SHORT":
        scores['bb_position'] = int(bb_percentile * 20)  # Higher = better for shorts
    else:
        scores['bb_position'] = int((1 - bb_percentile) * 20)  # Lower = better for longs

    # 4. MA separation (0-20)
    if ma_diff >= 3.0:
        scores['ma_separation'] = 20
    elif ma_diff >= 1.5:
        scores['ma_separation'] = int(10 + (ma_diff - 1.5) / 1.5 * 10)
    else:
        scores['ma_separation'] = int(ma_diff / 1.5 * 10)

    # 5. Volatility regime (0-20)
    # Moderate volatility is best. Too low = no movement. Too high = unpredictable.
    if 0.8 <= vol_ratio <= 1.3:
        scores['volatility'] = 20  # Normal — ideal
    elif 0.5 <= vol_ratio <= 1.8:
        scores['volatility'] = 12  # Slightly unusual
    else:
        scores['volatility'] = 4   # Extreme — reduce confidence

    # Bonus: fresh cross adds conviction
    if fresh_cross:
        scores['fresh_cross_bonus'] = 10
    else:
        scores['fresh_cross_bonus'] = 0

    total = min(sum(scores.values()), 100)

    # Position size multiplier (40 confidence = 0.4x, 80 = 0.8x, 100 = 1.0x)
    size_multiplier = max(total / 100, 0.3) if CONFIDENCE_SCALE_POSITIONS else 1.0

    result = {
        'confidence': total,
        'scores': scores,
        'size_multiplier': size_multiplier,
        'grade': (
            'A' if total >= 80 else
            'B' if total >= 60 else
            'C' if total >= 40 else
            'D'
        ),
        'action': (
            'FULL SIZE' if total >= 80 else
            'REDUCED SIZE' if total >= MIN_CONFIDENCE_TO_TRADE else
            'SKIP -- too low confidence'
        )
    }

    log.info(f"CONFIDENCE: {total}/100 (Grade {result['grade']}) -> {result['action']}")
    log.info(f"  Breakdown: {json.dumps(scores)}")

    return result


# ============================================================
# ENHANCED STRATEGY EXECUTION
# ============================================================

def run_strategy(coin: str, position_size_usd: float = 1000):
    """
    ENHANCED main strategy loop.
    
    Flow:
    1. Detect regime (MA cross + ADX + volatility ratio)
    2. If trending → check RSI/BB filters → calculate confidence → size position
    3. If choppy  → close trend positions, set up grid
    4. If volatile → reduce all exposure, widen stops
    5. ALWAYS → crash catchers running
    
    The three new layers work together:
    - Regime detector picks the MODE
    - RSI/BB filters prevent BAD ENTRIES within that mode
    - Confidence scoring sizes the POSITION
    """

    # ─── Step 1: Detect regime ───
    regime_data = detect_market_regime(coin)
    regime = regime_data['regime']

    log.info("=" * 60)
    log.info(f"STRATEGY RUN -- {coin} -- {datetime.now(timezone.utc).isoformat()}")
    log.info(f"REGIME: {regime}")
    log.info("=" * 60)

    result = {'action': None, 'regime': regime, 'details': {}}

    # ─── Step 2: Execute based on regime ───

    if regime == "VOLATILE":
        # NEW: Volatility spike detected — defensive mode
        log.warning("[!] VOLATILE REGIME -- Reducing exposure")

        # Close any open trend positions
        exit_trend_position(coin)
        # Cancel grid (spreads might get blown through)
        cancel_grid(coin)
        # Optionally: set wider grid with smaller size
        # setup_neutral_grid(coin, spacing_mult=2.0, size_mult=0.5)

        result['action'] = 'VOLATILE_DEFENSE'
        result['details'] = {
            'vol_ratio': regime_data['vol_ratio'],
            'note': 'All positions closed. Waiting for volatility to normalize.'
        }

    elif regime in ("TRENDING_SHORT", "TRENDING_LONG"):
        direction = "SHORT" if regime == "TRENDING_SHORT" else "LONG"

        # ─── Layer 2: RSI/BB filter ───
        filter_result = should_enter_trade(regime_data, direction)

        if not filter_result['approved']:
            log.info(f"[~] WAITING -- {direction} signal filtered: {filter_result['reason']}")
            result['action'] = 'FILTERED_WAIT'
            result['details'] = filter_result
            # Don't enter, but don't switch to grid either — just wait
            # Still set up crash catchers
        else:
            # ─── Layer 3: Confidence scoring ───
            confidence = calculate_confidence(regime_data, direction)

            if confidence['confidence'] < MIN_CONFIDENCE_TO_TRADE:
                log.info(f"[~] LOW CONFIDENCE ({confidence['confidence']}) -- Skipping")
                result['action'] = 'LOW_CONFIDENCE_SKIP'
                result['details'] = confidence
            else:
                # Scale position size by confidence
                adjusted_size = position_size_usd * confidence['size_multiplier']

                # Apply bearish bias (original logic)
                if direction == "LONG":
                    adjusted_size *= 0.5  # Half size on longs (against thesis)

                # Apply volatile stop widening
                stop_loss = STOP_LOSS_PCT
                if regime_data['vol_ratio'] > 1.3:
                    stop_loss = STOP_LOSS_PCT * 1.5  # Wider stop in elevated vol
                    log.info(f"  Stop widened to {stop_loss*100:.1f}% (elevated vol)")

                cancel_grid(coin)
                trade_result = enter_trend_position(
                    coin, direction, adjusted_size,
                    stop_loss_pct=stop_loss
                )

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
        log.info("[=] GRID MODE -- Neutral grid deployed")

    # ─── Step 3: ALWAYS set up crash catchers ───
    crash_result = setup_crash_catcher(coin)
    pump_result = setup_pump_catcher(coin)

    result['crash_catcher'] = crash_result
    result['pump_catcher'] = pump_result

    # ─── Step 4: Log full state ───
    log_state(regime_data, result)

    return result


def log_state(regime_data: dict, result: dict):
    """Persist state for dashboard / debugging."""
    state = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'regime': regime_data['regime'],
        'regime_note': regime_data['regime_note'],
        'price': regime_data['price'],
        'ma13': regime_data['ma13'],
        'ma33': regime_data['ma33'],
        'adx': regime_data['adx'],
        'rsi': regime_data['rsi'],
        'vol_ratio': regime_data['vol_ratio'],
        'action': result['action'],
    }

    # Append to JSONL log for dashboard consumption
    try:
        with open("strategy_state.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(state) + "\n")
    except Exception as e:
        log.error(f"Failed to write state: {e}")


# ============================================================
# PLACEHOLDER FUNCTIONS — Replace with your existing implementations
# ============================================================
# These are the functions your bot already has.
# Keep your existing implementations — the signatures below
# just show what the enhanced strategy expects.

def get_candles(coin: str, interval: str = "1d", lookback: int = 100) -> pd.DataFrame:
    """
    Fetch OHLCV candles from Hyperliquid.
    Must return DataFrame with columns: open, high, low, close, volume
    
    YOUR EXISTING IMPLEMENTATION GOES HERE.
    """
    # Example using Hyperliquid SDK:
    # info = Info(constants.MAINNET_API_URL)
    # candles = info.candles_snapshot(coin, interval, lookback)
    # df = pd.DataFrame(candles)
    # df['close'] = df['close'].astype(float)
    # df['high'] = df['high'].astype(float)
    # df['low'] = df['low'].astype(float)
    # return df
    raise NotImplementedError("Plug in your existing get_candles()")


def enter_trend_position(coin: str, direction: str, size_usd: float,
                         stop_loss_pct: float = STOP_LOSS_PCT) -> dict:
    """
    Enter a leveraged trend position.
    
    UPDATED: Now accepts stop_loss_pct parameter (may be widened
    during elevated volatility).
    
    YOUR EXISTING IMPLEMENTATION GOES HERE.
    """
    leverage = LEVERAGE_SHORT if direction == "SHORT" else LEVERAGE_LONG
    log.info(f"  -> enter_trend_position({coin}, {direction}, "
             f"${size_usd:.0f}, {leverage}x, stop={stop_loss_pct*100:.1f}%)")
    # Your Hyperliquid order logic here
    return {'status': 'entered', 'direction': direction, 'size': size_usd}


def exit_trend_position(coin: str) -> dict:
    """Close any open trend position. YOUR EXISTING IMPLEMENTATION."""
    log.info(f"  -> exit_trend_position({coin})")
    return {'status': 'closed'}


def setup_neutral_grid(coin: str, spacing_mult: float = 1.0,
                       size_mult: float = 1.0) -> dict:
    """
    Set up neutral grid bot.
    
    UPDATED: Now accepts spacing_mult and size_mult for volatile regime
    adjustments (wider grid, smaller size during high vol).
    
    YOUR EXISTING IMPLEMENTATION GOES HERE.
    """
    spacing = GRID_SPACING_PCT * spacing_mult
    size = GRID_SIZE_USD * size_mult
    log.info(f"  -> setup_neutral_grid({coin}, {GRID_LEVELS} levels, "
             f"{spacing*100:.1f}% spacing, ${size:.0f}/level)")
    return {'status': 'grid_active', 'levels': GRID_LEVELS}


def cancel_grid(coin: str) -> dict:
    """Cancel all grid orders. YOUR EXISTING IMPLEMENTATION."""
    log.info(f"  -> cancel_grid({coin})")
    return {'status': 'grid_cancelled'}


def setup_crash_catcher(coin: str) -> dict:
    """Set limit buys at crash levels. YOUR EXISTING IMPLEMENTATION."""
    log.info(f"  -> setup_crash_catcher({coin}) at {CRASH_LEVELS}")
    return {'status': 'crash_catchers_set'}


def setup_pump_catcher(coin: str) -> dict:
    """Set squeeze shorts at pump levels. YOUR EXISTING IMPLEMENTATION."""
    log.info(f"  -> setup_pump_catcher({coin})")
    return {'status': 'pump_catchers_set'}


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    log.info("[*] Temporal Edge -- 2026 Downside Specialist (Enhanced)")
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
