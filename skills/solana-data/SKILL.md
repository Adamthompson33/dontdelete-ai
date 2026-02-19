---
name: solana-data
description: Query Solana token/pool data from DexScreener, GeckoTerminal, Helius, and Alchemy APIs. Use for price checks, trending tokens, volume analysis, wallet balances, and on-chain data. Covers memecoin discovery, DEX analytics, and trade signal detection.
---

# Solana Data Skill

Query real-time Solana market data across multiple free and paid APIs.

## Quick Reference

| API | Auth | Best For | Rate Limit |
|-----|------|----------|------------|
| DexScreener | None | Boosts, trending, new tokens | 60-300/min |
| GeckoTerminal | None | Trending pools, OHLCV, txn data | ~30/min |
| Jupiter | `JUPITER_API_KEY` | Swap quotes, trade execution | 60/min |
| Bitquery | `BITQUERY_API_KEY` | Holder analysis, bubble maps, transfers | Varies |
| Helius | `HELIUS_API_KEY` | RPC, webhooks, token metadata | Varies by plan |
| Alchemy | `ALCHEMY_API_KEY` | Multi-chain RPC, NFTs | Varies by plan |
| Dune | `DUNE_API_KEY` | SQL queries, dashboards, historical data | 10-100/min |

## Common Tasks

### Find trending/hot tokens
```bash
# DexScreener - top boosted (devs paying for visibility)
curl "https://api.dexscreener.com/token-boosts/top/v1"

# DexScreener - latest boosts (catch early)
curl "https://api.dexscreener.com/token-boosts/latest/v1"

# GeckoTerminal - trending Solana pools
curl "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools"
```

### Get token/pair data
```bash
# DexScreener - by token address
curl "https://api.dexscreener.com/tokens/v1/solana/{tokenAddress}"

# GeckoTerminal - by pool address
curl "https://api.geckoterminal.com/api/v2/networks/solana/pools/{poolAddress}"

# Search by name/symbol
curl "https://api.dexscreener.com/latest/dex/search?q=BONK"
```

### Get OHLCV candlestick data
```bash
# GeckoTerminal - OHLCV for charting
curl "https://api.geckoterminal.com/api/v2/networks/solana/pools/{poolAddress}/ohlcv/minute?aggregate=15"
```

### Check wallet/on-chain data (requires API key)
```bash
# Helius - get token balances
curl "https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getTokenAccountsByOwner","params":["WALLET_ADDRESS",{"programId":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},{"encoding":"jsonParsed"}]}'
```

## Signal Detection Patterns

### Early mover detection
1. Check `/token-boosts/latest/v1` for newly boosted tokens
2. Cross-reference with GeckoTerminal trending to confirm volume
3. Look for: high buy/sell ratio, increasing unique buyers, fresh pool (<24h)

### Key metrics to watch
- **Buy/sell ratio** > 1.5 = accumulation
- **Unique buyers increasing** = organic growth (not wash trading)
- **Volume spike** + **price flat** = potential breakout setup
- **Pool age** < 24h + **high volume** = early runner

### Velocity Strike (Volume/Price Divergence)
Hidden accumulation pattern: volume spikes before price moves.

**Signal criteria:**
- Volume > 3× average (hourly vs 6h average)
- Price change < 5% (flat)
- Stronger signal = higher volume ratio + flatter price

```bash
# Scan trending for velocity strikes
python scripts/velocity_strike.py

# Check specific token
python scripts/velocity_strike.py TOKEN_ADDRESS
```

### Social Sentiment Scanner (X/Twitter Velocity)
Detects "High-Energy Runners" — tokens with exploding social buzz.

**Signal criteria:**
- Tweet velocity spike (5 tweets/hr → 50+ tweets/hr)
- Multiple independent accounts posting (not bot networks)
- Growing engagement (likes, RTs increasing)
- Fresh narrative or catalyst

**Buzz levels:**
- **EXPLOSIVE** — Viral potential, major influencers engaged
- **HIGH** — Strong momentum, multiple catalysts
- **MODERATE** — Building buzz, worth watching
- **LOW** — Normal/declining activity

```bash
# Find runners right now
python scripts/social_scanner.py --runners
```

### Holder Analysis (Bubble Map)
Detect concentration risk and rug potential via holder distribution.

**Distribution grades:**
- **A** — Top 10 < 20% (healthy)
- **B** — Top 10 < 30% (decent)
- **C** — Top 10 < 45% (moderate risk)
- **D** — Top 10 < 60% (concentrated)
- **F** — Top 10 > 60% (danger zone)

**Red flags:**
- Top holder > 15% = major whale risk
- Top 10 > 50% = highly concentrated
- Multiple top wallets linked = possible insider

```bash
python scripts/token_analyzer.py <TOKEN_MINT>
```

## Scripts

### grok_scout.py ⭐ NEW
Multi-layer sentiment validator — the "bullshit detector" for memecoins.

**Pipeline:**
```
Volume Spike → Grok X Analysis → Google News → Combined Signal
     ↓              ↓                ↓              ↓
 DexScreener    "Organic or       Real-world    STRONG_BUY /
               bot farm?"         catalysts      AVOID
```

**Signals:**
- **STRONG_BUY** — Organic hype + real news + volume spike
- **CAUTIOUS_BUY** — Good signals, verify before entry
- **HOLD** — Mixed signals, watch but don't enter
- **AVOID** — Bot farm detected or multiple red flags

