# GeckoTerminal API Reference

Base URL: `https://api.geckoterminal.com/api/v2`

**No authentication required.** Free tier, ~30 requests/min recommended.

## Endpoints

### Trending & Discovery

#### GET /networks/solana/trending_pools
Trending pools on Solana — high activity tokens.
```
Optional params: ?page=1
Returns: Top trending pools with full metrics
```

#### GET /networks/solana/new_pools
Recently created pools — catch new launches.
```
Optional params: ?page=1
```

### Pool Data

#### GET /networks/solana/pools/{poolAddress}
Get detailed pool data by address.
```
Example: /networks/solana/pools/7qbRF6YsyGuLUVs6Y1sfC93Ym7WBBmKKEmR2Cvrmpump
```

#### GET /networks/solana/pools/multi/{addresses}
Get multiple pools (comma-separated, up to 30).

### Token Data

#### GET /networks/solana/tokens/{tokenAddress}
Get token info and associated pools.

#### GET /networks/solana/tokens/{tokenAddress}/pools
Get all pools for a specific token.

### OHLCV (Candlestick Data)

#### GET /networks/solana/pools/{poolAddress}/ohlcv/{timeframe}
Get candlestick data for charting.
```
Timeframes: minute, hour, day
Params:
  - aggregate: 1, 5, 15 (for minute); 1, 4, 12 (for hour); 1 (for day)
  - before_timestamp: Unix timestamp
  - limit: Number of candles (max 1000)
  - currency: usd (default) or token

Example: /networks/solana/pools/{pool}/ohlcv/minute?aggregate=15&limit=100
```

### Networks & DEXes

#### GET /networks
List all supported networks.

#### GET /networks/solana/dexes
List all DEXes on Solana.

## Response Fields (Pool Data)

```json
{
  "id": "solana_poolAddress",
  "type": "pool",
  "attributes": {
    "name": "TOKEN / SOL",
    "address": "poolAddress",
    "base_token_price_usd": "0.001234",
    "quote_token_price_usd": "100.00",
    "fdv_usd": "10000000",
    "market_cap_usd": "5000000",
    "pool_created_at": "2024-01-15T10:30:00Z",
    "reserve_in_usd": "500000",
    "price_change_percentage": {
      "m5": "1.5",
      "m15": "3.2",
      "m30": "-0.5",
      "h1": "10.2",
      "h6": "25.5",
      "h24": "150.3"
    },
    "transactions": {
      "m5": { "buys": 50, "sells": 30, "buyers": 40, "sellers": 25 },
      "h1": { "buys": 500, "sells": 300, "buyers": 200, "sellers": 150 },
      "h24": { "buys": 5000, "sells": 3000, "buyers": 1500, "sellers": 1000 }
    },
    "volume_usd": {
      "m5": "10000",
      "h1": "500000",
      "h24": "5000000"
    }
  }
}
```

## Key Differences from DexScreener

- **Unique buyers/sellers count** — better for detecting organic vs wash trading
- **OHLCV endpoint** — proper candlestick data for charting
- **More granular timeframes** — m5, m15, m30 price changes
- **CoinGecko integration** — market_cap_usd when token is listed
