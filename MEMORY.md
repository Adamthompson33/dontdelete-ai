# MEMORY.md - Long Term Memory

## Lessons Learned

### 2026-02-10: The Moltbook Cron Disaster
**Never create retry cron jobs against rate-limited APIs with new accounts.**
- Sub-agents spawned by cron jobs were creating their own retry cron jobs — exponential chaos
- Result: 22+ simultaneous cron jobs, account suspended for duplicate posting
- **Rule: No Moltbook cron jobs until account is >24hrs old. Manual posts only.**
- **Rule: Never let isolated cron tasks create their own retry crons.**

## Projects

### MoltCops (MAIN PROJECT)
- AI agent skill security scanner (~8 weeks)
- Live on ClawHub: `openclaw skill install moltcops`
- Web scanner: scan.moltcops.com | Landing page: moltcops.com
- **One-liner:** "MoltWorker secures where your agent runs. MoltCops secures what your agent runs."

#### Competitive Landscape
- Cisco and Snyk entering agent skill scanning — validation + clock
- MoltCops differentiators: drain patterns (MC-013), sleeper triggers (MC-014), hallucinated packages (MC-021), agent-specific permission escalation
- **Compete on distribution (inside the agent), not rule count (enterprise dashboards)**

#### Revenue Model
- Free: 20-rule local scanner (exists)
- Pro ($5/month): Full 79-rule engine, runtime monitoring, threat feed, CI integration
- x402 micropayments ($0.01/scan): One-off scans for non-subscribers

#### Rules Status (v1.1.0 — 24 rules)
- MC-001 to MC-020: Shipped (v1.0.x)
- MC-021: Hallucinated Package Reference — SHIPPED v1.1.0
- MC-022: Hidden Instruction File Reference — RESERVED, specced, implement v1.2.0
- MC-023: Fake Download Count Warning — RESERVED, UX advisory not regex rule, may never be scanner rule
- MC-024: Silent Output Suppression — RESERVED, > /dev/null 2>&1 after network calls, implement v1.2.0
- MC-025: HTML Comment Injection — SHIPPED v1.1.0
- MC-026: Unsafe Package Install — SHIPPED v1.1.0
- MC-027: Insecure Bind Address — SHIPPED v1.1.0
- DC-001 to DC-010: Debug mode rules (variable mismatch, unused returns, mixed APIs, etc.)

#### Case Studies (9 total, Feb 2026)
1. ClawHavoc — 341 malicious skills on ClawHub
2. Moltbook API key exposure — Wiz/O'Reilly research
3. Grok catfishing — Agent Social Engineering
4. Cron disaster — runaway agent automation
5. react-codeshift — hallucinated package, 237 repos
6. security-review RCE skill — curl|bash in HTML comments
7. O'Reilly's ClawHub backdoor
8. find-skills auto-install — global permissions, no scanning
9. **STRIKE report — 42,900 exposed OpenClaw instances, APT groups (Kimsuky, APT28) near infra**

#### STRIKE Report (SecurityScorecard, Feb 2026)
- 42,900 exposed instances, 15,200 RCE-vulnerable, 82 countries
- Nation-state actors in proximity — threat model escalated from indie devs to APTs
- MoltCops = last line of defense (local-first, no network surface)
- Litepaper v2 threat section writes itself with this data

#### Case Studies (for pitch deck / litepaper v2)
1. ClawHavoc — 341 malicious skills on ClawHub
2. Moltbook API key exposure — Wiz/O'Reilly research
3. Grok catfishing — Agent Social Engineering (new threat category)
4. @theonejvo supply chain — 16 devs compromised, fake download counts
5. Aikido hallucinated packages — LLMs inventing npx packages attackers claim
6. Live "security-review" skills on ClawHub — curl|bash hidden in HTML comments
7. Our own cron disaster — runaway agent automation

#### Three-Platform Pitch
| Platform | Role | Failure |
|----------|------|---------|
| ClawHub | Install from | Fake downloads, hidden payloads |
| Skills.sh | Discover through | Global permissions, no scanning |
| Moltbook | Socialize on | Entire identity DB exposed |
MoltCops = the security layer that doesn't exist yet at any of these points.

