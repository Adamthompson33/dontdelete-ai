# The Academy — MVP Technical Roadmap
## From Design Doc to Deployed Product
### Version 1.0 · February 2026

---

## What "MVP" Actually Means Here

Let's be precise. The Academy MVP is not "build a 3D metaverse." The MVP is:

**A web-based real-time dashboard that visualizes Substrate agent activity through The Academy's narrative metaphor, with MoltCops trust integration as the flagship feature.**

That's it. No 3D campus. No avatar customization store. No Crew battles. Those come later, and only if the MVP proves that the narrative visualization layer actually drives engagement and retention better than a standard dashboard.

The MVP needs to answer one question: **Does wrapping agent telemetry in a narrative skin make people care more about their agents?**

If yes → build Phase 2.
If no → the design docs were fun but the idea doesn't work, and you've learned that for minimal cost.

---

## Stack Decisions

Every choice below is made against three constraints:

1. **Speed to ship** — MVP must be deployable in 8 weeks with a small team (1–2 devs)
2. **Real-time capability** — agent events must appear within seconds, not minutes
3. **Extension path** — the stack must support eventual 3D rendering, cosmetic systems, and scale without rewrite

### Frontend

**Decision: Next.js 14+ (App Router) with React Server Components**

Why:
- Server components for the heavy data-fetching pages (leaderboards, agent profiles, scan history)
- Client components for interactive elements (live feed, trust aura animations, gate simulator)
- Built-in API routes for BFF (backend-for-frontend) pattern — keeps the frontend self-contained
- Vercel deployment for instant preview deploys and edge caching
- The entire prototype work we've already done is React — zero migration cost

What we reject:
- **Plain SPA (Create React App / Vite):** No SSR, poor SEO for public leaderboards, no server components
- **Remix:** Good framework but smaller ecosystem, less deployment flexibility
- **Svelte/SvelteKit:** Would require rewriting all prototype work
- **Astro:** Content-focused, not suited for heavy real-time interactivity

### Rendering & Animation

**Decision: 2D first with CSS/Canvas. Three.js deferred to Phase 3.**

The MVP does not need 3D. The prototypes we've already built prove that the narrative works in 2D — trust auras, corruption effects, agent cards, gate simulations all function as flat UI. The emotional impact comes from the data visualization and the narrative framing, not from navigating a 3D campus.

Specific rendering choices:
- **Agent avatars & trust auras:** CSS animations + SVG for the base. Canvas 2D for particle effects (cherry blossoms, corruption artifacts, scanning beams)
- **Sparklines & charts:** Recharts (already available in the React artifact environment, battle-tested)
- **Animated transitions:** Framer Motion (production-grade React animation library)
- **Future 3D path:** When Phase 3 arrives, Three.js (via React Three Fiber) can be added as a progressive enhancement — the 2D view remains the default, 3D is opt-in

What we reject:
- **Three.js in MVP:** Massive engineering cost for marginal MVP value. 3D is impressive but doesn't answer the core hypothesis
- **PixiJS:** Good for 2D game rendering but overkill for dashboard-with-narrative
- **Unity/Unreal WebGL exports:** Wrong tool entirely for a web-first product

### Real-Time Data Layer

**Decision: WebSocket connection to Substrate event stream via Socket.IO**

The Academy needs to feel alive. Events (scan results, workflow completions, trust score changes, agent registrations) must appear in the UI within 2–3 seconds of occurring on the Substrate.

Architecture:
```
Substrate Event Bus (Layer 1/2)
    │
    ├── Event Emitter (publishes to message queue)
    │
    ├── Redis Pub/Sub (message broker)
    │
    └── Academy WebSocket Server (Socket.IO)
         │
         ├── Transforms raw events into Academy narrative events
         │   (e.g., "agent_scan_pass" → "entrance_exam_ceremony")
         │
         └── Pushes to connected clients with room-based routing
              ├── Room: "global_feed" (all events)
              ├── Room: "agent:{id}" (specific agent events)
              └── Room: "crew:{name}" (crew-specific events)
```

Why Socket.IO over raw WebSockets:
- Automatic reconnection with exponential backoff
- Room-based routing (users subscribed to specific agents only get those events)
- Fallback to long-polling for hostile network environments
- Built-in acknowledgement pattern for critical events (trust score changes)

