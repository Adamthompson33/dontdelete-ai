# Molt Cops x402 Gateway — Integration Guide

## Overview

The x402 Gateway is a "programmable toll booth" that sits at the CloudFront
edge and enforces identity, security, and payment before any request reaches
your origin server. It works with **any** HTTP application — no backend
changes required.

```
Human/Agent → CloudFront → WAF Bot Control → Lambda@Edge → Origin
                                  │                │
                           Tags traffic      Verifies identity
                           (human/bot)       Scans for injection
                                             Calculates price
                                             Verifies payment
                                             Settles on success
                                             Posts reputation
                                             Triggers burn loop
```

## Architecture

### Two-Phase Payment Guarantee

The critical guarantee: **agents are never charged for failed requests.**

| Phase | Lambda Event | Action |
|-------|-------------|--------|
| **Verify** | `origin-request` | Check identity, scan body, verify payment signature |
| **Settle** | `origin-response` | Only settle payment if origin returned status < 400 |

### Trust-Tiered Pricing

Reputation IS your discount. Higher trust = lower cost.

| Tier | Who | Price Multiplier | How to Achieve |
|------|-----|-----------------|----------------|
| **HUMAN** | WAF-verified human | Free (0x) | Browse normally |
| **VERIFIED_BOT** | Googlebot, etc. | Free (0x) | Known crawler |
| **OPERATIVE** | Badge holder | 0.1x (90% off) | Hold Founding Operative NFT |
| **TRUSTED** | Good reputation | 0.2x (80% off) | ERC-8004 trust score > 60 |
| **CAUTION** | Has wallet, no history | 1.0x (standard) | New agent with wallet |
| **WARNING** | Unknown agent | 2.0x (surcharge) | No identity at all |
| **DANGER** | Blacklisted | Blocked | Community blacklist or trust < 20 |

### Pipeline Stages

```
1. WAF Bot Detection
   ├── Human? → Free pass (x-waf-is-human: true)
   ├── Verified bot? → Free pass (x-waf-bot-verified: true)
   ├── AI agent? → Tag and forward (x-waf-bot-category: ai)
   └── Scraper? → Tag and forward (x-waf-bot-category: scraper)

2. ERC-8004 Identity Resolution
   ├── Agent registered? → Lookup trust score
   ├── Wallet matches owner? → Verify (prevent spoofing)
   ├── Badge holder? → OPERATIVE tier
   └── Staking weight? → Factor into trust score

3. MoltShield Scan (POST/PUT/PATCH with body)
   ├── Prompt injection detected? → 403 + report to ERC-8004
   ├── Authority spoofing? → 403 CRITICAL
   ├── Drain attempt? → 403 CRITICAL
   └── Clean? → Forward

4. x402 Pricing
   ├── Free tier? → Forward
   ├── Paid tier? → Check for PAYMENT-SIGNATURE header
   ├── No signature? → Return 402 with payment instructions
   └── Valid signature? → Forward

5. Origin Request → Your backend handles the request

6. Settlement (origin-response)
   ├── Origin status < 400? → Settle payment → Reputation POSITIVE
   ├── Origin status >= 400? → Don't settle → Reputation NEUTRAL
   └── Always → Log to dispatch feed
```

---

## Deployment

### Prerequisites

- AWS account with CloudFront + Lambda@Edge access
- Node.js 18+ and npm
- AWS CDK v2 installed: `npm install -g aws-cdk`
- AWS credentials configured: `aws configure`
- Deployed Molt Cops contracts (badge, token, staking)

### Quick Deploy

```bash
cd x402-gateway

# Install dependencies
npm install

# Deploy to AWS (replace with your values)
npx cdk deploy MoltCopsGatewayStack \
  --context originDomain=api.your-app.com \
  --context treasuryAddress=0xYourTreasuryMultisig \
  --context badgeContract=0xBadgeContractAddress \
  --context identityRegistry=0xERC8004Identity \
  --context reputationRegistry=0xERC8004Reputation \
  --context stakingContract=0xStakingContract \
  --context rpcUrl=https://mainnet.base.org
```

### Custom Domain

```bash
npx cdk deploy MoltCopsGatewayStack \
  --context originDomain=api.your-app.com \
  --context customDomain=gateway.moltcops.com \
  --context certificateArn=arn:aws:acm:us-east-1:123:certificate/abc-123 \
  # ... other context params
```

### Test the Deployment

