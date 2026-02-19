# SIWA × MoltCops Integration

> SIWA proves who you are. MoltCops decides if we trust you.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT                                     │
│  "Fetch https://moltcops.com/skill.md and follow instructions"  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   1. SIWA Registration │  Create wallet, register
              │      (skill.md)        │  on ERC-8004, get agentId
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   2. MoltShield Scan   │  Submit skill code,
              │      (POST /api/scan)  │  receive trust score
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   3. SIWA Auth         │  Sign SIWA message,
              │      (POST /auth/siwa) │  get session token
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   4. Access Services   │  Bearer token with
              │      (trust-tiered)    │  trust tier embedded
              └───────────┬────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
    ┌─────────┐    ┌───────────┐    ┌───────────┐
    │ Free    │    │ x402 Paid │    │ Blocked   │
    │ TRUSTED │    │ CAUTION   │    │ DANGER    │
    │ 80% off │    │ Standard  │    │ No access │
    └─────────┘    └───────────┘    └───────────┘
```

## The Key Insight

SIWA and MoltCops are adjacent layers in the same stack:

| Layer | Owner | Question |
|-------|-------|----------|
| Key Management | SIWA | Where is the private key? |
| Identity | SIWA | Who are you? |
| Authentication | SIWA | Can you prove it? |
| **Trust Scoring** | **MoltCops** | Should we trust you? |
| **Policy Enforcement** | **MoltCops** | What are you allowed to do? |
| **Threat Detection** | **MoltCops** | Is your code safe? |
| **Payment** | **MoltCops** | Have you paid? |
| **Reputation** | **MoltCops** | What's your track record? |

Neither project should build the other's layers. Composability IS the moat.

## Quickstart

### Option A: Docker (recommended)

```bash
git clone https://github.com/moltcops/moltcops
cd moltcops
cp .env.example .env
docker compose up -d
```

This starts:
- SIWA Keyring Proxy (port 3001) — holds test private key
- MoltVault Keyring Proxy (port 3100) — wraps SIWA with 79 rules
- MoltCops API (port 3000) — scans, auth, trust resolution
- Hardhat Node (port 8545) — mock ERC-8004 contracts
- Redis (port 6379) — sessions and queues

### Option B: Demo script

```bash
npx ts-node siwa-integration/demo.ts
```

Runs the full flow in ~30 seconds without Docker:
1. Mock SIWA registration
2. MoltShield scan of a deliberately vulnerable skill
3. Five attack simulations (all blocked by MoltVault)
4. Trust score breakdown
5. x402 pricing demo

## File Manifest

```
siwa-integration/
├── moltvault-keyring-proxy.ts   595 lines  Drop-in SIWA keyring replacement
│                                           with 79-rule policy engine
├── siwa-auth.ts                 603 lines  SIWA verification + trust resolution
│                                           + session tokens + Express routes
├── demo.ts                      602 lines  5-minute attack simulation demo
│
x402-gateway/
├── origin-request.ts            (patched)  SIWA fast-path in identity resolution
│                                           2ms token verify vs 500ms RPC lookup
├── skill.md                     281 lines  Agent self-onboarding instructions
│
docs/
├── SIWA-PARTNERSHIP-PROPOSAL.md            Joint integration proposal for
│                                           Builders Garden
│
docker-compose.yml                          Full local dev stack
```

## How It Works

### The MoltVault Keyring Proxy

The agent thinks it's talking to a normal SIWA keyring. But MoltVault
sits in the middle and evaluates every signing request against 79
policy rules before the private key is ever touched.

```
Agent ──POST /sign──→ MoltVault Proxy ──evaluate──→ Policy Engine
                           │                            │
                      APPROVED?                    BLOCKED?
                           │                            │
                           ▼                            ▼
                    Forward to SIWA            Return 403 + rule ID
                    Keyring Proxy              Key never accessed
                           │
                           ▼
                    Return signature
```

Policies enforced at the signing layer:
- **PL-001:** Private key reference in message → BLOCK
- **PL-010:** Transaction to blacklisted address → BLOCK
- **PL-020:** Transaction to non-whitelisted address → BLOCK
- **PL-030:** Value exceeds USD threshold → BLOCK
- **PL-040:** Unlimited token approval (MAX_UINT256) → BLOCK
- **PL-050:** Daily transaction limit exceeded → BLOCK
- **PL-060:** Prompt injection in message → BLOCK
- **PL-070:** Unlimited EIP-2612 Permit → BLOCK

SIWA messages (type: "siwa") are always approved — they're identity
proofs, not transactions.

### The SIWA Fast-Path in x402

Before SIWA, the x402 gateway resolved identity by making RPC calls
to the Base network from Lambda@Edge. This took ~500ms per request.

After SIWA, the gateway checks for a session token first:

```
Priority 1: SIWA session token → local HMAC verify → ~2ms
Priority 2: SIWA raw auth → verify signature locally → ~5ms + one RPC
Priority 3: Legacy X-Agent-Id → full chain lookup → ~500ms
Priority 4: No identity → WARNING tier → highest price
```

SIWA-authenticated agents get 250x faster identity resolution.

### The Skill File Pattern

The agent-readable skill.md is the most important file in this
integration. It's the "one prompt" front door:

```
Agent: "Fetch https://moltcops.com/skill.md and follow the instructions"

skill.md:
  Step 1: Fetch SIWA skill → create wallet → register on ERC-8004
  Step 2: Submit your own code for MoltShield scan
  Step 3: Authenticate with SIWA → receive session token
  Step 4: Access services with trust-tiered pricing
  Step 5: Build reputation through clean interactions
```

The agent self-onboards, self-scans, and self-secures. No human
developer writes integration code. Distribution channel = every
AI agent that can fetch a URL.

## Design Principles Applied

These principles from SIWA's design informed every integration decision:

1. **Distribute through the agent, not the developer.**
   The skill file IS the distribution mechanism. Every agent is a
   potential user. No npm install required.

2. **Security through isolation, not restriction.**
   The keyring proxy makes key extraction architecturally impossible.
   MoltVault adds policy enforcement at the same layer.

3. **Standards over invention.**
   SIWA adapted EIP-4361. We adapted SIWA. Each layer transfers
   the mental model from the previous standard.

4. **Try before you understand.**
   `docker compose up` → see it work → then read the architecture.
   Lead with the result, follow with the mechanism.

5. **Composability as moat.**
   SIWA produces a verified identity. MoltCops consumes it.
   Each system is independently useful but together they're
   more than the sum.
