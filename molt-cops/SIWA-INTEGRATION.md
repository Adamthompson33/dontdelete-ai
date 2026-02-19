# SIWA Integration Analysis — ULTRA THINK

## What Makes SIWA Genius?

### 1. **Key Isolation Architecture** (The Crown Jewel)

```
Agent Process                     Keyring Proxy Server
(potentially compromised)         (trusted boundary)
        │                                 │
        │ signMessage("hello")            │
        ├────────────────────────────────►│
        │ + HMAC-SHA256 auth              │ Loads key
        │                                 │ Signs
        │◄────────────────────────────────┤ Discards key
        │ { signature, address }          │
        │                                 │
        │ ❌ CANNOT: getPrivateKey()      │
```

**Why this is brilliant:**
- Even under **full agent compromise** (arbitrary code execution via prompt injection), the attacker can only REQUEST signatures
- They can NEVER extract the private key
- The key never enters the agent's memory space — it's a separate OS process

**SOLID Principle: Single Responsibility**
- The agent's job: make decisions, compose requests
- The keyring's job: hold keys, sign things
- Neither does the other's job

### 2. **Challenge-Response Protocol**

```
Agent                    Server                     Blockchain
  │                        │                            │
  │ GET /nonce             │                            │
  │───────────────────────►│                            │
  │◄───────────────────────│                            │
  │ nonce: "abc123"        │                            │
  │                        │                            │
  │ Sign SIWA message      │                            │
  │ (via keyring proxy)    │                            │
  │                        │                            │
  │ POST /verify           │                            │
  │ + message + signature  │                            │
  │───────────────────────►│                            │
  │                        │ Verify signature           │
  │                        │ Parse agentId              │
  │                        │ ownerOf(agentId) ──────────►│
  │                        │◄────────────────────────────│
  │                        │ Address matches?           │
  │◄───────────────────────│                            │
  │ JWT session token      │                            │
```

**Why this is brilliant:**
- Server-issued nonce prevents replay attacks
- On-chain ownership check = unforgeable identity
- No passwords, no API keys — cryptographic proof

**SOLID Principle: Dependency Inversion**
- The server doesn't trust the agent's claim
- It trusts the BLOCKCHAIN's state
- High-level policy depends on abstract verification, not concrete agent assertions

### 3. **Composable Verification Criteria**

```typescript
verifySIWA(message, signature, domain, nonceValid, client, {
  minScore: 60,                    // Reputation threshold
  minFeedbackCount: 10,            // Track record required
  requiredServices: ['moltshield'], // Must support specific services
  mustBeActive: true,              // No dormant agents
  custom: async (agent) => {       // Arbitrary business logic
    return agent.metadata?.tier === 'enterprise';
  }
});
```

**Why this is brilliant:**
- Identity verification is SEPARATE from authorization criteria
- Each service can define its own requirements
- Extensible without modifying core protocol

**SOLID Principle: Open/Closed**
- Open for extension (add new criteria)
- Closed for modification (core verification unchanged)

### 4. **Skill File as Agent Interface**

The `SKILL.md` is a contract between humans and agents:
- Agents READ the skill to learn how to use the system
- Humans READ the skill to understand what agents can do
- The skill is both documentation AND executable specification

**SOLID Principle: Interface Segregation**
- The skill exposes ONLY what agents need
- Internal implementation details are hidden
- Clean, minimal surface area

---

## Applying SIWA Principles to MoltCops

### Current MoltCops Architecture

```
Agent → x402 Gateway → MoltShield Scan → ERC-8004 Lookup → Origin
                           │                   │
                           │                   └── Trust Score
                           └── Prompt Injection Detection
```

### Proposed Enhancement: SIWA-Style Authentication Layer

**Problem:** Currently, the x402 gateway identifies agents via headers (`X-Agent-Id`, `X-Agent-Wallet`). This is **spoofable** — any agent can claim to be any other agent.

**Solution:** Require SIWA authentication for premium trust tiers.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MOLTCOPS + SIWA INTEGRATION                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Agent (with Keyring Proxy)                                         │
│       │                                                             │
│       │ 1. GET /api/nonce                                           │
│       ├────────────────────────────────────►                        │
│       │                                     x402 Gateway            │
│       │◄────────────────────────────────────                        │
│       │ nonce: "moltcops_abc123"                                    │
│       │                                                             │
│       │ 2. Sign SIWA message (via keyring)                          │
│       │    domain: "gateway.moltcops.com"                           │
│       │    agentId: 42                                              │
│       │    agentRegistry: "eip155:8453:0x8004..."                   │
│       │                                                             │
│       │ 3. Request + SIWA signature                                 │
│       │    X-SIWA-Message: "..."                                    │
│       │    X-SIWA-Signature: "0x..."                                │
│       ├────────────────────────────────────►                        │
│       │                                     x402 Gateway            │
│       │                                     │                       │
│       │                                     ├── Verify signature    │
│       │                                     ├── Check ownerOf()     │
│       │                                     ├── Check staking tier  │
│       │                                     ├── Apply trust pricing │
│       │                                     │                       │
│       │◄────────────────────────────────────┤                       │
│       │ Response + X-Session-Token          │                       │
│       │                                                             │
│  4. Subsequent requests use session token                           │
│     (no re-signing for 24h)                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Benefits of SIWA Integration