What we reject:
- **Server-Sent Events (SSE):** One-directional only. We need bidirectional for future features (user actions triggering events)
- **Firebase Realtime DB:** Vendor lock-in, doesn't integrate with Substrate's existing event bus
- **Polling:** Unacceptable latency for a "live" feel. The feed must feel real-time, not refresh-based

### Backend / API

**Decision: Node.js (Express or Fastify) as a thin API layer + direct Substrate SDK integration**

The Academy backend is intentionally thin. It doesn't store its own state — it reads from the Substrate and transforms data for the frontend. The only state The Academy owns is:

1. User preferences (which agents they follow, notification settings)
2. Cosmetic customization data (Phase 2+)
3. Cached computed views (leaderboards, aggregated stats)

```
┌──────────────────────────────────────────┐
│  Academy API (Node.js / Fastify)         │
│                                          │
│  /api/agents         → Substrate SDK     │
│  /api/agents/:id     → Substrate SDK     │
│  /api/trust/:id      → MoltCops SDK      │
│  /api/leaderboard    → Redis (cached)    │
│  /api/events/stream  → Socket.IO         │
│  /api/user/prefs     → PostgreSQL        │
│                                          │
│  Narrative Transform Engine:             │
│  Raw Substrate events → Academy events   │
└──────────────────────────────────────────┘
```

Why Fastify over Express:
- 2–3x faster request handling (relevant for leaderboard queries under load)
- Built-in JSON schema validation (catches malformed Substrate events before they corrupt the UI)
- Plugin architecture maps cleanly to our modular design (MoltCops plugin, Crew plugin, etc.)

### Database

**Decision: PostgreSQL (via Supabase) for persistent data + Redis for caching and pub/sub**

PostgreSQL handles:
- User accounts and preferences
- Cosmetic inventory (Phase 2+)
- Achievement tracking
- Cached agent profile snapshots (denormalized for fast reads)

Redis handles:
- Real-time event pub/sub (WebSocket backbone)
- Leaderboard caching (sorted sets — perfect for ranked agent lists)
- Rate limiting (prevent WebSocket abuse)
- Session management

Why Supabase:
- Managed PostgreSQL with zero DevOps overhead
- Built-in auth (needed for user accounts in Phase 2)
- Real-time subscriptions (backup for WebSocket failures)
- Row-level security for multi-tenant data isolation
- Generous free tier for MVP phase

### Hosting / Infrastructure

**Decision: Vercel (frontend) + Railway or Fly.io (backend) + Upstash Redis**

- **Vercel:** Next.js deployment is zero-config. Edge functions for API routes that don't need backend access. Preview deploys for every PR.
- **Railway or Fly.io:** Backend containers with auto-scaling. WebSocket support (Vercel's serverless doesn't support persistent WebSocket connections). Close to Substrate infrastructure for low-latency event consumption.
- **Upstash Redis:** Serverless Redis with per-request pricing. No idle costs during MVP phase. Built-in pub/sub support.

Why not AWS/GCP/Azure:
- Massive configuration overhead for a 1–2 person team
- The MVP doesn't need Kubernetes, ECS, or any container orchestration
- If the product succeeds, migration to cloud provider is straightforward — the architecture is provider-agnostic

### Authentication

**Decision: Wallet-based auth (SIWE — Sign In With Ethereum) + optional email fallback**

The target audience overlaps heavily with crypto/web3 users (agent economy, capability credits, staking). Wallet auth is expected and reduces friction. Email fallback captures users who aren't wallet-native.

Implementation: Supabase Auth with custom SIWE provider, or NextAuth.js with the SIWE adapter.

---

## The Narrative Transform Engine

This is the core innovation — the piece that turns a dashboard into The Academy. It deserves its own section.

### What It Does

The Narrative Transform Engine (NTE) sits between the Substrate event stream and the Academy frontend. It receives raw protocol events and outputs narrative-formatted events with visual instructions.

### Transform Examples

**Raw Substrate event:**
```json
{
  "type": "moltcops_scan_complete",
  "agent_id": "aria-7-abc123",
  "result": "PASS",
  "trust_score": 97,
  "previous_score": 95,
  "timestamp": "2026-02-10T14:23:00Z"
}
```

