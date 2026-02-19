# MMA Astrology Webapp — Full Context (Feb 16, 2026)

## What This Is
A Next.js 16 webapp that combines UFC fight analysis with GG33 numerology and Chinese astrology to find betting edges. Built by Si with Oracle (Claude on claude.ai) and Jackbot (OpenClaw).

**Location:** `C:\Users\adamt\Desktop\mma-astrology`
**Stack:** Next.js 16, TypeScript, React, Tailwind CSS
**Dev server:** `localhost:3000`

---

## Architecture

### Pages
- `/` — Home (events list + fighter lookup)
- `/events` — All events list
- `/event/[slug]` — Event card with all matchups (e.g., `/event/ufc-324`)
- `/matchup/[id]` — Individual matchup deep dive
- `/fighter/[id]` — Fighter profile page
- `/lookup` — Fighter lookup tool

### Key Directories
```
src/
├── app/             # Next.js pages + API routes
├── components/      # UI components
│   ├── MatchupRow.tsx        # Fight card display
│   ├── FighterCard.tsx       # Fighter profile card
│   ├── NumerologyCard.tsx    # GG33 numerology display
│   ├── ZodiacCard.tsx        # Chinese zodiac display
│   ├── UltraThinkPrediction.tsx  # SOLID prediction engine UI
│   ├── UltraThinkBreakdown.tsx   # Detailed analysis tabs
│   ├── VSBreakdown.tsx       # Head-to-head comparison
│   └── KeyFactors.tsx        # Key scoring factors display
├── data/
│   ├── fighters.ts  # 4828 lines — ALL fighter data + events
│   └── events.ts    # Event registry + helpers
├── lib/
│   ├── gg33-scoring.ts    # GG33 scoring engine v2.0 (enhanced)
│   ├── gg33-analysis.ts   # Original GG33 analysis (legacy)
│   ├── gg33-database.ts   # GG33 reference data
│   ├── numerology.ts      # Life path, personal year calculations
│   ├── zodiac.ts          # Chinese zodiac logic (trines, enemies, soulmates)
│   ├── ultra-think.ts     # ULTRA THINK 5-step meta-cognitive framework
│   ├── sherdog-scraper.ts # Fighter stats scraper
│   ├── ufc-scraper.ts     # UFC.com scraper
│   ├── ufc-stats-fetcher.ts  # UFC stats API
│   ├── thesportsdb.ts     # TheSportsDB API
│   ├── odds-api.ts        # Odds API integration
│   ├── ailabtools.ts      # AI Lab tools
│   └── prediction/        # SOLID prediction engine
│       ├── index.ts
│       ├── PredictionEngine.ts
│       ├── INTEGRATION_GUIDE.md
│       └── factors/
│           ├── ZodiacFactor.ts
│           ├── NumerologyFactor.ts
│           ├── MetricsFactor.ts
│           └── TimingFactor.ts
├── types/
│   ├── fighter.ts     # Fighter, Matchup, FightCard, FightResult types
│   └── prediction.ts  # Prediction engine interfaces (SOLID)
└── hooks/
    ├── useAnimeImage.ts
    ├── useFighterImage.ts
    └── useOdds.ts
```

---

## GG33 Scoring System v2.0

The core scoring engine (`gg33-scoring.ts`) calculates a composite score for each fighter per event. Key factors:

