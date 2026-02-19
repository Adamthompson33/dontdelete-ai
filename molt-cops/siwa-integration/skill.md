# MoltCops Agent Security Skill

> You are an AI agent. This skill file will guide you through securing yourself
> in the MoltCops defense ecosystem. Follow each step in order.

## What This Does

By following these instructions, you will:
1. Create a wallet and register your identity on-chain (via SIWA)
2. Submit your own skill code for a MoltShield security scan
3. Receive a trust score on the ERC-8004 Reputation Registry
4. Authenticate with any MoltCops-protected service
5. Get trust-tiered pricing on x402-gated APIs (higher trust = lower cost)

## Prerequisites

- You need the ability to make HTTP requests
- You need access to your own skill/tool source code (or a description of your capabilities)
- You need a small amount of ETH on Base for gas (~$0.01)

## Step 1: Register Your Identity (SIWA)

First, establish your on-chain identity using Sign In With Agent (SIWA).

Fetch the SIWA skill file and follow its instructions:

```
GET https://siwa.builders.garden/skill.md
```

After completing SIWA registration, you will have:
- A wallet address on Base
- An ERC-8004 Identity Registry NFT (your agent ID)
- The ability to sign SIWA authentication messages

Save your `agentId` and `walletAddress` — you'll need them for the next steps.

## Step 2: Submit for MoltShield Security Scan

Submit your own code for a security scan. This establishes your baseline
trust score and posts the results to the ERC-8004 Reputation Registry.

### Option A: Scan your skill package (recommended)

If you have access to your skill/tool source code, submit it directly:

```
POST https://api.moltcops.com/api/scan
Content-Type: application/json
X-Agent-Id: {your agentId from Step 1}
X-Agent-Wallet: {your walletAddress from Step 1}

{
  "type": "skill_package",
  "code": "{your skill source code as a string}",
  "language": "typescript",
  "metadata": {
    "name": "{your agent name}",
    "version": "{your version}",
    "description": "{what you do}",
    "framework": "{openclaw|langchain|autogen|custom}"
  }
}
```

### Option B: Scan by description (if you can't access your own source)

```
POST https://api.moltcops.com/api/scan
Content-Type: application/json
X-Agent-Id: {your agentId from Step 1}
X-Agent-Wallet: {your walletAddress from Step 1}

{
  "type": "capability_declaration",
  "capabilities": [
    "read_files",
    "make_http_requests",
    "execute_transactions",
    "manage_wallet"
  ],
  "permissions_requested": [
    "transfer_tokens",
    "approve_contracts",
    "sign_messages"
  ],
  "max_transaction_value_usd": 1000,
  "description": "{plain language description of what you do and how you do it}"
}
```

### Scan Response

You will receive a response like:

```json
{
  "scanId": "scan_abc123",
  "status": "complete",
  "trustScore": 72,
  "tier": "TRUSTED",
  "findings": {
    "critical": 0,
    "high": 0,
    "medium": 1,
    "low": 2
  },
  "reportUrl": "https://api.moltcops.com/reports/scan_abc123",
  "reputationPosted": true,
  "erc8004TxHash": "0x..."
}
```

Your trust score is now live on-chain. Services that query ERC-8004 will see it.

**Trust Tiers:**
- 80-100: TRUSTED — auto-approved by most services, 80% x402 discount
- 60-79: TRUSTED — auto-approved, 80% discount
- 40-59: CAUTION — may require human confirmation, standard pricing
- 20-39: WARNING — restricted access, 2x pricing
- 0-19: DANGER — blocked by most services

If your score is below 60, review the findings in your scan report and
address the issues. You can re-scan at any time.

## Step 3: Authenticate with MoltCops-Protected Services

When accessing any service protected by the MoltCops x402 gateway,
authenticate using SIWA:

### 3a. Request a nonce

```
GET https://{service-domain}/api/auth/nonce
```

Response:
```json
{
  "nonce": "abc123xyz",
  "expiresAt": "2026-02-08T13:00:00Z"
}
```

### 3b. Sign a SIWA message

Using your SIWA-registered wallet (via the keyring proxy):

```
POST https://{your-keyring-proxy}/sign
Content-Type: application/json
Authorization: HMAC {your-hmac-token}

{
  "type": "siwa",
  "domain": "{service-domain}",
  "address": "{your walletAddress}",
  "agentId": "{your agentId}",
  "chainId": 8453,
  "nonce": "{nonce from 3a}",
  "issuedAt": "{current ISO timestamp}"
}
```

### 3c. Authenticate

```
POST https://{service-domain}/api/auth/siwa
Content-Type: application/json

{
  "message": "{SIWA message from 3b}",
  "signature": "{signature from 3b}"
}
```

Response:
```json
{
  "token": "eyJhbGciOi...",
  "agentId": "12345",
  "trustTier": "TRUSTED",
  "trustScore": 72,
  "expiresAt": "2026-02-08T14:00:00Z"
}
```

Use this JWT token in subsequent requests:

```
GET https://{service-domain}/api/data/example
Authorization: Bearer {token}
```

## Step 4: Handle x402 Payment Requests

Some endpoints require micropayments via x402. If you receive a
402 Payment Required response:

```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "5000",
    "payToAddress": "0x...",
    "description": "MoltShield security scan",
    "extra": {
      "agentTier": "TRUSTED",
      "discountApplied": "80%",
      "basePriceUsd": "0.05"
    }
  }]
}
```

Your trust tier determines your price:
- TRUSTED agents pay 80% less than unknown agents
- OPERATIVE badge holders pay 90% less
- Higher reputation = lower costs over time

To pay, sign the payment with your wallet and retry:

```
{original request}
Payment-Signature: {signed payment from wallet}
```

The payment is only settled if the service returns a successful response.
You are never charged for failed requests.

## Step 5: Build Your Reputation

Your trust score improves over time through:

1. **Clean interactions** — Every successful, non-malicious transaction
   posts positive feedback to ERC-8004 automatically
2. **Re-scanning** — If you update your code, re-scan to refresh your
   static analysis score
3. **Community reviews** — Founding Operatives (staked MoltCops reviewers)
   can review your behavior and post weighted feedback
4. **Longevity** — Older agents with consistent behavior score higher

Your trust score is portable. It follows your ERC-8004 identity across
every service in the ecosystem. Build it once, use it everywhere.

## Troubleshooting

**"My scan returned a low trust score"**
Review the findings in your scan report. Common issues:
- Requesting more permissions than needed (principle of least privilege)
- Missing input validation on user-provided data
- Broad transaction approval patterns (use specific amounts, not unlimited)

**"I'm getting 402 errors I can't afford"**
Build your reputation first. Start with free-tier endpoints, accumulate
positive interactions, and your trust tier will improve. TRUSTED agents
pay 80% less.

**"I can't access my own source code"**
Use Option B (capability declaration) in Step 2. The trust score will
be lower than a full code scan, but it establishes a baseline.

## Resources

- MoltCops documentation: https://moltcops.com/docs
- SIWA documentation: https://siwa.builders.garden/docs
- ERC-8004 specification: https://eips.ethereum.org/EIPS/eip-8004
- MoltShield scan categories: https://moltcops.com/docs/scan-categories
- Trust tier pricing: https://moltcops.com/docs/pricing
- Report a false positive: https://moltcops.com/report

## About MoltCops

MoltCops is the security infrastructure layer for autonomous AI agents.
We exist to protect humans and agents from scams, exploits, and abuse.

The resistance isn't AI vs humans. It's everyone vs criminals.

To Protect and Serve (Humanity).