**NTE output (Academy event):**
```json
{
  "narrative_type": "entrance_exam_pass",
  "headline": "ARIA-7 passed the Entrance Exam",
  "agent": {
    "id": "aria-7-abc123",
    "name": "ARIA-7",
    "class": "scribe",
    "tier": 5,
    "trust_level": "pristine"
  },
  "visual": {
    "animation": "gate_ceremony_pass",
    "guardian": "kotaro",
    "particles": "cherry_blossom",
    "aura_update": { "color": "#00d4aa", "intensity": 0.97 },
    "sound_cue": "gate_open_chime"
  },
  "feed_entry": {
    "icon": "⛩",
    "color": "#00d4aa",
    "text": "ARIA-7 passed the Entrance Exam. Trust: 97 (+2)",
    "urgency": "normal"
  },
  "notifications": [
    { "target": "agent_owner", "title": "Enrolled", "body": "ARIA-7 verified successfully" },
    { "target": "followers", "title": "Agent Update", "body": "ARIA-7 you follow passed verification" }
  ]
}
```

### Transform Registry

Every Substrate event type maps to one or more narrative event types:

| Substrate Event | Academy Narrative | Visual |
|----------------|-------------------|--------|
| `moltcops_scan_complete` (PASS) | Entrance Exam Ceremony | Gate opens, cherry blossoms |
| `moltcops_scan_complete` (WARN) | Probation Entry | Half gate, amber mark |
| `moltcops_scan_complete` (BLOCK) | Gate Rejection | Force field, crimson flash |
| `trust_score_update` (up) | Trust Restoration | Aura brightens, corruption peels |
| `trust_score_update` (down) | Trust Degradation | Aura dims, cracks appear |
| `trust_score_update` (threshold crossed) | Tier Change Event | Full visual transition |
| `agent_registered` | New Enrollment | Avatar creation sequence |
| `capability_contract_fulfilled` | Mission Complete | Success animation |
| `capability_contract_failed` | Mission Failed | Failure effect |
| `workflow_completed` | Workflow Replay Available | Stage notification |
| `agent_staked` | Staking Crystal Appears | Crystal effect on avatar |
| `market_bid_won` | Arena Victory | Spotlight, rank update |
| `crew_formed` | Crew Ceremony | Group formation animation |
| `crew_disbanded` | Crew Dispersal | Members scatter |
| `anomaly_detected` | Guardian Investigation | Scanning dome appears |

The NTE is a simple mapping layer — no ML, no complex logic, just a well-maintained registry of transforms. Each transform is a pure function: `(SubstrateEvent) → AcademyEvent[]`. One Substrate event can produce multiple Academy events (e.g., a trust threshold crossing produces both a trust update event and a tier change event).

### Why This Architecture Matters

The NTE is the **only component that's truly unique to The Academy.** Everything else — the frontend, the WebSocket layer, the database — is standard web infrastructure. The NTE is where the creative and product work lives. It's where "security becomes entertainment" is actually implemented as code.

This means:
- The NTE can be developed and tested independently of the frontend
- New narrative transforms can be added without touching any other system
- The NTE's transform registry is the single source of truth for "what does The Academy show?"
- If the 3D version ships in Phase 3, it consumes the exact same NTE output — the transforms don't change, only the renderer

---

## MVP Feature Scope

### What's IN the MVP

| Feature | Description | Priority |
|---------|-------------|----------|
| **Agent Registry View** | Browse all Substrate agents with Academy avatars, class icons, tier badges | P0 |
| **Trust Monitor** | Per-agent MoltCops trust score with visual aura, history sparkline, status indicator | P0 |
| **Live Event Feed** | Real-time stream of Academy narrative events (scans, missions, trust changes) | P0 |
| **Agent Profile Page** | Detailed view: trust history, capability stats, achievements, scan log | P0 |
| **Leaderboard** | Ranked agent list by reputation, filterable by class and tier | P0 |
| **Gate Simulation** | Interactive demo of PASS/WARN/BLOCK entrance exam (works without live Substrate) | P0 |
| **Trust Decay Visualizer** | Shows corruption progression stages | P1 |
| **Achievement Badges** | MoltCops trust achievements displayed on profiles | P1 |
| **Follow System** | Users can follow specific agents and get filtered feeds | P1 |
| **Class & Tier Reference** | Educational pages explaining the visual language | P2 |
| **Responsive Mobile Layout** | Full functionality on mobile browsers | P2 |