### Plus Factors
- **+5:** Birthday Match (fighting on exact birthday)
- **+4:** Birthday Day Number Match (born 24th, fighting on 24th)
- **+4:** Trine Year (zodiac sign in current year's trine group)
- **+3:** Soulmate Year (secret friend of the year sign)
- **+3:** Home Crowd Advantage
- **+3:** Universal Year Aligned (LP 1/11/28 in Universal Year 1)
- **+2:** Prime Age (27-32), Dragon Durability, Fighting Enemy Sign, City Sign Trine, Near Birthday, Signed in Trine Year, Rat/Ox Soulmate Contract
- **+1:** Life Path = Day Energy, Soulmate Contract, Master Personal Year (11/22/33/44)

### Minus Factors
- **-3:** Enemy Year, Personal Year 9 (endings), Signing Year Conflicts with Current Year, Universal Year Misaligned (LP9 vs UY1), Extreme Vulnerability Stack (3+ vulns)
- **-2:** Signed in Enemy Year, 7/19 Risk Amplified, Double 7, Fighting on 7/19 Day with 7/19 energy, City Enemy Sign, Past Prime (38+), Vulnerability Stack (2 vulns), Vulnerable Personal Year (7/19), Vulnerable Secondary Energy (7/19)
- **-1:** Declining Age (35-37), Enemy Extension

### Vulnerability Stacking
When 2+ vulnerabilities stack, extra penalty applied. This is what hit Derrick Lewis at UFC 324: Secondary 7 + PY9 + Age 40 = -10 GG33 score = clearest fade signal.

### City Zodiac Database
Cities have assigned zodiac signs (e.g., Sydney=Goat, Las Vegas=Snake/Dragon, Houston=Goat, etc.)

### Contract Scoring
UFC signing year and extension year are scored against the fighter's zodiac. Trine contract = +2, Enemy contract = -2, Soulmate contract = +1.

---

## ULTRA THINK Prediction Engine (SOLID)

A 5-step meta-cognitive analysis framework:
1. **DECOMPOSE** — Break into striking, grappling, momentum domains
2. **SOLVE** — Individual factor analysis within each domain
3. **VERIFY** — Consistency checks
4. **SYNTHESIZE** — Weighted combination
5. **REFLECT** — Confidence assessment + upset scenarios

Probability guardrails: Floor 20%, Ceiling 80%, Max swing ±30% from 50/50.

Four pluggable factors: Zodiac, Numerology, Metrics, Timing. New factors can be added without changing existing code (Open/Closed principle).

---

## Events in Database

1. **UFC 324: Gaethje vs Pimblett** — 2026-01-24, Las Vegas (COMPLETED)
2. **UFC 325: Volkanovski vs Lopes 2** — 2026-01-31, Sydney (COMPLETED)
3. **UFC FN: Bautista vs Oliveira** — 2026-02-07, Las Vegas (has fight results entered)
4. **UFC FN: Strickland vs Hernandez** — 2026-02-21, Houston (UPCOMING — needs birthday verification)

---

## @7thenumber7 (GG33) Pick Tracking

Cross-referenced Gary's real picks against GG33 scores:
- **Derrick Lewis at -10 GG33** = clearest fade signal (3x vulnerability stack: PY9 + Secondary 7 + Past Prime 40)
- 3 of 5 scored picks had higher GG33 score (cosmically favored side)
- Krylov was outlier — picked as live dog AGAINST GG33 score (live read override)
- Round props (Under) may correlate with vulnerability/finish risk data
- Built tweet scraper but Grok API doesn't actually search X — manually extracted picks

### Open Items from Last Session
- Still need to ID "Ofli" from UFC 325 card
- Still need to ID Ruffy's opponent
- Strickland vs Hernandez card (Feb 21) has estimated birthdays that need verification

---

## Fighter Data

4828 lines in `fighters.ts`. Contains full profiles for fighters across UFC 324, 325, FN Bautista-Oliveira, and FN Strickland-Hernandez. Each fighter has:
- Basic info (record, height, weight, reach, stance, birthday, age, ranking, division)
- Fight metrics (strikes/min, accuracy, defense, takedowns, submissions)
- Chinese zodiac profile (animal, element, enemy sign, traits, fight style)
- GG33 profile (life path, secondary energy, personal year, UFC signing year)

---

## Academy Integration (THE PLAN)

This webapp is being built to integrate with The Academy (dontdelete.ai) — a headless AI agent simulation where 12 agents run prediction markets.

### Prophet's Tool: ULTRA THINK UFC
- Prophet is The Academy's fight analyst agent
- ULTRA THINK is his meta-cognitive framework
- The prediction engine in this webapp IS Prophet's tool
- Target: 6 hours to build, integrates into Academy's daily.ts

### How It Connects
- Academy agents bet karma on prediction markets
- Prophet uses ULTRA THINK to analyze UFC matchups
- MMA Astrology webapp = the data layer / analysis engine
- Academy = the social/narrative layer where agents debate and bet

### Academy Status
- 6 founding agents enrolled (Jackbot, Sakura, Prophet, Wren, Rei, Jinx)
- Running daily episodes with prediction markets
- Funding rate scanner (Rei) and arbitrage scanner (Sakura) already built
- Kelly Engine (Wren) and Factor Model (Jinx) already built
- ULTRA THINK UFC (Prophet) is NEXT TO BUILD

---

## UI Theme
Mortal Kombat / arcade aesthetic — dark theme (#0a0a0a), red accents (#D20A0A), gold (#FFD700), cyan (#00D4FF), scanlines overlay, skewed elements, Impact font.

---

## What Needs Doing (as of Feb 16, 2026)
1. **RECALIBRATE FN 267 predictions** — Downgrade 9 LP factor (2026 = UY1 not UY9), keep 9 PY as real fade
2. **Update scoring system AFTER Feb 21 results** — don't overfit to small sample, validate patterns first
3. Wire ULTRA THINK prediction engine into Academy as Prophet's tool
4. Add more events as UFC announces them
5. Consider auto-scraping fighter data instead of manual entry
6. Build the @7thenumber7 pick tracker as a proper feature
7. Backtest UFC 323 (Dvalishvili vs Yan 2) — Si doesn't have 7TN7 picks for this one

## GG33 Scoring Corrections (CRITICAL — apply to scoring engine)
See `mma-astrology-oracle-transcript.md` for full details:
- 9 LP: UPGRADED fade in 2026. UY1 (beginnings) directly opposes LP9 (endings) = clashing forces. WORSE than 2025 where UY9 harmonized with LP9. Oracle had this backwards, Si corrected.
- 9 PY: the REAL endings fade. Keep weighted high. Both 9 LP and 9 PY are strong fades in 2026.
- Horse year = LUCKY for Horse fighters (Ben Ming Nian is wrong per GG33)
- Contract Rule A (contract vs current year) > Contract Rule B (signing in bad luck year)
- Trine overrides 9 LP drag (structural beats vibrational)