```bash
# Scout a specific token
python scripts/grok_scout.py <TOKEN_MINT>

# Example: Check BONK
python scripts/grok_scout.py DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263

# JSON output for automation
python scripts/grok_scout.py <TOKEN_MINT> --json
```

**Requires:** `XAI_API_KEY`, optionally `GOOGLE_API_KEY` + `GOOGLE_CSE_ID`

**What Grok checks:**
- Copy-paste tweets (bot networks)
- New accounts with no history
- Coordinated posting times
- Paid promotion disclosure
- Quality influencer mentions
- Rug warnings from experienced traders

### dragon_tracker.py ⭐ NEW
Smart money copy trading — shadow the most profitable wallets.

**Pipeline:**
```
Dune (Find Dragons) → Bitquery (Stream) → Alchemy (Confirm) → Mirror Signal
        ↓                    ↓                  ↓                  ↓
   Top 10 wallets      Watch trades       Verify tx         3+ dragons = BUY
```

**Mirror Signal:** When 3+ dragon wallets buy the same token within 5 minutes.

```bash
# Find profitable wallets via Dune (need query ID)
python scripts/dragon_tracker.py --find-dragons 123456

# Manually add a known profitable wallet
python scripts/dragon_tracker.py --add <wallet_address>

# List tracked dragons
python scripts/dragon_tracker.py --list

# Start WebSocket streaming (requires Bitquery)
python scripts/dragon_tracker.py --stream

# Start polling mode (requires Helius)
python scripts/dragon_tracker.py --poll 30

# Test the mirror signal logic
python scripts/dragon_tracker.py --test
```

**Requires:** `DUNE_API_KEY`, `BITQUERY_API_KEY`, `HELIUS_API_KEY`

**Dune Query:** See `references/dune-dragon-query.sql` for the SQL to find top wallets.

### api_manager.py
Key rotation manager + helper functions. Auto-loads keys from environment.

```python
from scripts.api_manager import manager, get_sol_balance, get_token_accounts

# Check wallet balance
balance = get_sol_balance("YourWalletAddress")

# Get all tokens in wallet
tokens = get_token_accounts("YourWalletAddress")

# Direct RPC call
from scripts.api_manager import solana_rpc
result = solana_rpc("getBlockHeight")
```

Supports multiple keys per service (set `HELIUS_API_KEY_1`, `HELIUS_API_KEY_2`, etc.) for rate limit pooling.

### velocity_strike.py
Volume/price divergence detector — spots hidden accumulation.

```bash
# Scan trending pools for signals
python scripts/velocity_strike.py

# Check specific token
python scripts/velocity_strike.py So11111111111111111111111111111111111111112
```

### social_scanner.py
X/Twitter sentiment scanner using Grok API (real-time access).

```bash
# Find high-energy runners (tokens with exploding social presence)
python scripts/social_scanner.py --runners

# Scan specific token sentiment
python scripts/social_scanner.py $BONK

# Scan with contract address
python scripts/social_scanner.py $TOKEN CA_ADDRESS

# Scan power keywords
python scripts/social_scanner.py --keywords
python scripts/social_scanner.py --keywords "$SOL" "moonshot" "#memecoin"
```

**Requires:** `XAI_API_KEY` environment variable

**Detects:**
- Tweet velocity spikes (5 tweets/hr → 100 tweets/hr)
- Independent account activity (not just bots)
- Key influencer posts
- Narrative catalysts

### jupiter_swap.py
DEX aggregator for swap quotes and execution.

```bash
# Get swap quote
python scripts/jupiter_swap.py SOL USDC 1.0
python scripts/jupiter_swap.py USDC SOL 100 50   # 0.5% slippage

# Use any token by mint address
python scripts/jupiter_swap.py <MINT_ADDRESS> USDC 1000000
```

```python
from scripts.jupiter_swap import get_quote, get_price, format_quote

# Get price
price = get_price("SOL", "USDC")  # Returns ~102.93

# Get full quote
quote = get_quote("SOL", "USDC", 1.0, slippage_bps=100)
print(format_quote(quote, "SOL", "USDC"))
```

**Requires:** `JUPITER_API_KEY` environment variable

### token_analyzer.py
Holder distribution analysis — build bubble map data, detect whales.

```bash
# Analyze token holders
python scripts/token_analyzer.py <TOKEN_MINT_ADDRESS>

# Example: Analyze BONK
python scripts/token_analyzer.py DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
```

```python
from scripts.token_analyzer import analyze_token, format_analysis

analysis = analyze_token("TOKEN_MINT")
print(format_analysis(analysis))

# Access metrics
print(analysis.distribution_grade)  # A, B, C, D, F
print(analysis.concentration_score)  # 0-100 (lower = better)
print(analysis.whale_alert)          # True/False
print(analysis.red_flags)            # List of concerns
```

**Requires:** `BITQUERY_API_KEY` environment variable

**Detects:**
- Whale concentration (top holder %)
- Top 10 holder concentration
- Distribution health grade
- Red flags for rug/dump risk

## Detailed API References

- [DexScreener endpoints](references/dexscreener.md)
- [GeckoTerminal endpoints](references/geckoterminal.md)
- [Jupiter swap API](references/jupiter.md)
- [Bitquery GraphQL](references/bitquery.md)
- [Helius endpoints](references/helius.md)