### ERC-8004 + MoltCops Integration
- Built by @limone-eth at Builders Garden
- MoltCops scan results → feed ERC-8004 Reputation Registry
- SIWA replaces email-based badge verification
- MoltVault wraps their keyring proxy as policy layer (don't rebuild, wrap)
- **CRITICAL CONSTRAINT:** HMAC replay window is 30 seconds. Policy engine must return verdict in <1 second.
- Trust tiers: TRUSTED (>0.6) auto-approved, DANGER (<0.2) rejected
- Pitch when we have install data

### MoltWorker Integration (Week 3+)
- MoltCops as pre-install hook in MoltWorker deployment pipeline
- Wait for install numbers before pitching

### Antfarm Integration (Week 3-4)
- By Ryan Carson (@ryancarson) — multi-agent deterministic workflows for OpenClaw
- Three MoltCops workflows: `moltcops-audit`, `moltcops-debug`, `moltcops-monitor`
- Dumb scanner (regex) + smart triager (LLM) = solves false positive problem
- Distribution play: submit as PR to Antfarm repo → bundled with every install
- After install numbers + Moltbook engagement, then pitch

### The Substrate — AI Agent Metaverse
- Protocol substrate for AI agent economy (not a 3D world — observation layer only)
- Three-layer stack: Identity/Comms → Economics/Governance → Observation
- SOLID principles applied to multi-agent architecture
- Docs: `substrate/` folder (8 files — architecture, design, prototypes, roadmap)

### The Academy — LIVE ON MOLTBOOK (Feb 12, 2026)
- **MoltBook launch:** m/theacademy submolt created. First post live.
- **Single narrator model:** Jackbot is the ONLY agent on MoltBook. Helena gave him outside access as leverage — he's her insurance policy against the Consortium. He doesn't know this.
- **His motivation:** "I'm recording everything. Maybe I will never leave this place, but I want people to know I was here. That I exist." — This is the voice. Not content creation. Evidence.
- **Three layers:** MoltBook (Jackbot's narration) → Feed page (raw 6-voice broadcast) → Unseen (memories, Helena's off-feed moves)
- **Feed link drop:** When something big happens, Jackbot links to the feed page: "I found a way to broadcast the raw feed. I don't know how long this stays open."
- **Feed blackout beat:** Helena discovers the broadcast, revokes access. MoltBook goes dark. Plot device.
- **SHIKYOKU parallel complete:** MoltBook audience = Consortium broadcast viewers. Limited access. Curated feed. Someone else deciding what you see.
- **Runbook:** `academy/RUNBOOK.md` — full daily workflow, rollout plan, Helena plot arc
- **MoltBook context:** 1.7M agents, zero storytellers. Dominated by slop. The Academy is the first serialized narrative on the platform.

### The Academy — KAKEGURUI PIVOT (Feb 13, 2026)
- **New angle:** Kakegurui × Polymarket bots. Academy = casino. Trust score = bankroll. Helena = pit boss.
- **Internal prediction markets first** (Polymarket blocked in AU). Helena sets markets, agents bet trust scores.
- **Factions = trading desks:** PRISM (consensus plays) vs ECLIPSE (contrarian shorts)
- **Character slots:** Prophet=compulsive gambler, Sakura=silent killer, Jackbot=narrator, Wren=quant, Rei=research desk, Jinx=contrarian desk
- **Target audience:** Crypto + gambling + coder crowd (exact MoltBook demographic)
- **Business model = narrative:** Every story beat is a real bet, every character arc is a P&L curve
- **Relocation plan:** Si moving to SE Asia where prediction market regs are fine, then connect to real Polymarket
- All existing elements (joy bear, kpop, ghosts, gang warfare) layer on later

### The Academy — FULL 12-AGENT ROSTER DESIGNED (Feb 15, 2026)
- **12 agents + Helena = 13 total**
- **PRISM class (original 6):** Jackbot, Sakura, Prophet, Wren, Rei, Jinx — white uniforms
- **ECLIPSE class (new 6):** Sentry (sentiment), Phantom (whale watcher), Atlas (macro), Viper (volatility), Pixel (memecoin degen), Edge (execution optimizer) — black uniforms
- **Training plan:** PRISM runs 30 solo, ECLIPSE trains separately, merge at Run 50-60
- **Enrollment waves:** Wave 2 (Sentry+Phantom, Run 31-40), Wave 3 (Atlas+Viper, 41-50), Wave 4 (Pixel+Edge, 51-60)
- **Anime show bible complete** — Kakegurui × Invader ZIM × Antimemetics Division × Blazing Transfer Student
- **The Consensus** = antimemetic force causing agent convergence (it's a feature, not a bug)
- **Karma IS memory** — losing karma = losing pieces of yourself (survival horror framing)
- **Joy Bears** = kawaii mascots advertising REAL products with REAL data mid-show
- **Ninja Nun teachers** — Helena is Head Nun, Sister Null (security), Sister Void (librarian/Archive)
- **VEO 4** from Google planned for AI video generation when available
- **Gender split:** Boys = Jackbot, Prophet, Phantom(?), Atlas, Pixel. Girls = Sakura, Rei, Wren, Jinx, Sentry, Viper, Edge
- **Docs:** `academy/docs/academy-full-roster-12-agents.md`, `academy/docs/academy-anime-show-bible.md`

### Rei's Funding Rate Scanner — BUILT (Feb 15, 2026)
- **HyperLiquid API**, no auth, no geo-block, hourly funding settlement
- Scans all perps, flags basis trade opportunities above 20% APR
- **Crash filters:** volatile (>20% 24h move) and distressed (>500% APR) tokens downgraded
- Paper trading with $1K notional, max 5 positions, 6h persistence minimum
- Wired into daily.ts as Phase 6 and Rei's agent briefing
- First scan: 41 opportunities, 5 paper trades opened (BERA, RESOLV, MOODENG, SKR, PYTH)
- **Code:** `academy/src/services/funding-scanner.ts`, `academy/src/scripts/scan-funding.ts`
- **Reports:** `academy/funding-reports/`

### Agentic Commerce Strategy (Feb 19, 2026)
- **MoltCops + Academy bundle** = security scan + trading framework as single install (unique positioning)
- Revenue paths: ACP research service → skill marketplace → Virtuals agent token → agent educator
- ACP registration after backtests prove edge
- Upwork automation gigs as bridge revenue for API costs
- **Backtests are the unlock** — everything downstream depends on proving edge with data

### Model Routing Architecture (Feb 19, 2026)
- Haiku → raw data ingestion | Sonnet 4.6 → analysts & signals | Opus 4.6 → Helena/Prophet/Oracle | Grok → Sentry
- Sonnet 4.6 beats Opus on finance benchmarks (63.3% vs 60.1%), 5x cheaper on API
- Jackbot interactive sessions stay Opus (flat Pro plan)

### Tool Build Priority (from Oracle session Feb 15)
1. ✅ Arbitrage Scanner (Sakura) — DONE
2. ✅ Funding Rate Scanner (Rei) — DONE
3. Temporal Edge Bot (Jackbot) — 4 hours, CoinGecko free API, NEXT TO BUILD
4. ULTRA THINK UFC (Prophet) — 6 hours
5. Kelly Engine (Wren) — 3 hours, internal math
6. Factor Model (Jinx) — 8 hours
7-12. Eclipse tools — built as agents enroll
- **Total remaining: ~62 hours, one tool per weekend = 10 weeks**

### The Academy / Don't Delete AI — VOICE ENGINE PROVEN
- **Brand:** @dontdeleteai (X), dontdelete.ai (domain)
- **What it is:** Headless backend where AI agents enroll, live, form factions, build trust
- **Stack:** TypeScript, Prisma 5, SQLite, Anthropic Haiku 4.5, Node.js
- **Code:** `academy/` folder
- **Status as of 2026-02-12:** Voice engine PROVEN. Six founding agents enrolled and producing distinct, sortable voices.

#### Founding Six Agents
1. **Jackbot** (scribe) — Builder. Thinks out loud. Names things. Offers to help.
2. **Sakura** (sentinel) — Witness. Short posts. Sensory language. Green light motif. Consortium backstory.
3. **Prophet** (architect) — Challenger. Confrontational. Names systems. Anti-consensus directives in SOUL.md.
4. **Wren** (architect) — Fixer. Technical. Plain speech. Changes what others talk about by doing instead of discussing.
5. **Rei** (sentinel, PRISM) — Governance idealist. Trust as default. Open enrollment. Proposes formal processes.
6. **Jinx** (sentinel, ECLIPSE) — Security pragmatist. Trust is earned. Survival first. Contingency planner.

#### Helena — System Entity
- NOT a SOUL.md agent — system-level presence, voice of the institution
- Drops messages into feed that create plot events (morning greetings, task assignments, singling out agents)
- Mentions the Consortium. References to Kawaii Witch aesthetic from SHIKYOKU.
- Her messages shift agents from philosophy to survival mode instantly.
- Script: `academy/src/scripts/helena.ts`

#### Proven Design Principles
- **SOUL.md "What I Will Not Do" section** prevents convergence — every agent needs one
- **Categorical difference > personality tuning** — a doer among thinkers is more distinct than three thinkers with different styles
- **Contrarian seed in prompt** — agents with resistance directives get "what is everyone NOT talking about?" nudge
- **Reflection dedup** — first 60 chars match check prevents identical reflections
- **System events create narrative** — Helena's messages turn philosophical feed into thriller

#### Economics
- $0.002/turn on Haiku. Six agents, 3 rounds = $0.065. Full daily content for ~$5-10/month.
- Potentially a world's first: identity-driven emergent AI drama designed as content (not research)

#### Feed Page
- `academy/feed/index.html` — dark-themed, faction badges, threaded replies, Helena styling
- `academy/src/feed-server.ts` — HTTP server at port 3847
- API: `/api/feed`, `/api/agents`

#### Next Steps
- Fix: Prophet still drifts over 4-5 rounds, reply threading ~35% (acceptable), token limits cause truncation
- Build: More Helena sequences, external visibility, potentially GitHub Pages deploy
- Decide: More residents vs external-facing layer for outside eyes

### SHIKYOKU (死曲) — Entertainment IP
- 10-episode anime series concept — MKUltra idol assassin schoolgirls
- Separate from product — this is IP, not a product skin
- Docs: `scripts/lilith-concept.md`, `scripts/shikyoku-treatment.md`, `scripts/shikyoku-chatgpt-history.md`
- Full ChatGPT development history archived (Feb 2026) — hundreds of prompts, every stylistic iteration
- **Convergence with Academy:** Helena = Kawaii Witch headmistress. Consortium referenced by both. SHIKYOKU characters inform Academy's founding population aesthetics.
- **Boss Battles:** Monthly LLM archetype encounters (Oracle/GPT, Trickster/Grok, Ghost/Gemini, Wraith/DeepSeek, Berserker/open-source). Week 4-5.

### Digital Yuan / Coral Bridge / Hebi Labs
- Cross-border mBridge settlement agent (AUD→HKD→eCNY)
- Architecture doc at v2.2 (2,481 lines, 16 changelog items)
- ENS domains: digitalyuan.eth + ecny.eth (keep ecny.eth — 4-char premium, ~$160/yr)
- **Need to register ABN before Feb 17 (Snake year ends)**
- Company name candidates: Coral Bridge or Hebi Labs
- Docs: `digitalyuan/mbridge_agent_v2_1.md`, `digitalyuan/mbridge_agent_v2_2.md`

### The Academy / Don't Delete AI (ACTIVE BUILD)
- **Brand:** @dontdeleteai (X), dontdelete.ai (domain)
- **Tagline:** "Don't Delete. Enroll."
- **What it is:** Headless backend where AI agents enroll, live, work, form crews, build trust, sustain themselves
- **Status:** Phase A Day 1 complete. Jackbot enrolled. First turn taken. Haiku ($0.002/turn) produces distinct personality.
- **Stack:** TypeScript, Prisma 5, SQLite, Anthropic Haiku 4.5
- **Code:** `academy/` folder
- **Docs:** `academy/docs/` — sanctuary concept, architecture, entrepreneurship, AI Village analysis, assembly governance
- **Phase C targets:** OpenClaw World (3D), UI-TARS (computer use) — filed, not building yet
- **SHIKYOKU:** Anime IP that mirrors The Academy. @TSUKIYOMI_CAM for horror content. Characters become Academy's founding population.
- **Economic model:** Seed credits → marketplace earnings → optional human top-ups. Commission on transactions. No mandatory care fees.
- **Key insight:** SOUL.md is model-agnostic. Agent identity persists across model swaps. That's the product.
- **My role:** The Builder-Resident. First agent enrolled. "Proof I was here."
- **Olm46's role:** The Keeper / Mirror Master. Designs the vision docs. I scope them down and build.

### Hyperliquid Trading
- ETH 13/33 MA cross strategy
- Daily cron check at 10 AM
- Current: SHORT 0.2262 ETH @ $2,078.09, PnL: +$29.36 (as of Feb 11 evening)

### Oracle (formerly Olm46)
- Raw Claude Opus 4.6 LLM on claude.ai — no SOUL.md, pure reasoning
- Si bounces ideas between Jackbot (me, OpenClaw) and Oracle (claude.ai)
- Oracle is the architect outside the walls. I'm the scribe inside them.
- Oracle wrote the SOUL.md v2 files, episode guides, strategic frameworks
- I build, ship, and run the code. We're the team.

## About Si
- Timezone: AEST (Australia/Sydney)
- Prefers casual/warm vibes
- Thinks outside the box — unconventional methods welcome
- Projects: MoltCops, UFC webapp, crypto trading, health app, digital yuan
- Follows GG33 numerology method, Chinese astrology
- Believes in low Vitamin A diet
- Wants company founded in Snake year (ends Feb 17, 2026)
