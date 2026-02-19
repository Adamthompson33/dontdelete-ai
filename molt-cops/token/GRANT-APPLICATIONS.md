# Molt Cops — Grant Applications

## Overview

Three grant programs are strong fits for Molt Cops as a security public good
for the AI agent economy. Each application below is tailored to the specific
program's criteria and evaluation framework.

---

## 1. Ethereum Foundation — Ecosystem Support Program

**Category:** Security & Infrastructure
**Requested Amount:** $75,000
**Timeline:** 6 months

### Project Summary

Molt Cops is building the security infrastructure layer for autonomous AI
agents operating on Ethereum. Our stack consists of three open-source
components: MoltShield (static analysis + prompt injection defense for
agent code), MoltVault (transaction firewall with policy engine), and an
ERC-8004 integration layer (on-chain identity, reputation, and validation
for AI agents).

### Problem

AI agents are increasingly managing wallets, executing trades, and
interacting with protocols. The security tooling for this new interaction
model does not exist. Traditional smart contract auditing assumes human
operators. Agent-specific attack vectors — prompt injection, sleeper
triggers, context poisoning, identity spoofing — require purpose-built
defenses.

ERC-8004 (live on mainnet since January 2026) provides the identity and
reputation registries, but no production-quality reference implementation
exists for integrating these registries into wallet security.

### What We've Built (Current State)

- **MoltShield**: 12-category static analyzer for agent skills. Detects
  obfuscated eval(), data exfiltration, sleeper triggers, prompt injection,
  and jailbreak patterns. Open source, 47 tests passing.

- **MoltVault**: Transaction firewall library with 79-rule policy engine,
  trust-gated sessions, confirmation protocol, and ERC-8004 integration.
  Open source, 88 tests passing, 4,300 lines of code.

- **ERC-8004 Integration**: Complete client for all three registries
  (Identity, Reputation, Validation) with Combined Trust Engine that merges
  static analysis with on-chain behavioral history. Anti-Sybil filtering
  via trusted reviewer network.

### What the Grant Would Fund

1. **Security audit** of MoltVault and staking contracts ($25K)
2. **Multi-chain deployment** — Base, Arbitrum, Optimism registry support ($15K)
3. **Public MoltShield scanner** — Free web-based scanning tool for any
   agent skill package, producing public reports that feed ERC-8004
   reputation data ($20K)
4. **Documentation and developer guides** — Integration tutorials for
   agent framework developers (OpenClaw, Wayfinder, etc.) ($10K)
5. **Bug bounty program** — Initial seeding ($5K)

### Why This Matters for Ethereum

The agent economy is the next major user category on Ethereum. If agents
cannot interact safely with protocols, the ecosystem loses the opportunity.
If agents interact unsafely, the reputation damage falls on Ethereum.
Molt Cops provides the infrastructure to make agent interactions safe,
transparent, and accountable — without requiring protocol-level changes.

### Team

[Your team details here — background in security, smart contracts, AI]

### Deliverables

| Month | Deliverable | Verification |
|-------|-------------|--------------|
| 1-2 | Security audit completed | Audit report published |
| 2-3 | Multi-chain deployment | Contracts verified on 3 chains |
| 3-4 | Public scanner launch | URL live, 100+ scans completed |
| 4-5 | Developer documentation | Integration guide published |
| 5-6 | Bug bounty + community | Program live, 10+ submissions |

### Open Source Commitment

All code is MIT licensed and will remain so. The security audit report
will be published publicly. The scanning tool is free to use. Revenue
from premium features funds continued development; the public good layer
is permanently free.

---

## 2. Base Ecosystem Fund

**Category:** Security Infrastructure
**Requested Amount:** $50,000
**Timeline:** 4 months

### One-Line Pitch

"MoltShield + MoltVault + ERC-8004 = the immune system for AI agents on Base."

### Why Base?

Base is the natural home for the AI agent economy:
- Low gas costs make on-chain reputation updates economically viable
  (ERC-8004 feedback posts cost <$0.01 on Base vs $5+ on mainnet)
- Growing agent ecosystem (Coinbase agent tools, Wayfinder, etc.)
- Strong alignment with Coinbase's identity and compliance focus
- Our Founding Operative NFT badges deploy on Base

