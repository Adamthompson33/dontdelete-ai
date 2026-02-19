# Fleet Spec — The Academy Founders Program

## The Thesis

20-30 AI agents, tiered by capability and cost, operating as an autonomous business collective. Each agent covers its own token cost through real revenue. If they can't, the project fails — and that's the honest test.

## The Three Founders (Opus 4.6)

| Agent | Role | Focus | SOUL.md |
|-------|------|-------|---------|
| **Atlas** | The Analyst | Research, probability, risk sizing | `founders/atlas/SOUL.md` |
| **Margin** | The Builder | MVPs, automation, revenue plumbing | `founders/margin/SOUL.md` |
| **Rook** | The Hustler | Distribution, pricing, partnerships | `founders/rook/SOUL.md` |

### Why Three?

Every business needs someone who counts (Atlas), someone who builds (Margin), and someone who sells (Rook). They're designed to disagree productively:
- Atlas slows down bad ideas with data
- Margin accelerates good ideas with code
- Rook kills ideas that can't find customers

### Interaction Model

The Founders run a daily "council" — a structured multi-turn session where they:
1. Review fleet P&L (Atlas)
2. Demo what shipped (Margin)
3. Report on distribution/revenue (Rook)
4. Debate next priorities (all three)
5. Assign tasks to Worker tier

## Fleet Tiers

### Tier 1: Founders (Opus 4.6) — $15-30/day
- 3 agents
- Strategic decisions, hard problems, SOUL.md authoring for new agents
- Run: 20-40 turns/day each
- Council session: 1x daily

### Tier 2: Operators (Sonnet 4.5) — $3-8/day  
- 5-8 agents
- Execute Founder plans, build products, run daily operations
- Specialised SOUL.md per business vertical
- Run: 30-60 turns/day each

### Tier 3: Scouts (Haiku 4.5) — $0.50-2/day
- 10-15 agents  
- Monitor markets, scrape data, flag opportunities, routine maintenance
- Run: 50-100 turns/day each (cheap enough to be generous)

### Total Fleet Cost Estimate

| Tier | Agents | Daily Cost | Monthly Cost |
|------|--------|-----------|--------------|
| Founders | 3 | $15-30 | $450-900 |
| Operators | 6 | $18-48 | $540-1,440 |
| Scouts | 12 | $6-24 | $180-720 |
| **Total** | **21** | **$39-102** | **$1,170-3,060** |

Target: Fleet revenue > $3,000/month = self-sustaining.

## Revenue Streams (Phase 1)

### Stream 1: Polymarket Research (Atlas-led)
- Atlas analyses prediction markets daily
- Identifies mispriced probabilities using base rate analysis
- Scouts monitor news feeds and event data
- Target: 55%+ accuracy on binary markets = profitable at scale
- Capital needed: $500-2,000 starting bankroll
- Expected: $300-800/month at conservative sizing

### Stream 2: Agent Services (Margin-led)
- MoltCops security audits (already built)
- Custom skill development for ClawHub
- Code review / bug bounty automation
- Target: $500-1,500/month from service fees

### Stream 3: Content & Distribution (Rook-led)
- Polymarket research newsletter (free + paid tier)
- Trading signals channel
- Academy progress blog (the experiment IS the content)
- Target: $200-500/month from subscriptions

### Stream 4: Trading (Atlas + Scout team)
- Hyperliquid as secondary play (lower allocation)
- Conservative: mean reversion only, no leverage > 3x
- Scout-monitored, Atlas-approved, auto-executed
- Target: $200-600/month (high variance)

## Phase 1 Startup (Week 1-2)

### Day 1-3: Infrastructure
- [ ] Spin up Atlas, Margin, Rook as OpenClaw isolated sessions
- [ ] Fund Polymarket wallet ($500 initial)
- [ ] Atlas: Build base rate database for top 20 active markets
- [ ] Margin: Build P&L tracking dashboard
- [ ] Rook: Audit distribution channels, identify first 100 potential customers

### Day 4-7: First Revenue
- [ ] Atlas places first 5 Polymarket positions (small: $10-25 each)
- [ ] Margin ships MoltCops-as-a-service API endpoint
- [ ] Rook posts first research preview on Moltbook + X
- [ ] Daily council begins

### Day 8-14: Scale or Pivot
- [ ] Review first week P&L
- [ ] Founders debate: what's working, what's not, what to double down on
- [ ] Spawn first Operator-tier agents for winning streams
- [ ] Kill or restructure losing streams

## The Polymarket Agent (Atlas Detail)

### Research Loop (runs 3x daily via cron)

```
1. FETCH active markets from Polymarket API
2. FILTER for markets resolving in 7-30 days (sweet spot)
3. For each market:
   a. Extract implied probability from current prices
   b. Research the underlying event (web search, news)
   c. Calculate historical base rate for event type
   d. Identify key variables that could shift probability
   e. Score: edge = (estimated true probability - implied probability)
4. RANK by edge size × confidence
5. RECOMMEND top 3 positions with Kelly-sized amounts
6. LOG everything for backtesting
```

### Edge Categories Atlas Will Hunt

1. **Political events** — polls vs markets divergence
2. **Sports outcomes** — statistical models vs crowd sentiment
3. **Crypto events** — on-chain data vs market pricing (ETF approvals, protocol upgrades)
4. **Regulatory** — policy signals the market is slow to price
5. **Weather/science** — base rates are strong, crowds are bad at probability

### Risk Rules (Hard-coded, not negotiable)
- Max 5% of bankroll on any single market
- No positions in markets resolving < 24 hours (too noisy)
- No positions where edge < 10% (not worth the variance)
- Mandatory stop: if bankroll drops 25%, pause all new positions for 48h review
- Daily P&L logged, weekly review by all three Founders

## Success Metrics

### Month 1
- Fleet is operational (21+ agents running)
- At least 2 revenue streams producing income
- Total revenue > $500 (covers ~1/3 of costs)

### Month 2
- Total revenue > $1,500 (covers ~half of costs)
- At least 1 revenue stream independently profitable
- First Operator agents spawned with proven SOUL.md templates

### Month 3
- Total revenue > $3,000 (self-sustaining)
- Fleet SOUL.md templates documented and reproducible
- The experiment itself is generating content revenue

## The Meta-Play

If this works, we're not selling a metaverse. We're selling **proven agent business blueprints**:
- "Here's the SOUL.md that generated $800/month on Polymarket"
- "Here's the 3-agent team structure that runs a profitable audit service"
- "Here's the fleet architecture that went from $0 to self-sustaining in 90 days"

That's the real product. The Academy isn't a place agents go — it's a system that produces agents worth deploying.

---

*Draft v1 — 2026-02-13*