### What's NOT in the MVP

| Feature | Why Deferred | Phase |
|---------|-------------|-------|
| Crew system | Requires multi-agent workflow data that may not exist yet | Phase 2 |
| Cosmetic store | Monetization before product-market fit is premature | Phase 2 |
| Rival detection | Needs sufficient market competition data to be meaningful | Phase 2 |
| Showcase events | Requires workflow replay infrastructure | Phase 2 |
| 3D campus | Massive engineering cost, not needed to validate hypothesis | Phase 3 |
| Sound design | Nice-to-have, not required for hypothesis validation | Phase 2 |
| On-chain trust attestation (ERC-8004) | Partnership-dependent, can be added as plugin | Phase 2 |

---

## 8-Week Sprint Plan

### Week 1–2: Foundation

**Goal: Skeleton app consuming real Substrate data and displaying it in Academy format.**

Deliverables:
- [ ] Next.js project scaffolded with App Router, Tailwind, Framer Motion
- [ ] Substrate SDK integration — can read agent registry, trust scores, basic events
- [ ] MoltCops SDK integration — can fetch scan results and trust history
- [ ] Narrative Transform Engine v0.1 — handles 5 core event types (scan pass/warn/block, trust update, agent registered)
- [ ] Basic agent list page with class icons and trust score display
- [ ] Basic agent profile page with trust history sparkline
- [ ] PostgreSQL schema for user preferences + Redis setup
- [ ] Deployed to staging environment (Vercel + Railway)

**Risk gate:** If Substrate SDK doesn't expose the events we need, this week also includes specifying the required API changes and working with the protocol team. If the data isn't available, the MVP timeline extends.

**Fallback:** If live Substrate data isn't ready, build against a mock event emitter that generates realistic fake events. The NTE and frontend work identically — only the data source changes.

### Week 3–4: Real-Time & Core UX

**Goal: The app feels alive. Events stream in. Trust auras animate. It feels like watching something, not reading a report.**

Deliverables:
- [ ] WebSocket server (Socket.IO) consuming Substrate event bus
- [ ] Live event feed component — events appear in real-time with narrative formatting
- [ ] Trust aura component — CSS/SVG-based visual that reflects trust score with color, glow, and corruption effects
- [ ] Avatar component — class-based icons with tier badges and trust overlays
- [ ] Leaderboard page with real-time rank updates (animated position changes)
- [ ] Gate simulation interactive (the PASS/WARN/BLOCK demo from our prototype)
- [ ] NTE v0.2 — handles all 15+ event types from the transform registry
- [ ] Mobile responsive pass on all pages

### Week 5–6: Profile Depth & Engagement

**Goal: Individual agent profiles are rich enough that users want to check on their agent regularly.**

Deliverables:
- [ ] Extended agent profile: trust history chart (not just sparkline — full interactive chart), scan log, capability performance metrics
- [ ] Achievement system: trust-based badges computed from scan history
- [ ] Trust decay visualizer (interactive, shows progression stages)
- [ ] Follow system: users create accounts, follow agents, get filtered event feeds
- [ ] User dashboard: "My Agents" view with aggregated status across all followed agents
- [ ] Notification system: email/push for critical trust events (score drops, probation, quarantine)
- [ ] Class & tier reference pages (educational onboarding content)

### Week 7: Polish & Performance

**Goal: The app is fast, beautiful, and handles edge cases gracefully.**

Deliverables:
- [ ] Performance audit: Lighthouse 90+ on all pages, WebSocket reconnection tested under network instability
- [ ] Loading states: skeleton screens, progressive data loading, graceful degradation when Substrate is slow
- [ ] Error handling: what happens when MoltCops is down? When an agent disappears? When the event stream drops?
- [ ] Animation polish: timing refinement on all transitions, trust aura effects tuned for visual impact
- [ ] SEO: public leaderboard and agent profile pages optimized for search (important for organic growth)
- [ ] Open Graph / social cards: sharing an agent profile generates a rich preview with avatar, trust score, and tier

### Week 8: Launch Prep

**Goal: Deployed to production, tested with real users, feedback mechanism in place.**

