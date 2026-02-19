# Helius API Reference

**Requires API key:** `HELIUS_API_KEY` (set in env)

Base URLs:
- RPC: `https://mainnet.helius-rpc.com/?api-key={key}`
- API: `https://api.helius.xyz/v0`

## RPC Methods (Solana Standard)

Use standard Solana JSON-RPC via Helius endpoint for faster/more reliable responses.

### Get SOL Balance
```bash
curl "https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["WALLET_ADDRESS"]}'
```

### Get Token Accounts (All tokens in wallet)
```bash
curl "https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"getTokenAccountsByOwner",
    "params":[
      "WALLET_ADDRESS",
      {"programId":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
      {"encoding":"jsonParsed"}
    ]
  }'
```

### Get Transaction
```bash
curl "https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getTransaction","params":["TX_SIGNATURE",{"encoding":"jsonParsed","maxSupportedTransactionVersion":0}]}'
```

## Enhanced APIs

### GET /v0/addresses/{address}/balances
Get all token balances for a wallet (simplified).
```bash
curl "https://api.helius.xyz/v0/addresses/{walletAddress}/balances?api-key=$HELIUS_API_KEY"
```

### GET /v0/addresses/{address}/transactions
Get parsed transaction history.
```bash
curl "https://api.helius.xyz/v0/addresses/{walletAddress}/transactions?api-key=$HELIUS_API_KEY"
```

### POST /v0/token-metadata
Get metadata for tokens (batch, up to 100).
```bash
curl "https://api.helius.xyz/v0/token-metadata?api-key=$HELIUS_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"mintAccounts":["TOKEN_MINT_1","TOKEN_MINT_2"]}'
```

## DAS API (Digital Asset Standard)

For NFTs and compressed assets.

### Get Asset
```bash
curl "https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAsset","params":{"id":"ASSET_ID"}}'
```

### Get Assets by Owner
```bash
curl "https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAssetsByOwner","params":{"ownerAddress":"WALLET","page":1,"limit":100}}'
```

## Webhooks

Helius supports webhooks for real-time on-chain events. Configure via dashboard or API.

### Webhook Types
- **Transaction** — trigger on any tx involving an address
- **NFT Events** — sales, listings, bids
- **Token Transfers** — specific token movements

### Create Webhook (via API)
```bash
curl "https://api.helius.xyz/v0/webhooks?api-key=$HELIUS_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{
    "webhookURL": "https://your-endpoint.com/webhook",
    "transactionTypes": ["Any"],
    "accountAddresses": ["ADDRESS_TO_WATCH"],
    "webhookType": "enhanced"
  }'
```

## Use Cases

- **Wallet tracking** — monitor positions, track whale movements
- **Trade execution** — use RPC for sending transactions via Jupiter
- **Real-time alerts** — webhooks for price/volume triggers
- **Token metadata** — get token info for display