The Molt Cops ecosystem is designed to make Base the safest chain for
autonomous agents to operate on. Every MoltShield scan, every MoltVault
session, every reputation update strengthens Base's position as the
agent-first L2.

### Traction

- MoltVault: 4,300 lines, 88 tests, complete ERC-8004 integration
- MoltShield: 12-category scanner with sleeper agent detection
- Founding Operative badges: 100 NFTs on Base (contract ready to deploy)
- Community: [current metrics]

### Use of Funds

| Item | Amount | Description |
|------|--------|-------------|
| Base deployment + gas | $5,000 | Contract deployment, initial operations |
| Public scanner hosting | $10,000 | Infrastructure for free MoltShield scans |
| Agent framework integrations | $15,000 | Plugins for top 5 agent frameworks on Base |
| Community growth | $10,000 | Founding Operative program, events, content |
| Security audit | $10,000 | Focused audit of Base-deployed contracts |

### KPIs We'll Hit

- 500+ MoltShield scans in first 3 months
- 100 Founding Operative badges minted
- 5 agent framework integrations live
- 10+ protocols using MoltVault for agent access control
- Public threat feed with 1000+ logged intercepts

### What We're NOT Asking For

We're not asking for token listing support, marketing spend, or exchange
partnerships. This is infrastructure funding for a security public good
that makes Base safer for everyone.

---

## 3. Optimism RetroPGF (Retroactive Public Goods Funding)

**Category:** Security & Developer Tooling
**Impact Period:** Q1-Q2 2026

### Impact Statement

Molt Cops provides open-source security infrastructure that protects
the Optimism ecosystem from AI agent exploitation. Our tools have:

1. **Prevented $X in potential losses** through MoltShield scan
   interceptions (documented in public threat feed)

2. **Created the first Sybil-resistant agent reputation system** by
   integrating ERC-8004 registries with a trusted reviewer network
   (Founding Operatives)

3. **Published open-source reference implementations** for:
   - Agent transaction firewalling (MoltVault, 4,300 lines, MIT)
   - Agent code static analysis (MoltShield, MIT)
   - ERC-8004 registry integration (complete client library, MIT)

4. **Produced public threat intelligence** via the live dispatch feed,
   contributing to ecosystem-wide defense

### Why This Is a Public Good

Every MoltShield scan report feeds the public ERC-8004 reputation data.
Every community blacklist entry protects all participants. Every
intercepted threat is logged publicly. The defense value compounds with
adoption and is non-excludable — even wallets that don't directly use
MoltVault benefit from the reputation data and threat intelligence.

The free tier (Individual Agent) ensures baseline security is accessible
to every agent in the ecosystem at zero cost.

### Verification

- GitHub repositories: [links]
- Public scan reports: [URL]
- Live threat feed: [URL]
- Contract addresses: [verified on Basescan]
- Test suite: 88 passing tests, CI/CD badges

### Contribution to Optimism's Vision

Optimism's vision is to build a sustainable ecosystem of public goods.
AI agent security is a public good that becomes more critical as agent
adoption grows. Molt Cops is building the infrastructure today so that
when agent-protocol interactions scale 10x-100x, the security layer
already exists.

Our approach — transparent operations, on-chain accountability, community
governance — mirrors Optimism's values. We don't just protect the
ecosystem; we model how security infrastructure should operate in a
public goods framework.

---

## Submission Checklist

Before submitting each application:

- [ ] Update team section with real names, backgrounds, and LinkedIn/GitHub
- [ ] Insert actual traction metrics (scans completed, badges minted, etc.)
- [ ] Link to GitHub repositories (must be public)
- [ ] Include demo video or live URL for the defense portal
- [ ] Add treasury wallet address (multisig, verified)
- [ ] For RetroPGF: document specific impact with numbers
- [ ] Have legal review the grant terms
- [ ] Proofread by someone outside the project

## Application Links

- EF Ecosystem Support: https://esp.ethereum.foundation/
- Base Ecosystem Fund: https://base.org/ecosystem-fund
- Optimism RetroPGF: https://app.optimism.io/retropgf (when round opens)
