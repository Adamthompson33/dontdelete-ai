# Jupiter Swap API Reference

**Requires API key:** `JUPITER_API_KEY` (set in env)

Base URL: `https://api.jup.ag/swap/v1`

Jupiter is Solana's leading DEX aggregator — routes through 20+ DEXes to find best price.

## Endpoints

### GET /quote
Get the best swap route for a token pair.

**Parameters:**
| Param | Description |
|-------|-------------|
| `inputMint` | Input token mint address |
| `outputMint` | Output token mint address |
| `amount` | Amount in smallest units (lamports for SOL) |
| `slippageBps` | Slippage tolerance in basis points (50 = 0.5%) |
| `restrictIntermediateTokens` | `true` for more stable routes |
| `onlyDirectRoutes` | `true` to skip multi-hop routes |

**Example:**
```bash
curl "https://api.jup.ag/swap/v1/quote?\
inputMint=So11111111111111111111111111111111111111112&\
outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&\
amount=100000000&\
slippageBps=50" \
-H "x-api-key: $JUPITER_API_KEY"
```

**Response:**
```json
{
  "inputMint": "So11111111111111111111111111111111111111112",
  "inAmount": "100000000",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "outAmount": "16198753",
  "slippageBps": 50,
  "priceImpactPct": "0",
  "routePlan": [...]
}
```

### POST /swap
Get a transaction to execute the swap.

**Body:**
```json
{
  "quoteResponse": { /* from /quote */ },
  "userPublicKey": "YourWalletAddress",
  "wrapAndUnwrapSol": true,
  "dynamicComputeUnitLimit": true,
  "prioritizationFeeLamports": "auto"
}
```

**Response:**
```json
{
  "swapTransaction": "base64-encoded-transaction",
  "lastValidBlockHeight": 123456789
}
```

### POST /swap-instructions
Get raw instructions instead of a full transaction (for custom tx building).

## Common Token Mints

| Token | Mint Address |
|-------|--------------|
| SOL (wrapped) | `So11111111111111111111111111111111111111112` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` |

## Slippage Guide

| Slippage | Use Case |
|----------|----------|
| 50 bps (0.5%) | Stable pairs, high liquidity |
| 100 bps (1%) | Normal memecoin trades |
| 300 bps (3%) | Volatile / low liquidity |
| 500+ bps | Extreme volatility, risky |

## Flow: Quote → Swap → Sign → Send

1. **Get quote** — `GET /quote`
2. **Build transaction** — `POST /swap` with quote + wallet
3. **Sign transaction** — Use wallet private key
4. **Send transaction** — Submit to Solana RPC

## Rate Limits

- Free tier: 60 requests/minute
- With API key: Higher limits based on plan
- Use `x-api-key` header for authenticated requests

## Tips

- Always use `restrictIntermediateTokens=true` for more reliable routes
- For memecoins, increase slippage (1-3%)
- Check `priceImpactPct` — above 5% is risky
- Use `dynamicComputeUnitLimit` for better success rate
