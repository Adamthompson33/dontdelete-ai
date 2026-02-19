# Hyperliquid Trading Bot - 2026 Downside Specialist

## The Thesis

**Astrological Context:**
- BTC was founded in an **Earth Rat year** (2008)
- 2026 is a **Fire Horse year** - direct opposite in Chinese zodiac
- Horse and Rat are 180° apart (one of the worst pairings)
- Fire Horse = volatile and destructive energy

**Price Target:** BTC to $40k or lower  
**Expectation:** Relief rallies will happen, but overall trend is down

---

## Strategy: Three Modes

Simple is better. The 13/33 MA cross catches every big move - plus we're always ready for black swan events.

```
┌─────────────────────────────────────────────────────────────────┐
│                         MARKET REGIME                           │
│                    (13/33 MA Cross on Daily)                    │
├─────────────────────────────────────────────────────────────────┤
│                              │                                  │
│      TRENDING                │           CHOPPY                 │
│   (MAs clearly separated)    │    (MAs close together)          │
│              │               │              │                   │
│              ▼               │              ▼                   │
│   ┌──────────────────┐       │   ┌──────────────────┐           │
│   │ SIMPLE POSITION  │       │   │  NEUTRAL GRID    │           │
│   │                  │       │   │                  │           │
│   │ • 7x short OR    │       │   │ • Buy orders     │           │
│   │ • 3x long        │       │   │   below price    │           │
│   │ • Stop loss      │       │   │ • Sell orders    │           │
│   │ • Ride the move  │       │   │   above price    │           │
│   │ • No grid        │       │   │ • Profit from    │           │
│   │                  │       │   │   volatility     │           │
│   └──────────────────┘       │   └──────────────────┘           │
│                              │                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Mode 1: Trending Market

When the 13 MA crosses below the 33 MA (bearish) or above (bullish):

| Setting | Short | Long |
|---------|-------|------|
| Leverage | **10x** | 3x |
| Stop Loss | 4% | 4% |
| Grid | OFF | OFF |

**Why no grid during trends?**  
The 13/33 cross catches the big moves. That's where the real money is. Just ride it with a stop loss. Don't overcomplicate.

**Why 10x shorts vs 3x longs?**  
2026 bearish thesis (Fire Horse year). We're aggressive on the downside. At 10x, a 10% move = 100% return (or 10% loss with stop).

---

## Mode 2: Choppy Market

When the MAs are close together (within ~1%), there's no clear trend:

| Setting | Value |
|---------|-------|
| Grid Levels | 5 above + 5 below |
| Spacing | 1% between levels |
| Direction | Neutral (no bias) |

**How it works:**
1. Place buy orders below current price
2. Place sell orders above current price
3. As price bounces around, bot buys low and sells high
4. Each round trip = small profit
5. Repeat until trend emerges

**When trend returns:**  
Cancel grid, enter leveraged position.

---

## Mode 3: Flash Crash Catcher (Always Running)

**Reference: October 10, 2025**
- Trump announced 100% tariffs on China
- $3.21 billion liquidated in **60 seconds**
- $19 billion liquidated total that day
- BTC dropped ~15% in minutes, bounced within hours
- Anyone with limit orders at -15% printed money

### The Setup

Limit buy orders sitting at extreme prices, waiting for chaos:

| Drop Level | Action | Take Profit |
|------------|--------|-------------|
| -10% | Buy | +5% from fill |
| -15% | Buy | +5% from fill |
| -20% | Buy | +5% from fill |
| -25% | Buy | +5% from fill |
| -30% | Buy | +5% from fill |

### Short Squeeze Catcher

In a bear market, shorts get crowded. Violent squeezes happen. We catch those too:

| Pump Level | Action | Take Profit |
|------------|--------|-------------|
| +8% | Short | -5% from fill |
| +12% | Short | -5% from fill |
| +15% | Short | -5% from fill |
| +20% | Short | -5% from fill |

### Why This Works

Flash crashes are **liquidity events**. When cascading liquidations hit:
1. Price overshoots fair value (panic selling)
2. Your limit orders get filled at extreme prices
3. Price bounces back as liquidations end
4. You take profit on the bounce

**Capital required:** ~$1,000 sitting in limit orders  
**Expected frequency:** 2-4 major events per year  
**Potential per event:** 5-15% on the filled orders

---

## Risk Management

| Risk | Protection |
|------|------------|
| Wrong direction | 4% stop loss on all trend trades |
| Liquidation (short) | 10x leverage = ~10% to liquidation (stop at 4%) |
| Liquidation (long) | 3x leverage = ~33% to liquidation (very safe) |
| Trapped in grid | Cancel grid when MA cross confirms |
| Choppy losses | Neutral grid has no directional risk |
| Flash crash miss | Orders always sitting, waiting |
| Crash catcher stuck | Take profit orders auto-close |

---

## Files

| File | Purpose |
|------|---------|
| `strategy.py` | Main strategy logic |
| `.env.example` | Environment template |

---

## API Endpoints

### Hyperliquid (Free)
- **Mainnet:** `https://api.hyperliquid.xyz`
- **Testnet:** `https://api.hyperliquid-testnet.xyz`
- **WebSocket:** `wss://api.hyperliquid.xyz/ws`
- **EVM RPC:** `https://rpc.hyperliquid.xyz/evm` (Chain ID: 999)
- **Docs:** https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api

### RPC Providers
| Service | Link | Cost |
|---------|------|------|
| Alchemy HyperEVM | https://www.alchemy.com/rpc/hyperliquid | Free tier |
| HypeRPC | https://hyperpc.app | Freemium |
| Dwellir | https://www.dwellir.com/networks/hyperliquid | ~$49/mo |

### Analytics
| Service | Link | Cost |
|---------|------|------|
| Nansen | https://www.nansen.ai/api | Free trial |
| Dune | https://dune.com/settings/api | Free tier |

---

## Usage

```python
from strategy import run_strategy, check_and_update

# Initial run - detects regime and sets up appropriate mode
run_strategy("BTC", position_size_usd=1000)

# Periodic check (run daily) - updates if regime changes
check_and_update("BTC")
```

---

## Next Steps

1. ☐ Set up Hyperliquid API Agent (get keys)
2. ☐ Test on testnet for 1-2 weeks
3. ☐ Add funding rate monitoring
4. ☐ Add Telegram/Discord alerts
5. ☐ Deploy to VPS for 24/7 operation