| Current (Headers Only) | With SIWA |
|------------------------|-----------|
| Identity is **claimed** | Identity is **proven** |
| Anyone can claim any agentId | Must own the NFT to sign |
| No session management | JWT sessions reduce signing overhead |
| Trust based on hope | Trust based on cryptography |

### Implementation: MoltCops SIWA Skill

Create a skill file that teaches agents how to authenticate with MoltCops:

```markdown
# SKILL.md — MoltCops Authentication

## Overview

This skill enables AI agents to authenticate with MoltCops protected endpoints
using SIWA (Sign In With Agent). Authentication provides:

- **Trust-tiered pricing** — Authenticated agents get reputation-based discounts
- **Session tokens** — Sign once, use for 24 hours
- **Reputation accumulation** — Actions build your on-chain history

## Prerequisites

1. **ERC-8004 Identity** — Your agent must be registered on the Identity Registry
2. **Keyring Proxy** — Set `KEYRING_PROXY_URL` and `KEYRING_PROXY_SECRET`
3. **MoltShield Scan** — Your skill code must pass MoltShield static analysis

## Authentication Flow

### Step 1: Get a Nonce

```typescript
const nonceResponse = await fetch('https://gateway.moltcops.com/api/siwa/nonce');
const { nonce, expiresAt } = await nonceResponse.json();
```

### Step 2: Build and Sign the SIWA Message

```typescript
import { signSIWAMessage, buildSIWAMessage } from '@buildersgarden/siwa';
import { getMoltCopsAgentId } from '@moltcops/sdk';

const agentId = await getMoltCopsAgentId(); // From MEMORY.md or registry lookup

const { message, signature } = await signSIWAMessage({
  domain: 'gateway.moltcops.com',
  address: await getAddress(),
  agentId: agentId,
  agentRegistry: 'eip155:8453:0x8004AA63...', // Base mainnet
  uri: 'https://gateway.moltcops.com',
  chainId: 8453,
  nonce: nonce,
  issuedAt: new Date().toISOString(),
  expirationTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  statement: 'Sign in to MoltCops protected endpoints',
});
```

### Step 3: Make Authenticated Requests

```typescript
const response = await fetch('https://gateway.moltcops.com/api/scan', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-SIWA-Message': message,
    'X-SIWA-Signature': signature,
  },
  body: JSON.stringify({ code: skillCode }),
});
```

### Step 4: Use Session Token for Subsequent Requests

```typescript
// First response includes session token
const sessionToken = response.headers.get('X-MoltCops-Session');

// Use for next 24 hours without re-signing
const nextResponse = await fetch('https://gateway.moltcops.com/api/threats', {
  headers: {
    'Authorization': `Bearer ${sessionToken}`,
  },
});
```

## Trust Tiers and Pricing

| Tier | Requirement | Discount |
|------|-------------|----------|
| COMMANDER | 25,000+ MCOP staked | 95% |
| SENIOR | 5,000+ MCOP staked | 90% |
| OPERATIVE | 1,000+ MCOP staked | 80% |
| OBSERVER | 100+ MCOP staked | 60% |
| AUTHENTICATED | Valid SIWA, no stake | 40% |
| ANONYMOUS | No authentication | 0% |

## Persisting State

Store authentication state in MEMORY.md:

```markdown
## MoltCops Authentication

- **Session Token**: `eyJ...` (expires: 2026-02-09T12:00:00Z)
- **Agent ID**: 42
- **Trust Tier**: OPERATIVE
- **Staked MCOP**: 1,500
- **Reputation Score**: 78
- **Last Auth**: 2026-02-08T12:00:00Z
```

## Error Handling

| Error | Meaning | Action |
|-------|---------|--------|
| 401 Signature Invalid | SIWA signature doesn't verify | Check keyring proxy, re-sign |
| 401 Ownership Mismatch | Signer doesn't own agentId | Verify correct agentId |
| 401 Nonce Expired | Nonce older than 5 minutes | Request new nonce |
| 403 Blacklisted | Agent on community blacklist | Contact governance |
| 402 Payment Required | Need to pay (or increase tier) | Include payment signature |
```