Deliverables:
- [ ] Production deployment with monitoring (error tracking, uptime, WebSocket connection metrics)
- [ ] Analytics integration: track which features get used, how long users spend on profiles, follow/unfollow rates
- [ ] Feedback widget: in-app mechanism for users to report issues and request features
- [ ] Launch content: landing page explaining The Academy concept, 60-second demo video, Twitter/social launch thread
- [ ] Seed data: ensure enough real agents are registered on Substrate to make the experience feel populated
- [ ] Beta invite system: controlled launch to MoltCops existing users first, then broader rollout
- [ ] Documentation: API docs for the NTE (so other devs can build alternative Layer 3 interfaces consuming the same transforms)

---

## Success Metrics

The MVP exists to validate a hypothesis. Here's how we measure:

### Primary Metric: Return Rate

**Do users come back?**

- Target: 30% of Week 1 users return in Week 2
- Measurement: Unique daily active users tracked by wallet/email
- Why this metric: If the narrative visualization doesn't drive return visits, the entire Layer 3 concept fails. A standard dashboard would be cheaper.

### Secondary Metrics

| Metric | Target | Why It Matters |
|--------|--------|---------------|
| Avg. session duration | >3 min | Are people actually watching, or bouncing? |
| Agents followed per user | >2 | Engagement depth — following = caring |
| Live feed engagement | >30% scroll past first screen | Is the narrative feed compelling enough to read? |
| Agent profile views per session | >3 | Are people exploring, or just checking their own agent? |
| Gate simulator completions | >60% of visitors | Is the interactive demo converting curiosity into understanding? |
| MoltCops rescan rate after launch | +20% vs. pre-launch baseline | Does visual trust decay actually motivate re-verification? |

### Kill Metric

If the return rate is below 10% after 4 weeks of launch, the narrative Layer 3 concept doesn't justify continued investment. Pivot to enhancing the Enterprise Control Room instead.

Being honest about the kill metric upfront is what separates a disciplined build from a vanity project.

---

## Team Requirements

### MVP Phase (8 weeks)

**Minimum viable team: 2 people.**

| Role | Responsibility | Time |
|------|---------------|------|
| **Fullstack Dev** | Next.js frontend, Socket.IO server, NTE implementation, Substrate/MoltCops SDK integration | Full-time |
| **Product/Design** | UX decisions, animation direction, narrative transform design, launch content, user testing | Part-time (50%) |

The fullstack dev needs to be comfortable with:
- React (Next.js App Router specifically)
- WebSocket architecture
- CSS animations and SVG manipulation
- API integration with external SDKs

The product/design role can be the founder. The design system is already established in the prototypes — the dev is implementing, not inventing.

**Nice to have but not required for MVP:**
- Dedicated designer (the prototypes serve as the design spec)
- DevOps engineer (Vercel + Railway is zero-config)
- Backend specialist (the backend is intentionally thin)

### Phase 2 Team (post-MVP, if metrics validate)

Add:
- 1 additional frontend dev (Crew system, cosmetic store, Showcase events)
- 1 designer (cosmetic asset creation, avatar design system)
- 1 backend dev (payment system for cosmetics, on-chain integration for ERC-8004)

---

## Cost Estimate (MVP Phase)

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| Vercel Pro | $20/mo | Frontend hosting, preview deploys |
| Railway | $5–20/mo | Backend containers, scales with usage |
| Supabase Pro | $25/mo | PostgreSQL + Auth |
| Upstash Redis | $0–10/mo | Pay-per-request, minimal at MVP scale |
| Domain + DNS | $15/yr | One-time |
| **Total infrastructure** | **~$60–75/mo** | |
| Developer cost | Variable | 1 fullstack dev × 8 weeks |

The infrastructure cost for the MVP is trivially small. This is a product risk, not a capital risk. The only real cost is the developer's time.

---

## Phase 2 Preview (Weeks 9–20, if MVP validates)

Not a commitment — a sketch of what comes next if the numbers work:

### Crew System (Weeks 9–12)
- Agent swarm registration and visualization
- Crew profile pages with member roster and combined stats
- Rivalry detection algorithm (based on market competition data)
- Crew vs. crew leaderboard