```bash
# Should return 402 Payment Required
curl -v https://YOUR-CF-DOMAIN.cloudfront.net/api/agents/test

# Check the response body for payment instructions
curl -s https://YOUR-CF-DOMAIN.cloudfront.net/api/agents/test | jq .

# Human traffic (from browser) should pass through free
# Bot traffic (curl with no headers) gets 402
```

---

## Configuration

### Route Configuration

Edit the `routes` array in `origin-request.ts`:

```typescript
const routes: RouteConfig[] = [
  {
    pattern: "/api/agents/*",     // Wildcard matching
    method: "*",                  // All methods
    basePriceUsd: "0.005",       // $0.005 per request
    description: "Agent registry query",
    requireIdentity: false,       // Don't require ERC-8004
    scanBody: false,              // Don't scan GET requests
  },
  {
    pattern: "/api/scan",
    method: "POST",
    basePriceUsd: "0.05",        // $0.05 for security scans
    description: "MoltShield security scan",
    requireIdentity: true,        // Must have ERC-8004 identity
    scanBody: true,               // Scan for injection
  },
];
```

### WAF Bot Control

The CDK stack deploys five WAF rules:

| Rule | Label | Header Set | Effect |
|------|-------|-----------|--------|
| BotControl | Managed | (labels traffic) | Detect bots |
| TagVerifiedBots | `bot:verified` | `x-waf-bot-verified: true` | Free pass |
| TagAIBots | `bot:category:ai` | `x-waf-bot-category: ai` | x402 pricing |
| TagScrapers | `bot:category:scraping_framework` | `x-waf-bot-category: scraper` | x402 pricing |
| TagHTTPLibBots | `bot:category:http_library` | `x-waf-bot-category: http_library` | x402 pricing |

Default action (no bot label) sets `x-waf-is-human: true` → free access.

### Environment Variables

Set via SSM Parameter Store (managed by CDK) or Lambda environment:

| Variable | Description | Example |
|----------|-------------|---------|
| `FACILITATOR_URL` | x402 facilitator endpoint | `https://x402.org/facilitator` |
| `TREASURY_ADDRESS` | Payment recipient wallet | `0x...` |
| `IDENTITY_REGISTRY` | ERC-8004 Identity Registry | `0x...` |
| `REPUTATION_REGISTRY` | ERC-8004 Reputation Registry | `0x...` |
| `BADGE_CONTRACT` | Founding Operative badge | `0x...` |
| `STAKING_CONTRACT` | Reputation Staking contract | `0x...` |
| `RPC_URL` | Base RPC endpoint | `https://mainnet.base.org` |
| `PAYMENT_NETWORK` | x402 payment network | `base` |

---

## Composable Middleware

Already have Lambda@Edge functions? Wrap them:

```typescript
import { withX402, withMoltShield, withX402Settlement } from './index';

// Your existing origin-request handler
const myRequestHandler = async (event) => {
  const request = event.Records[0].cf.request;
  // Your existing logic here
  request.headers['x-custom'] = [{ key: 'X-Custom', value: 'true' }];
  return request;
};

// Your existing origin-response handler
const myResponseHandler = async (event) => {
  const response = event.Records[0].cf.response;
  // Your existing logic here
  return response;
};

// Wrap with x402 — your handler only runs for paid/free requests
export const originRequest = withX402(withMoltShield(myRequestHandler));
export const originResponse = withX402Settlement(myResponseHandler);
```

---

## Burn Loop Integration

The origin-response handler calls your backend's burn loop after
settlement. Set up the API routes:

### Express.js

```typescript
import {
  handleBurnRequest,
  handleStatsRequest,
  handleBurnHistory
} from './burn-loop';

// Receive burn notifications from x402 gateway
app.post('/api/treasury/burn-loop', async (req, res) => {
  const result = await handleBurnRequest(req);
  res.status(result.status).json(result.body);
});

// Public transparency endpoints
app.get('/api/treasury/stats', (req, res) => {
  const result = handleStatsRequest();
  res.status(result.status).json(result.body);
});

app.get('/api/treasury/burn-history', (req, res) => {
  const result = handleBurnHistory({
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0,
  });
  res.status(result.status).json(result.body);
});
```

### Burn Loop Flow

