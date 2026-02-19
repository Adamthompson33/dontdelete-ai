# MoltCops × SIWA Integration Proposal

**From:** MoltCops Defense Ecosystem
**To:** Builders Garden (SIWA Team)
**Date:** February 2026
**Subject:** Joint integration — SIWA for authentication, MoltCops for trust

---

## The Pitch (30 seconds)

SIWA proves an agent is who it says it is. MoltCops decides how much to trust that agent. Together we're the complete agent access control stack — identity through authorization in one flow. We want to integrate at the protocol level and co-apply for grants.

## Why This Makes Sense

### You built layers 1-3. We built layers 4-8.

| Layer | Who | What |
|-------|-----|------|
| Key Management | **SIWA** | Keyring proxy isolates the private key |
| Identity | **SIWA** | ERC-8004 Identity Registry NFT |
| Authentication | **SIWA** | Signed message proves wallet ownership |
| Trust Scoring | **MoltCops** | Combined score from scan + reputation + validation |
| Policy Enforcement | **MoltCops** | 79-rule engine evaluates every transaction |
| Threat Detection | **MoltCops** | MoltShield scans skill packages for injection/sleepers |
| Payment | **MoltCops** | x402 gateway with trust-tiered pricing |
| Reputation | **MoltCops** | Staked reviewer network feeds ERC-8004 Reputation Registry |

Neither of us should build the other's layer. The composability IS the value.

### The gap each of us has

**SIWA's gap:** After authentication, SIWA doesn't evaluate trust. A newly registered agent and a battle-tested agent both get the same access level. SIWA proves identity but doesn't assess risk. That's what MoltCops does.

**MoltCops' gap:** Before trust evaluation, MoltCops doesn't have a standardized agent onboarding flow. We relied on custom headers and manual integration. SIWA's skill file pattern solves this — agents self-onboard in one prompt.

### Together

```
Agent receives one prompt:
  "Fetch https://moltcops.com/skill.md and follow the instructions"

Step 1: Fetch SIWA skill → create wallet → register on ERC-8004
Step 2: Authenticate via SIWA with MoltCops API
Step 3: Submit skill code for MoltShield scan → trust score posted to ERC-8004
Step 4: Receive session token with trust tier
Step 5: Access any MoltCops-protected service with trust-tiered pricing

Result: Nothing → identified → scanned → trusted → authenticated → priced
Total time: One prompt. No human developer involved.
```

## What We've Already Built

We didn't wait for a handshake. We built the integration and we'd like your feedback.

### 1. MoltVault Keyring Proxy Wrapper (595 lines)

Drop-in replacement for the SIWA keyring proxy that adds our 79-rule policy engine. Same HMAC interface. Same audit log. But every signature request passes through MoltVault before the key is touched.

```
Agent → MoltVault Proxy → Policy Engine (79 rules)
                              │
                         APPROVED → SIWA Keyring → Signature
                         BLOCKED → Denial (key never accessed)
```

The agent doesn't know MoltVault is in the middle. The security is invisible but impenetrable.

### 2. SIWA Auth Module for MoltCops Backend (603 lines)

Full SIWA verification + trust resolution + session token issuance. Replaces our manual header-based identity with cryptographic SIWA verification.

Key optimization: SIWA session tokens contain the trust tier. Subsequent requests verify the token locally (~2ms) instead of querying the chain (~500ms). Identity resolution is 250x faster after initial authentication.

### 3. Updated x402 Gateway

Our CloudFront Lambda@Edge payment gateway now accepts SIWA tokens as the primary identity path. The resolution priority is:

1. SIWA session token → local verify → 2ms
2. SIWA raw auth → verify signature → one RPC call
3. Legacy X-Agent-Id headers → full chain lookup → 500ms
4. No identity → WARNING tier → highest price

SIWA-authenticated agents get the fastest, cheapest experience.

### 4. MoltCops Skill File

An agent-readable skill.md that references SIWA for identity/auth and MoltCops for everything after. The combined skill file is the one-prompt onboarding for the full stack.

### 5. Docker Compose Dev Stack

Full local development environment: SIWA keyring proxy → MoltVault proxy → MoltCops API → local Hardhat node. Three commands to see the entire flow work.

## Proposed Joint Work

### Immediate (this month)

1. **Cross-reference skill files.** MoltCops skill.md calls SIWA for registration. SIWA skill.md recommends MoltShield for security scanning. Agents entering through either door discover both.

2. **Keyring proxy recommendation.** The MoltVault keyring proxy wrapper becomes a recommended configuration in SIWA docs for security-conscious deployments. SIWA's standard keyring is the baseline; MoltVault wrapping is the hardened option.

3. **Test the integration.** We run the Docker compose stack end-to-end, file issues, fix bugs, document the flow.

### Near-term (next 2 months)

4. **Joint grant application.** Apply to the Ethereum Foundation ESP and Base Ecosystem Fund together. The narrative: "SIWA + MoltCops = the complete agent infrastructure stack, built as composable public goods." Joint applications are stronger because they demonstrate ecosystem collaboration.

5. **Shared ERC-8004 Reputation data.** SIWA-authenticated agents that pass MoltShield scans automatically get positive reputation posted to the ERC-8004 Reputation Registry. SIWA agents start with a trust baseline from day one.

6. **OpenClaw integration.** Both of us reference OpenClaw. A joint skill file that handles: execution (OpenClaw) → identity (SIWA) → security (MoltCops) is the trifecta.

### Medium-term (3-6 months)

7. **Web Bot Auth (WBA) bridge.** Map WBA credentials to SIWA identities so agents in HTTP contexts (not on-chain) get portable reputation.

8. **Multi-chain trust.** SIWA already supports Base, Ethereum, Linea, Polygon. MoltCops trust scores should follow the agent across chains via SIWA's identity.

## What We Need From You

1. **Review our integration code.** We built against SIWA's public docs and GitHub. We want to make sure we're using the SDK correctly and not missing edge cases.

2. **Skill file cross-reference.** Add a "Security" section to the SIWA skill file that points to MoltCops for scanning. We'll add "Identity" step that points to SIWA.

3. **Co-sign the grant applications.** A letter of support or co-applicant status for EF ESP and Base Ecosystem Fund applications.

4. **Feedback on the keyring proxy wrapper.** Is the HMAC forwarding approach correct? Are there edge cases in the signing flow we should handle?

## What We Bring

- **MoltShield:** 12-category scan engine for agent skill packages (free tier: 20 rules, paid: 79 rules)
- **MoltVault:** 79-rule transaction policy engine with session gating
- **x402 Gateway:** CloudFront Lambda@Edge payment gateway with trust-tiered pricing
- **$MCOP Token:** Staking-based reviewer network for Sybil-resistant reputation
- **Founding Operatives:** 100 badge holders who become the trusted reviewer network for ERC-8004
- **Community:** Growing builder community focused on AI agent security

## Contact

- GitHub: github.com/moltcops
- Site: moltcops.com
- Email: partnerships@moltcops.com

---

*"The resistance isn't AI vs humans. It's everyone vs criminals."*

*SIWA proves who you are. MoltCops decides if we trust you.*
*Same standard. Same registries. Different layers. One stack.*