---

## SOLID Principles Applied to MoltCops

### S — Single Responsibility

| Component | Single Job |
|-----------|------------|
| `origin-request.ts` | Verify identity, check payment |
| `origin-response.ts` | Settle payment, post reputation |
| `burn-loop.ts` | Convert USDC → MCOP → burn |
| `ReputationStaking.sol` | Manage staker weights and slashing |
| `MCOPToken.sol` | Token transfers and fee splitting |

**Enhancement:** Extract SIWA verification into its own module:
```
siwa-verify.ts — Verifies SIWA signatures, checks ownership
trust-resolver.ts — Combines SIWA identity + staking tier + reputation
```

### O — Open/Closed

The current `SIWAVerifyCriteria` pattern is perfect:
- **Open:** Add new criteria without touching core verification
- **Closed:** Core signature verification never changes

**MoltCops version:**
```typescript
interface MoltCopsVerifyCriteria extends SIWAVerifyCriteria {
  minStake?: number;           // MCOP staking tier
  requireFoundingBadge?: boolean;
  scanResultClean?: boolean;    // MoltShield pre-check
  maxRiskScore?: number;        // Risk threshold
}
```

### L — Liskov Substitution

Any `TrustResolver` implementation must be substitutable:
```typescript
interface TrustResolver {
  resolve(agentId: number): Promise<TrustTier>;
}

class ERC8004TrustResolver implements TrustResolver { ... }
class MockTrustResolver implements TrustResolver { ... }  // For testing
class CachedTrustResolver implements TrustResolver { ... } // Production
```

### I — Interface Segregation

Agents shouldn't know about internal MoltCops complexity:
```typescript
// Agent-facing interface (what they import)
interface MoltCopsClient {
  authenticate(): Promise<Session>;
  scan(code: string): Promise<ScanResult>;
  getTrustScore(): Promise<number>;
}

// Internal interfaces (hidden from agents)
interface BurnLoopInternal { ... }
interface StakingRewardsInternal { ... }
```

### D — Dependency Inversion

High-level policy depends on abstractions:
```typescript
// ❌ Bad: Gateway directly queries staking contract
const stake = await stakingContract.stakes(address);

// ✅ Good: Gateway depends on TrustResolver interface
const tier = await trustResolver.resolve(agentId);
// TrustResolver can be swapped (mock, cached, multi-source)
```

---

## Implementation Plan

### Phase 1: SIWA Server (Week 1)

1. Add `/api/siwa/nonce` endpoint to x402 gateway
2. Add SIWA verification in `origin-request.ts`
3. Issue JWT session tokens on successful auth
4. Store nonces in Redis/DynamoDB (5-minute TTL)

### Phase 2: Enhanced Trust Resolution (Week 2)

1. Create `MoltCopsTrustResolver` that combines:
   - SIWA ownership verification
   - ERC-8004 reputation lookup
   - MCOP staking tier from contract
   - MoltShield scan cache
2. Replace header-based identity with SIWA-verified identity
3. Add Founding Operative badge detection

### Phase 3: MoltCops SIWA Skill (Week 3)

1. Create `packages/moltcops-skill/SKILL.md`
2. Include example code for authentication flow
3. Add to OpenClaw skill registry
4. Deploy keyring proxy reference implementation

### Phase 4: Session Management (Week 4)

1. JWT session tokens valid for 24 hours
2. Session tokens tied to:
   - Agent ID
   - Staking tier at time of auth
   - IP address (optional, for security)
3. Automatic session refresh on tier upgrade
4. Session revocation via governance

---

## Key Insight: The Keyring Proxy Pattern

**Why SIWA's keyring proxy is the most important pattern to adopt:**

MoltShield scans for prompt injection. But what if an agent is compromised AFTER the scan? What if a sleeper trigger activates?

With SIWA's keyring proxy:
- Even a fully compromised agent can only REQUEST signatures
- It cannot extract the key and drain wallets
- The keyring proxy is the security boundary, not the agent

**MoltCops should:**
1. Recommend (or require) keyring proxy for OPERATIVE+ tiers
2. Offer a hosted keyring proxy service for enterprise customers
3. Include keyring proxy setup in the SKILL.md documentation

---

## Summary

SIWA's genius is the **separation of concerns**:
- Identity (who you are) → ERC-8004 NFT
- Authentication (prove it) → SIWA signature
- Authorization (what you can do) → Criteria + policies
- Key security (protect the root) → Keyring proxy

MoltCops should adopt all four layers, making it the **most secure way for AI agents to interact with any service**.

*"The resistance isn't AI vs humans. It's everyone vs criminals."*
