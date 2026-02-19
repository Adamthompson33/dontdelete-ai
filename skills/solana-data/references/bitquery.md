# Bitquery API Reference

**Requires API key:** `BITQUERY_API_KEY` (set in env)

Base URL: `https://streaming.bitquery.io/graphql`

Bitquery provides indexed Solana data via GraphQL — perfect for holder analysis, wallet tracking, and building bubble maps.

## Authentication

```bash
curl -X POST https://streaming.bitquery.io/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BITQUERY_API_KEY" \
  -d '{"query": "..."}'
```

## Key Capabilities

| Feature | Use Case |
|---------|----------|
| Token Holders | Bubble maps, distribution analysis |
| Balance Updates | Track wallet changes in real-time |
| DEX Trades | Pumpfun, Raydium, Meteora, Orca trades |
| Transfers | Track token flows between wallets |
| Instructions | Raw Solana instruction data |

## Common Queries

### Get Top Token Holders
```graphql
query TopHolders($token: String!) {
  Solana {
    BalanceUpdates(
      where: {
        BalanceUpdate: {
          Currency: { MintAddress: { is: $token } }
        }
      }
      orderBy: { descending: BalanceUpdate_Balance }
      limit: { count: 100 }
    ) {
      BalanceUpdate {
        Account { Address }
        Balance
        Currency { Symbol Name MintAddress }
      }
    }
  }
}
```

### Get Token Transfers
```graphql
query TokenTransfers($token: String!, $limit: Int) {
  Solana {
    Transfers(
      where: {
        Transfer: {
          Currency: { MintAddress: { is: $token } }
        }
      }
      orderBy: { descending: Block_Time }
      limit: { count: $limit }
    ) {
      Transfer {
        Sender
        Receiver
        Amount
        Currency { Symbol }
      }
      Block { Time }
      Transaction { Signature }
    }
  }
}
```

### Get DEX Trades for Token
```graphql
query DexTrades($token: String!) {
  Solana {
    DEXTrades(
      where: {
        Trade: {
          Buy: { Currency: { MintAddress: { is: $token } } }
        }
      }
      orderBy: { descending: Block_Time }
      limit: { count: 100 }
    ) {
      Trade {
        Buy { Amount Currency { Symbol } Price }
        Sell { Amount Currency { Symbol } }
        Dex { ProtocolName }
      }
      Block { Time }
    }
  }
}
```

### Get Wallet Token Balances
```graphql
query WalletBalances($wallet: String!) {
  Solana {
    BalanceUpdates(
      where: {
        BalanceUpdate: {
          Account: { Address: { is: $wallet } }
        }
      }
      orderBy: { descending: BalanceUpdate_Balance }
    ) {
      BalanceUpdate {
        Balance
        Currency { Symbol Name MintAddress }
      }
    }
  }
}
```

## Bubble Map Data Structure

To build a bubble map, query top holders and calculate:
1. **Holder concentration** — Top 10 wallets % of supply
2. **Dev/insider wallets** — Check if top holders are linked
3. **Distribution score** — How spread out holdings are

Red flags:
- Top wallet holds > 10% (excluding LP)
- Multiple top wallets funded from same source
- Recent large transfers between top holders

## Real-time Subscriptions

Change `query` to `subscription` for WebSocket streams:
```graphql
subscription LiveTrades($token: String!) {
  Solana {
    DEXTrades(
      where: {
        Trade: {
          Buy: { Currency: { MintAddress: { is: $token } } }
        }
      }
    ) {
      Trade { ... }
    }
  }
}
```

## Rate Limits

- Free tier: Limited queries/day
- API key: Higher limits based on plan
- Streaming: Requires enterprise plan

## DEX Coverage

- Pumpfun (bonding curve + AMM)
- Raydium (AMM, CLMM, CPMM)
- Meteora (DLMM, DYN)
- Jupiter (aggregator)
- Orca (Whirlpool)
- OpenBook, Phoenix, Lifinity