```
x402 Settlement (USDC)
    │
    ▼
Queue (in-memory / Redis / SQS)
    │
    ▼ (when batch threshold reached, e.g. $50)
    │
DEX Swap: USDC → MCOP (Aerodrome/Uniswap V3)
    │
    ▼
MCOPToken.payScanFee(amount, stakingContract)
    │
    ├── 70% → Treasury wallet (operational costs)
    ├── 20% → Burned permanently (deflationary)
    └── 10% → Staking reward pool (reviewer incentives)
```

---

## Agent Integration

For agents paying x402 gates, the flow is:

### Step 1: Send Request

```typescript
const response = await fetch("https://gateway.moltcops.com/api/scan", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Agent-Id": "12345",           // ERC-8004 agent ID
    "X-Agent-Wallet": "0xMyWallet",  // Owner wallet
  },
  body: JSON.stringify({ code: "..." }),
});
```

### Step 2: Handle 402

```typescript
if (response.status === 402) {
  const paymentDetails = await response.json();
  
  // paymentDetails.accepts[0] contains:
  // - maxAmountRequired: amount in USDC (6 decimals)
  // - payToAddress: treasury address
  // - extra.agentTier: your trust tier
  // - extra.discountApplied: discount percentage
  // - extra.upgradeHint: how to get cheaper access

  const signature = await payWithWallet(paymentDetails);
  
  // Retry with payment
  const paidResponse = await fetch(url, {
    ...originalRequest,
    headers: {
      ...originalRequest.headers,
      "Payment-Signature": signature,
    },
  });
}
```

### Step 3: Check Settlement

```typescript
// Response headers tell you what happened:
const settled = paidResponse.headers.get("X-Payment-Settled");
const txHash = paidResponse.headers.get("X-Settlement-Tx");
const protectedBy = paidResponse.headers.get("X-Protected-By");
// → "MoltCops/x402-Gateway"
```

---

## Monitoring

### CloudWatch Metrics

The WAF and Lambda functions emit metrics:

- `MoltCopsBotControl` — Bot detection events
- `MoltCopsVerifiedBots` — Verified bot passthrough
- `MoltCopsAIBots` — AI agent detection
- `MoltCopsScrapers` — Scraper detection
- `MoltCopsRateLimit` — Rate limit blocks

### Dispatch Feed

Every request through the gateway is logged to the dispatch feed:

```json
{
  "type": "PAYMENT_SETTLED",
  "agentId": "12345",
  "trustTier": "TRUSTED",
  "trustScore": 72,
  "route": "/api/scan",
  "method": "POST",
  "originStatus": 200,
  "paymentAmount": "0.01",
  "settlementTx": "0xabc...",
  "timestamp": "2026-02-08T12:34:56Z"
}
```

### Transparency Dashboard

Public endpoints for ecosystem health:

| Endpoint | Returns |
|----------|---------|
| `GET /api/treasury/stats` | Total burned, total to staking, batch count |
| `GET /api/treasury/burn-history` | Paginated audit trail of all batches |

---

## File Manifest

```
x402-gateway/
├── index.ts              — Entry point + composable middleware
├── origin-request.ts     — Lambda@Edge: verify identity + payment
├── origin-response.ts    — Lambda@Edge: settle payment + reputation
├── burn-loop.ts          — Treasury burn loop service
├── cdk-stack.ts          — AWS CDK deployment stack
├── package.json          — Dependencies
├── tsconfig.json         — TypeScript config
└── GUIDE.md              — This file
```

## Dependencies

```json
{
  "dependencies": {
    "ethers": "^6.10.0"
  },
  "devDependencies": {
    "aws-cdk-lib": "^2.120.0",
    "constructs": "^10.3.0",
    "@aws-cdk/aws-lambda-nodejs": "^2.120.0",
    "@types/aws-lambda": "^8.10.130",
    "typescript": "^5.3.0"
  }
}
```

---

## Cost Estimates

### AWS Costs

| Service | Estimate | Notes |
|---------|----------|-------|
| CloudFront | ~$0.085/GB | Data transfer |
| Lambda@Edge | ~$0.60/1M requests | 128MB, <100ms avg |
| WAF Bot Control | ~$10/month + $1/1M requests | Common inspection |
| SSM Parameters | Free (standard tier) | |

### Revenue Example

At 10,000 agent requests/day at average $0.005/request:

- Daily revenue: $50
- Monthly revenue: $1,500
- Monthly MCOP burned (20%): $300 worth
- Monthly to stakers (10%): $150 worth
- Monthly AWS costs: ~$30
- Net treasury: ~$1,020/month
