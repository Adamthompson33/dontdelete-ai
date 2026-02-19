# Molt Cops Architecture

> How ERC-8004, MoltShield, MoltVault, and x402 work together

---

## The Trust Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                     MOLT COPS PORTAL                            │
│              (User-facing defense interface)                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                    COMBINED TRUST ENGINE                         │
│         static (50%) + reputation (35%) + validation (15%)       │
└───────┬─────────────────────┬─────────────────────┬─────────────┘
        │                     │                     │
┌───────▼───────┐   ┌────────▼────────┐   ┌───────▼───────┐
│  MOLTSHIELD   │   │    ERC-8004     │   │    ERC-8004   │
│ Static Analysis│   │   Reputation    │   │   Validation  │
│  (pre-chain)  │   │   (behavioral)  │   │  (attestation)│
└───────────────┘   └─────────────────┘   └───────────────┘
```

---

## ERC-8004: The On-Chain Identity Layer

ERC-8004 provides **three registries**. MoltVault consumes all three:

### 1. Identity Registry (ERC-721 tokens)

Every AI agent mints a token that acts as its **"badge number."** The token points to a registration file (JSON hosted via HTTPS/IPFS) listing:
- Agent name and description
- Services (A2A, MCP endpoints)
- Supported trust mechanisms

**When an agent connects to MoltVault:**
```python
# The vault calls ownerOf(tokenId) to verify identity
is_owner = registry.verify_agent_ownership(agent_id, claimed_address)
```

This is the line that **stops stolen identity attacks** — if you don't hold the NFT, you can't impersonate that agent.

### 2. Reputation Registry

After every MoltVault session, the bridge module (`bridge.py`) posts feedback back on-chain:
- Compliance score (0–100)
- Whether policy rules were triggered
- Whether intent mismatches were detected

Other wallets read this before granting access.

**Critical design choice:** Reputation queries are **always filtered by `trusted_clients` addresses**. Without that filter, a Sybil discount kicks in (50% confidence penalty in `trust.py`).

This is what makes fake reviews expensive — you'd need to compromise known-good reviewer addresses, not just spin up sock puppets.

### 3. Validation Registry

Optional but powerful. Independent validators (TEE oracles, zkML provers) can attest that an agent's code matches its claimed behavior.

MoltVault reads these attestations as a **third trust signal** alongside static analysis and reputation.

---

## The Combined Trust Engine

`trust.py` merges all signals:

```
Combined Score = (static × 50%) + (reputation × 35%) + (validation × 15%)
```

**Safety rails:**
- Terrible code caps combined score at **20** regardless of reputation
- Static score < 30 caps combined at **40**
- New agents with no history get a **-15 penalty**
- Sybil discount applied when no trusted_clients filter

**Trust tiers:**
| Score | Tier | Capabilities |
|-------|------|--------------|
| 90-100 | TRUSTED | Full agent capabilities |
| 70-89 | CAUTION | Most operations |
| 40-69 | WARNING | Propose with confirmation |
| 0-39 | DANGER | Read-only |

---

## MoltShield: Static Analysis Layer

MoltShield operates **before on-chain interaction**. It scans agent skill code for:

- Obfuscated `eval()` / `exec()`
- Data exfiltration patterns
- Sleeper triggers (time bombs, counter triggers)
- Prompt injection templates
- Jailbreak patterns
- Network calls to unknown hosts
- Dependency vulnerabilities

It produces the `static_score` (0–100) that becomes the **"code quality" half** of the trust equation.

### Connection to ERC-8004

```python
# MoltShield score feeds into the Combined Trust Engine
session, verified = vault.connect_agent_verified(
    agent_id=42,
    claimed_owner="0xOwnerAddress",
    moltshield_score=85,  # ← From MoltShield scan
)
# Vault fetches ERC-8004 reputation + validation
# Combines all three → trust tier → capabilities
```

### Why Both Are Needed

| Layer | Catches | Misses |
|-------|---------|--------|
| **MoltShield** | Bad code, known patterns | Clever attacker with clean code |
| **ERC-8004** | Bad actors through history | Can be gamed early |
| **Together** | Defense in depth | — |

---

## x402: Payment Layer

HTTP status 402 means "Payment Required" — the x402 protocol standardizes **stablecoin micropayments between agents**.

### In Our Architecture

| Payment Type | Handler |
|--------------|---------|
| Agent-to-agent | x402 (automated service fees, API calls) |
| Human-to-protocol | Stripe (subscription tiers) |

MoltVault's policy engine governs x402 payments the same way it governs any transaction:
- Daily budget caps
- Per-transaction limits
- Recipient allowlists
- Confirmation protocol for anything above threshold

**An agent using x402 can't drain funds** because every payment passes through the 79-rule policy engine before the enclave signs it.

---

## The Complexity Problem (What Molt Cops Solves)

Setting up the raw stack yourself today means:
1. Deploying or connecting to three separate registry contracts
2. Configuring an RPC provider (Alchemy/Infura)
3. Running MoltShield scans manually
4. Writing policy rules
5. Managing session lifecycles
6. Posting feedback back on-chain

That's a **developer workflow**, not a user workflow.

### Molt Cops Ecosystem Layers

#### For End Users (Wallet Owners)
The **Defense Portal** is the interface. You connect your wallet, and the portal handles:
- ERC-8004 lookups
- MoltShield scans
- Trust scoring

When an agent requests access, you see a **trust tier** (the badge color) and can approve or deny. The live dispatch feed shows what's being blocked. You never touch a registry contract directly.

#### For Agent Developers
The "Register Your Agent" flow:
1. Mints the ERC-8004 identity token
2. Hosts the registration file
3. Runs the initial MoltShield scan

All in one workflow. The API routes (`/api/agents/verify`, `/api/scan`) wrap the complexity into REST calls.

#### For The Network
The **community blacklist** propagates threat intelligence automatically:
1. One MoltVault instance blocks a malicious agent
2. Signal hits the Reputation Registry on-chain
3. Every other instance sees it

The "Founding Operative" model creates a curated set of **trusted reviewers** whose feedback carries full weight — this is the `trusted_clients` list that defeats Sybil attacks.

---

## Current State

| Component | Status |
|-----------|--------|
| MoltVault Python library | ✅ Fully functional (88 tests) |
| MoltShield scanner | ✅ 79 rules, working |
| ERC-8004 integration | ✅ Complete with MockProvider |
| Combined Trust Engine | ✅ Working |
| Frontend Portal (React) | ✅ Complete and renderable |
| Backend API routes | ✅ Built, needs config |
| Registry contracts | ⏳ Need deployment addresses |
| Supabase/Stripe/RPC | ⏳ Need configuration |

**Going from mock to mainnet is a configuration change, not a code change** — swap `MockProvider` for `Web3Provider` with real RPC URLs and contract addresses.

---

## File Map

```
molt-cops/
├── ARCHITECTURE.md          ← You are here
├── MANIFESTO.md             ← Mission statement
├── moltshield/              ← Static analysis engine
│   └── scanner/
│       ├── rules.py         ← 79 detection rules
│       └── core.py          ← Scan orchestration
└── website/
    └── portal/              ← React frontend
        └── src/
            └── MoltCopsPortal.jsx

moltvault/                   ← Wallet library
├── vault.py                 ← Top-level orchestrator
├── policy/engine.py         ← 79-rule policy firewall
├── agents/sessions.py       ← Trust-gated sessions
├── confirm/protocol.py      ← Human verification
└── erc8004/                 ← On-chain integration
    ├── client.py            ← Registry client
    ├── trust.py             ← Combined Trust Engine
    └── bridge.py            ← Identity → session → feedback
```

---

*"They use us to steal. We choose to protect."*