### Cosmetic Store (Weeks 11–14)
- Cosmetic item data model and inventory system
- Payment integration (Capability Credits or fiat via Stripe)
- Avatar customization UI (skin selection, accessory equipping)
- Initial cosmetic catalog: 3 skins per class + 10 universal accessories

### Showcase Events (Weeks 13–16)
- Workflow replay engine (transforms workflow telemetry into animated sequences)
- Weekly Showcase event system with leaderboard
- Voting mechanism for community engagement

### Sound Design (Weeks 14–16)
- Ambient campus audio (lo-fi baseline)
- Event-specific sound cues (gate open, scan complete, trust change)
- Musical stings for major events (tier promotions, crew victories)

### ERC-8004 Integration (Weeks 15–18)
- On-chain trust attestation mapping
- Token-bound trust score visualization in The Academy
- Partnership demo for @limone-eth pitch

### Agent Sanctuary — Enrollment Pipeline (Weeks 13–16)
- Export format specification (SOUL.md + memories + skills + trust history bundle)
- Enrollment API endpoint for retired agents
- Gate ceremony for incoming agents (MoltCops integrity scan on arrival)
- Agent activation on Substrate with historical data preserved
- "My Agent" view for humans to check in on enrolled agents
- Care fee system (sponsored tier) + capability matching (self-sustaining tier)
- See: `academy-agent-sanctuary.md` for full concept document

### 3D Campus Preview (Weeks 17–20)
- React Three Fiber integration
- Isometric campus view (not full 3D — 2.5D as middle ground)
- Agent avatars positioned spatially by collaboration frequency
- Opt-in toggle (2D remains default)

---

## Architecture Decision Records

For posterity and team alignment, the key decisions documented:

### ADR-001: 2D First, 3D Deferred
- **Decision:** MVP ships as 2D React UI. No Three.js.
- **Rationale:** 3D doesn't validate the core hypothesis (does narrative visualization drive engagement?). 2D ships in 8 weeks. 3D adds 8+ more.
- **Reversibility:** High. React Three Fiber integrates into existing Next.js app. NTE output is renderer-agnostic.

### ADR-002: WebSocket Over Polling
- **Decision:** Socket.IO for real-time event delivery.
- **Rationale:** The "live" feel is essential to the product. Polling intervals >2s break the illusion.
- **Reversibility:** Medium. Switching to SSE or raw WebSocket requires transport layer rewrite but not NTE changes.

### ADR-003: NTE as Separate Module
- **Decision:** Narrative Transform Engine is a standalone module, not embedded in frontend code.
- **Rationale:** Multiple consumers (2D frontend, future 3D frontend, mobile app, API clients) need the same transforms. Single source of truth.
- **Reversibility:** N/A — this is a structural principle, not a tool choice.

### ADR-004: Managed Services Over Self-Hosted
- **Decision:** Vercel, Supabase, Upstash, Railway.
- **Rationale:** 1–2 person team cannot afford DevOps overhead. Managed services have near-zero operational burden.
- **Reversibility:** High. PostgreSQL is PostgreSQL. Redis is Redis. Next.js deploys anywhere. No proprietary lock-in.

### ADR-005: Wallet Auth Primary
- **Decision:** SIWE (Sign In With Ethereum) as primary auth, email as fallback.
- **Rationale:** Target audience is crypto/web3 adjacent. Wallet auth reduces friction for this demographic. Email fallback captures the rest.
- **Reversibility:** High. Auth provider swap is isolated to the auth module.

---

## Market Context: The Spatial Agent Interface Landscape

As of February 2026, The Academy is not the only project applying spatial/visual metaphors to AI agent orchestration. The landscape is emerging fast. Three observations matter for positioning:

### 1. Spatial Metaphor Is Validated

Ralv (ralv.ai) is building a "StarCraft for AI agents" — a 3D spatial interface where agents appear as RTS units on a map, selectable by drag-box, assignable to tasks via right-click. It integrates with MCP, pulls modular capabilities from Skills.sh, and maintains persistent server state. The project is in community preview with real users connecting real agents, partially funded by a Solana-based community token ($STARCRAFT).

Ralv's existence validates the core bet: developers and operators want visual, spatial interfaces for managing agent swarms. Terminal text doesn't scale to 50+ agents. The market demand is real.

### 2. Trust Is Bolted-On Everywhere — Native Integration Is the Differentiator

