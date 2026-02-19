# DexScreener API Reference

Base URL: `https://api.dexscreener.com`

**No authentication required.** Rate limits: 60-300 requests/min depending on endpoint.

## Endpoints

### Token Boosts (Signal Detection)

#### GET /token-boosts/latest/v1
Latest boosted tokens — catch new promotions early.
```
Rate limit: 60/min
Response: Array of boosted tokens with totalAmount, links, description
```

#### GET /token-boosts/top/v1
Top boosted tokens by total spend — high visibility tokens.
```
Rate limit: 60/min
Response: Same structure, sorted by totalAmount descending
```

### Token/Pair Data

#### GET /tokens/v1/{chainId}/{tokenAddresses}
Get pair data for one or multiple tokens (up to 30, comma-separated).
```
Example: /tokens/v1/solana/So11111111111111111111111111111111111111112
Rate limit: 300/min
```

#### GET /token-pairs/v1/{chainId}/{tokenAddress}
Get all pools trading a specific token.
```
Example: /token-pairs/v1/solana/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
Rate limit: 300/min
```

#### GET /latest/dex/pairs/{chainId}/{pairId}
Get specific pair by chain and pair address.
```
Example: /latest/dex/pairs/solana/7qbRF6YsyGuLUVs6Y1sfC93Ym7WBBmKKEmR2Cvrmpump
Rate limit: 300/min
```

#### GET /latest/dex/search?q={query}
Search pairs by token name, symbol, or address.
```
Example: /latest/dex/search?q=BONK
Rate limit: 300/min
```

### Response Fields (Pair Data)

```json
{
  "chainId": "solana",
  "dexId": "raydium",
  "pairAddress": "...",
  "baseToken": { "address": "...", "name": "...", "symbol": "..." },
  "quoteToken": { "address": "...", "name": "...", "symbol": "..." },
  "priceUsd": "0.001234",
  "priceNative": "0.00001234",
  "txns": {
    "m5": { "buys": 10, "sells": 5 },
    "h1": { "buys": 100, "sells": 80 },
    "h6": { "buys": 500, "sells": 400 },
    "h24": { "buys": 2000, "sells": 1500 }
  },
  "volume": { "m5": 1000, "h1": 50000, "h6": 200000, "h24": 1000000 },
  "priceChange": { "m5": 0.5, "h1": 2.3, "h6": 10.5, "h24": -5.2 },
  "liquidity": { "usd": 500000, "base": 1000000, "quote": 5000 },
  "fdv": 10000000,
  "pairCreatedAt": 1700000000000
}
```

### Other Endpoints

#### GET /token-profiles/latest/v1
Latest token profiles (metadata updates).

#### GET /orders/v1/{chainId}/{tokenAddress}
Check paid orders for a token (promotional status).
