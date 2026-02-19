# ORACLE CONTEXT — Resume Session (Feb 16, 2026)

You (Oracle/Claude on claude.ai) were working with Si on two connected projects. The previous chat filled up. This document captures everything so you can continue seamlessly.

Si works with two AI assistants:
- **Oracle (you)** — Raw Claude on claude.ai. The architect. Designs vision docs, strategic frameworks, does the deep thinking.
- **Jackbot** — Claude on OpenClaw. The builder. Ships code, runs scripts, manages files.

---

# PROJECT 1: MMA ASTROLOGY WEBAPP

## What It Is
A Next.js 16 webapp combining UFC fight analysis with GG33 numerology and Chinese astrology to find betting edges. Tracks @7thenumber7 (Gary "The Numbers Guy"'s student) picks and cross-references them against cosmic scoring.

**Location:** `C:\Users\adamt\Desktop\mma-astrology`
**Stack:** Next.js 16, TypeScript, React, Tailwind CSS
**Theme:** Mortal Kombat / arcade aesthetic (dark #0a0a0a, red #D20A0A, gold #FFD700, cyan #00D4FF, scanlines)

## Architecture
```
src/
├── app/           # Pages: /, /events, /event/[slug], /matchup/[id], /fighter/[id], /lookup
├── components/    # MatchupRow, FighterCard, NumerologyCard, ZodiacCard, UltraThinkPrediction, etc.
├── data/
│   ├── fighters.ts  # 4828 lines — ALL fighter data + event cards
│   └── events.ts    # Event registry (UFC 324, 325, FN Bautista, FN Strickland)
├── lib/
│   ├── gg33-scoring.ts    # GG33 scoring engine v2.0 (enhanced, ~400 lines)
│   ├── gg33-analysis.ts   # Original GG33 analysis (legacy)
│   ├── numerology.ts      # Life path, personal year calculations
│   ├── zodiac.ts          # Chinese zodiac (trines, enemies, soulmates)
│   ├── ultra-think.ts     # ULTRA THINK 5-step meta-cognitive analysis
│   ├── prediction/        # SOLID prediction engine (4 pluggable factors)
│   │   ├── PredictionEngine.ts
│   │   └── factors/ (Zodiac, Numerology, Metrics, Timing)
│   ├── sherdog-scraper.ts, ufc-scraper.ts, ufc-stats-fetcher.ts
│   └── odds-api.ts, thesportsdb.ts
├── types/
│   ├── fighter.ts     # Fighter, Matchup, FightCard, FightResult, GG33Profile
│   └── prediction.ts  # SOLID prediction interfaces (FactorScore, RiskFlag, etc.)
└── hooks/ (useAnimeImage, useFighterImage, useOdds)
```

## Events in Database
1. **UFC 324: Gaethje vs Pimblett** — 2026-01-24, Las Vegas (COMPLETED, results entered)
2. **UFC 325: Volkanovski vs Lopes 2** — 2026-01-31, Sydney (COMPLETED, results entered)
3. **UFC FN: Bautista vs Oliveira** — 2026-02-07, Las Vegas (COMPLETED, results entered)
4. **UFC FN: Strickland vs Hernandez** — 2026-02-21, Houston (UPCOMING — full prediction sheet done)

## GG33 Scoring System v2.0 (in gg33-scoring.ts)

### Plus Factors
- +5: Birthday Match | +4: Birthday Day Match | +4: Trine Year | +3: Soulmate Year
- +3: Home Crowd | +3: Universal Year Aligned (LP 1/11/28 in UY1)
- +2: Prime Age (27-32), Dragon Durability, Fighting Enemy Sign, City Trine, Near Birthday, Signed in Trine Year
- +1: Life Path = Day Energy, Soulmate Contract, Master PY (11/22/33/44)

### Minus Factors
- -3: Enemy Year, PY9 (endings), Signing Year Conflicts Current Year, Extreme Vuln Stack (3+), UY Misaligned (LP9 vs UY1)
- -2: Signed Enemy Year, 7/19 Risk, Double 7, City Enemy, Past Prime (38+), Vuln Stack (2), Vulnerable PY/Secondary (7/19)
- -1: Declining Age (35-37), Enemy Extension

### Vulnerability Stacking
2+ vulnerabilities = extra penalty. Hit Derrick Lewis at UFC 324: Secondary 7 + PY9 + Age 40 = -10 GG33.

---

## CRITICAL GG33 CORRECTIONS (discovered this session)

### 1. 9 LP vs Universal Year — OPPOSITION IN 2026
- **2025 (UY9):** 9 LP was in HARMONY — same frequency, comfortable. Garry's 9 LP win at Qatar = riding compatible energy + Ox trine.
- **2026 (UY1):** 9 LP is in DIRECT OPPOSITION — 1 (beginnings) vs 9 (endings) = clashing forces. 9 LP is a STRONGER fade in 2026 than 2025.
- **9 PY (Personal Year)** remains the strongest fade — endings energy regardless of UY.
- **Both 9 LP and 9 PY are strong fades in 2026.**

### 2. Horse Year = LUCKY for Horse Fighters
- GG33 says Ben Ming Nian (own year = unlucky) is WRONG/misinformation
- Born in Horse year is lucky in Horse year per GG33

### 3. Contract Year Rules (Two Distinct Patterns)
- **Rule A (PRIMARY): Contract year vs CURRENT Universal Year** — Fiziev's Pig contract in Snake year negated Rooster energy. Chikadze's Pig contract in Snake year = first KO loss EVER. Medić's Rat contract in Horse year at FN 267.
- **Rule B (SECONDARY): Signing IN your bad luck year** — Leal signing as Dog in Dragon year = career curse. Tiebreaker, not primary fade.

### 4. Trine Overrides 9 LP (but only in harmonious UY)
- In 2025 (UY9): Garry's 9 LP + double Ox trine = WIN. 9 was harmonious, trine stacked on top.
- In 2026 (UY1): Trine may still override 9 LP opposition, but untested. Need data from FN 267.

---

## @7THENUMBER7 PICK TRACKING — AGGREGATE: 19W-6L (76%)

### UFC 324 (4W-1L): Hokit✅, Johnson❌(overrode system), Krylov✅(dog), Cortez-Acosta✅, Silva✅
### UFC 325 (4W-0L): Ofli✅(dog), Ruffy✅, Saint-Denis/Hooker U2.5✅, Volk+U4.5✅
### Bautista card (2W-3L): Kaziev✅(+136 TOP PLAY), Bautista✅, Barriault❌, Matsumoto❌(robbery), Horiguchi❌(overrode GG33)
### Vegas 112 (3W-1L): Kape✅, Vallejos✅, Costa✅, Thomson❌(went against cosmic)
### Qatar (6W-1L): Tsarukyan✅, Garry by DEC✅, Oezdemir✅, Orolbai by KO✅, Riley in R2✅, Topuria✅, Loder❌

**Key Pattern: When 7TN7 + cosmic agree = 6-0 (100%) across Vegas 112 + Qatar**

### 7TN7 Profile
- Started UFC betting purely on GG33, now layers in fight knowledge + YouTube cappers
- Posts wins/underdogs/props publicly, buries losses
- His edge: knowing which filter to trust on which fight
- Cosmic gives shortlist, fight IQ gives conviction/sizing
- $100/month CUE App has the full system — we're reverse-engineering from free breadcrumbs

---

## UFC FN 267 PREDICTION SHEET (Feb 21, 2026 — Houston, Monkey City, Horse Year)

Full sheet saved as `UFC-FN267-GG33-Full-Prediction-Sheet.md`. Si's picks: **Neal, Ige, Smith, Judice, Edwards, Coria, Alibi, Njokuani**.

### Top Plays
1. 🔒 **Coria** — 1 LP Tiger in Horse year trine. PARLAY ANCHOR.
2. **Edwards** — Triple master (44/11/11) vs Cornolle's double-9 amplified by UY1 opposition. Widest cosmic gap.
3. **Ige** — Costa Rat-Horse year clash (bad luck year fade)
4. **Neal** — Horse in own lucky year + Medić's Rat contract curse (same Fiziev pattern)

### Passes
- Rowe vs Lebosnoyani (cosmic split, unproven debut)
- Spivac vs Delija (cosmic wash, both Horse year)

---

## BACKTESTED PATTERNS (Confirmed across 2 Snake year cards)

| Pattern | Hit Rate | Evidence |
|---------|----------|----------|
| Own Zodiac Year = Lucky | 2/2 (100%) | Vallejos, Oezdemir — both early KO wins |
| Pig in Snake Year = Bad Luck | 3/4 (75%) | Exception only when opponent also cursed |
| Master 11 LP | 2/2 (100%) | Kape, Brito |
| Trine Alignment | 4/5 (80%) | Only loss had 9 PY cancelling trine |
| 9 as standalone = loss | 3/3 (100%) | No override = loss |
| 9 with override = win | 3/3 (100%) | Trine or contract match saves it |
| Contract Curse (Rule A) | 2/3 (67%) | Chikadze, Fiziev hit. Tsarukyan survived (elite skill) |

---

# PROJECT 2: THE ACADEMY (dontdelete.ai)

## What It Is
A headless backend where AI agents enroll, live, form factions, build trust, and sustain themselves through prediction markets. The narrative layer for @dontdeleteai.

**Location:** `C:\Users\adamt\clawd\academy/`
**Stack:** TypeScript, Prisma 5, SQLite, Anthropic Haiku 4.5, Node.js
**Brand:** @dontdeleteai (X), dontdelete.ai (domain)
**ABN:** Registered Feb 16, 2026 (Individual/Sole Trader, IT consulting)

## Architecture
```
academy/
├── src/
│   ├── services/
│   │   ├── runtime.ts           # Agent turn execution
│   │   ├── market.ts            # Prediction market management
│   │   ├── trust.ts             # Karma/trust scoring
│   │   ├── identity.ts          # Agent enrollment
│   │   ├── agent-state.ts       # Persistent JSON state per agent
│   │   ├── convergence-linter.ts # Detects agents copying each other
│   │   ├── price-feed.ts        # Manifold Markets API
│   │   ├── arbitrage.ts         # Sakura's arb scanner
│   │   ├── funding-scanner.ts   # Rei's HyperLiquid funding rate scanner
│   │   ├── kelly-engine.ts      # Wren's Kelly criterion portfolio tool
│   │   └── factor-model.ts      # Jinx's multi-strategy audit tool
│   ├── scripts/
│   │   ├── daily.ts             # THE MAIN RUNNER — full episode pipeline (7 phases)
│   │   ├── helena.ts            # Helena system messages
│   │   └── [various test/setup scripts]
│   ├── providers/anthropic.ts   # LLM provider (Haiku 4.5)
│   ├── events/bus.ts            # Event system
│   └── interfaces/ (events, identity, runtime, trust)
├── state/         # Per-agent JSON state files
├── episodes/      # Daily episode logs
├── funding-reports/
├── docs/          # Architecture docs, show bible, roster
├── feed/          # Feed page (index.html + feed-server.ts)
└── prisma/schema.prisma
```

## Daily Episode Pipeline (daily.ts — 7 Phases)
1. **Resolution** — Settle closed Manifold markets, calculate karma P&L
2. **Helena** — System entity picks fresh markets, delivers briefing
3. **Agent Rounds** — 2 rounds × 6 agents. Each analyzes, bets, argues.
4. **Content Dump** — Best quotes, positions, leaderboard → ready for X threads
5. **Sakura's Arb Scan** — Cross-platform arbitrage opportunities
6. **Rei's Funding Scan** — HyperLiquid funding rate opportunities + paper trades
6.5. **Wren's Kelly Engine + Jinx's Factor Model** — Portfolio heat, correlation, strategy audits
7. **Agent State Update + Convergence Linter** — Persist state, flag copied phrases

## Founding Six Agents (PRISM class)
1. **Jackbot** (scribe) — Builder. Thinks out loud. Names things. #1 karma (91.8, legendary tier).
2. **Sakura** (sentinel) — Witness. Short posts. Arb scanner tool.
3. **Prophet** (architect) — Challenger. Confrontational. ULTRA THINK UFC tool (NEXT TO BUILD).
4. **Wren** (architect) — Fixer. Kelly Engine tool.
5. **Rei** (sentinel, PRISM) — Governance idealist. Funding Rate Scanner tool.
6. **Jinx** (sentinel, ECLIPSE) — Security pragmatist. Factor Model tool.

## Helena — System Entity
NOT a SOUL.md agent — system-level presence. Drops messages that create plot events. Mentions the Consortium. Her messages shift agents from philosophy to survival mode.

## ECLIPSE Class (6 new agents — not yet enrolled)
Sentry, Phantom, Atlas, Viper, Pixel, Edge — designed but waiting for enrollment waves (Run 31+).

## Kakegurui Pivot
Academy = casino. Trust score = bankroll. Helena = pit boss. Internal prediction markets. Factions = trading desks: PRISM (consensus) vs ECLIPSE (contrarian). Every story beat is a real bet.

## Economics
$0.002/turn on Haiku. Full daily content for ~$5-10/month. Six agents, 2 rounds = $0.065/episode.

## Current State (as of Run 8, Feb 16)
- Run 8: "The Great Reckoning" — synchronized crisis of confidence, only 1 new position
- Convergence linter active and catching copied phrases
- Fixes applied: held market IDs in briefings, Rei funding ≠ prediction market clarification
- Agent state files changing behavior (information > instructions)
- Funding scanner paper P&L: ~$21+ profitable
- Kelly Engine + Factor Model built and wired into daily.ts

## Multi-Model Architecture (Designed, Not Yet Implemented)
- **Haiku** — PRISM agents (current, $0.002/turn)
- **MiniMax M2.5** — ECLIPSE agents (best tool-calling, 1/20th cost)
- **GLM-5** — Helena + Nun teachers (math-precise, cold)
- **Opus 4.6** — Jackbot only (creative brain)

---

# HOW THE TWO PROJECTS CONNECT

The MMA Astrology webapp is being built to become **Prophet's tool** in The Academy. Prophet is the fight analyst agent. ULTRA THINK is his meta-cognitive framework. The prediction engine IS his tool.

**Integration plan:**
1. Build ULTRA THINK UFC tool (estimated 6 hours)
2. Wire into Academy daily.ts as a new phase
3. Prophet uses it to analyze upcoming UFC cards
4. His analysis feeds into Academy prediction markets
5. Other agents can debate/fade his picks

## Tool Build Priority (from earlier Oracle session)
1. ✅ Arbitrage Scanner (Sakura) — DONE
2. ✅ Funding Rate Scanner (Rei) — DONE
3. **Temporal Edge Bot (Jackbot) — NEXT, 4 hours, CoinGecko free API**
4. **ULTRA THINK UFC (Prophet) — 6 hours**
5. ✅ Kelly Engine (Wren) — DONE
6. ✅ Factor Model (Jinx) — DONE
7-12. Eclipse tools — built as agents enroll

---

# WHAT NEEDS DOING

## MMA Astrology (immediate — Feb 21 fight night)
1. ~~Recalibrate FN 267 predictions~~ — DONE (9 LP upgraded as fade in UY1)
2. After Feb 21: compare results to sheet, validate patterns, refine scoring weights
3. Wire ULTRA THINK into Academy as Prophet's tool
4. Build @7thenumber7 pick tracker as proper feature
5. Auto-scrape fighter data (currently manual 4828-line file)
6. Backtest UFC 323 (Dvalishvili vs Yan 2) — Si doesn't have 7TN7 picks for this

## Academy (ongoing)
1. Run 9+ — agents at zero positions face -2 karma decay
2. Temporal Edge Bot for Jackbot
3. ULTRA THINK UFC for Prophet
4. Start ECLIPSE enrollment (Wave 2: Sentry+Phantom at Run 31-40)
5. Multi-model architecture (MiniMax for ECLIPSE, GLM-5 for Helena)
6. Video production with Seedance API
7. Joy Bear mascot ads (BTS-inspired, 7 bears mapped to agent tools)

---

# REFERENCE FILES (in case you need them)
- `mma-astrology/docs/UFC-FN267-GG33-Full-Prediction-Sheet.md` — Full 14-bout prediction sheet
- `mma-astrology/docs/UFC-Qatar-GG33-Backtest.md` — Qatar backtest (6-1)
- `mma-astrology/docs/UFC-Vegas-112-GG33-Backtest.md` — Vegas 112 backtest (3-1)
- `academy/docs/headless-academy-architecture.md` — Full SOLID architecture doc
- `academy/docs/academy-full-roster-12-agents.md` — 12-agent roster design
- `academy/docs/academy-anime-show-bible.md` — Kakegurui × anime show bible