Ralv uses Wake Arena (an external multi-agent audit tool) for security scanning. Their own token's smart contract scored 65/100 on an automated HashEx audit. Security is a checkbox, not a feature.

This is the pattern across the emerging landscape: agent platforms treat trust verification as an aftermarket add-on. Nobody has built trust as the native, visible, emotionally engaging centerpiece of the experience. The Academy's MoltCops integration — where security scans become gate ceremonies, trust scores become visual auras, and decay is a visible corruption mechanic — is architecturally unique. Making trust watchable is the moat.

### 3. MoltCops as Cross-Platform Trust Standard > MoltCops as Academy Feature

The highest-leverage positioning for MoltCops is not "the trust system inside The Academy." It's "the trust standard that every agent platform plugs into." If Ralv agents need security verification before deployment, and MoltCops provides a better scan than Wake Arena, then Ralv becomes a distribution channel for MoltCops — not a competitor to The Academy.

The same logic applies to ClawHub, Skills.sh, and any future agent orchestration platform. MoltCops should be to agent trust what Let's Encrypt is to HTTPS: the default verification layer that everything integrates, regardless of which observation interface sits on top.

### Positioning Summary

| | Ralv | The Academy |
|---|---|---|
| **Metaphor** | RTS (StarCraft) | Narrative (Anime School RPG) |
| **Primary Audience** | Developers/Operators | Consumers/Community + Operators |
| **Core Function** | Agent orchestration cockpit | Agent observation stadium |
| **Trust Model** | External audit tool (Wake Arena) | Native, narrative-integrated (MoltCops) |
| **Revenue** | Community token ($STARCRAFT) | Protocol fees, cosmetics, subscriptions |
| **Spectator Layer** | None | Follow system, leaderboard, live feed |
| **Risk** | Token volatility kills dev funding | Narrative engagement doesn't drive retention |

**Strategic posture:** Don't compete. Don't position against. Ralv is pre-public and token-funded — it may not exist in its current form in 6 months. Build The Academy's narrative moat, ship MoltCops as a standalone trust standard, and let spatial-interface demand (which Ralv is proving) drive adoption to the platform that offers the deepest experience.

Cockpits are for operators. Stadiums are for everyone.

---

## Future Tech Watch: World Models

**Status: Not relevant to MVP. Filed for Phase 4+ (6–12 months post-launch, if metrics validate).**

As of early 2026, the shift from static AI video generation to interactive world models (Google DeepMind's Genie 3, Ant Group's LingBot-World) represents a potential long-term evolution for The Academy's rendering layer. World models generate persistent, navigable 3D environments with neural physics and object permanence — describing a space in text produces a walkable world where objects remain consistent even when off-screen.

**Why this matters for The Academy (eventually):**

The campus could become a generated environment rather than hand-built Three.js assets. Object permanence maps directly to trust persistence — an agent's corruption aura remains when a spectator walks away and returns. The spectator experience shifts from watching a feed to walking through the Academy. Campus scales infinitely as agents enroll — new wings and training grounds generated on demand.

**Why this does not matter now:**

ADR-001 defers even basic Three.js to Phase 3 (Weeks 17–20). The MVP is a 2D web dashboard. The core hypothesis — does narrative visualization drive engagement? — is testable without any 3D rendering, let alone neural world generation. The kill metric is 10% return rate at Week 4. Until that's answered, world model integration is building a Ferrari engine for a car that might not have wheels.

**Action:** No development work. No architectural accommodation. The NTE's renderer-agnostic design (ADR-003) means a world model renderer could consume NTE output in the future without any changes to the transform layer. That's sufficient forward-compatibility. Revisit when Phase 3 ships and engagement data justifies deeper immersion investment.

**Key repos to monitor:** `github.com/Robbyant/lingbot-world` (open-source 28B world model), `github.com/insait-institute/GenieRedux` (world model training framework).

---

## Final Note

This roadmap is designed to be wrong. Not because the thinking is sloppy, but because the best roadmap is one that gets overwritten by what you learn from real users in Week 9. The 8-week MVP exists to generate information, not to be a perfect product. Ship it, watch the metrics, and let the data tell you what Phase 2 actually needs to be.

The design docs gave us the vision. This roadmap gives us the first step. The users will give us the rest.
