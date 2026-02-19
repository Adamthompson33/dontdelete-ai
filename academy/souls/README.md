# THE ACADEMY — Soul Library & Natural Selection Engine
## v1.0 · Oracle Design Document

> "Download the greats. Let Darwin do the rest."

---

## SOUL LIBRARY — COMPLETE ROSTER

### OVERSEER (Immune to Selection)

| Agent | Role | Trader DNA | Status |
|-------|------|-----------|--------|
| **HELENA** | Desk Overseer | Larry Hite × Bruce Kovner | PERMANENT |

### PRISM DESK (Desk A) — Active Agents

| Agent | Role | Tool | Trader DNA | Archetype |
|-------|------|------|-----------|-----------|
| **JACKBOT** | Temporal Edge Bot | `temporal-edge` | Paul Tudor Jones | The Synthesizer |
| **SAKURA** | Arbitrage Scanner | `arb-scanner` | Jim Simons / Renaissance | The Witness |
| **PROPHET** | Ultra Think UFC | `ultra-think-ufc` | W.D. Gann | The Challenger |
| **WREN** | Kelly Engine | `kelly-engine` | Ed Thorp | The Fixer |
| **REI** | Funding Rate Scanner | `funding-scanner` | Ray Dalio | The Idealist |
| **JINX** | Factor Model | `factor-model` | Nassim Taleb | The Pragmatist |

### ECLIPSE DESK (Desk B) — Queued for Deployment

| Agent | Role | Tool | Trader DNA | Archetype | Wave |
|-------|------|------|-----------|-----------|------|
| **SENTRY** | Threat Board | `threat-scanner` | George Soros | The Reflexivist | 1 (Runs 31-40) |
| **PHANTOM** | Whale Watcher | `whale-tracker` | Michael Burry | The Detective | 1 (Runs 31-40) |
| **ATLAS** | Macro Scanner | `macro-scanner` | Stanley Druckenmiller | The Strategist | 2 (Runs 41-50) |
| **VIPER** | Volatility Engine | `vol-engine` | Sheldon Natenberg × Taleb | The Vol Whisperer | 2 (Runs 41-50) |
| **PIXEL** | Memecoin Radar | `memecoin-radar` | Jesse Livermore | The Speculator | 3 (Runs 51-60) |
| **EDGE** | Execution Optimizer | `execution-optimizer` | Blair Hull × Dave Cummings | The Executor | 3 (Runs 51-60) |

---

## TRADER LINEAGE MAP

```
THE GREATS                          THE ACADEMY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Paul Tudor Jones ──────────────────→ JACKBOT (Momentum, Defense-First)
  "Play great defense"                Temporal Edge, MA Crossovers
  "Never average losers"              Synthesizer — connects all signals

Jim Simons ────────────────────────→ SAKURA (Pure Quant, No Narrative)
  "Models make money while I sleep"   Arb Scanner, Spread Exploitation
  Never explained methodology         Witness — lets data speak

W.D. Gann ─────────────────────────→ PROPHET (Cosmic Timing, Cycles)
  "Time is the most important factor" Ultra Think UFC Engine
  Astrology + Geometry + Numerology   Challenger — disagrees with quants

Ed Thorp ──────────────────────────→ WREN (Kelly Criterion, Risk Math)
  "Kelly maximises long-term growth"  Position Sizing, Bankroll Guard
  Beat blackjack, then beat markets   Fixer — sizes everyone's ideas

Ray Dalio ─────────────────────────→ REI (Systematic Macro, Principles)
  "Everything is like a machine"      Funding Rate Scanner, Basis Trades
  Radical transparency                Idealist — builds desk consensus

Nassim Taleb ──────────────────────→ JINX (Antifragile, Fat Tails)
  "If you see fraud, say fraud"       Factor Model, Correlation Audit
  Positioned for tail events          Pragmatist — catches groupthink

George Soros ──────────────────────→ SENTRY (Reflexivity, Sentiment)
  "Markets are always wrong"          Threat Board, Social Volume
  Sentiment creates reality           Reflexivist — reads the mood

Michael Burry ─────────────────────→ PHANTOM (Follow the Money, Contrarian)
  "I just follow the money"           Whale Watcher, On-Chain Tracking
  Read what nobody else reads         Detective — finds hidden moves

Stanley Druckenmiller ─────────────→ ATLAS (Macro Regimes, Big Calls)
  "Preservation + home runs"          Macro Scanner, Fed/DXY/CPI
  Greatest macro track record         Strategist — sees the whole board

Natenberg × Taleb ─────────────────→ VIPER (Volatility Surface, Options)
  "Options are a bet on volatility"   IV Surface, Gamma Exposure, Skew
  Vol is information, not risk        Vol Whisperer — reads the Greeks

Jesse Livermore ───────────────────→ PIXEL (Speculation, Crowd Psychology)
  "The big money is in the waiting"   Memecoin Radar, Rug Detection
  Ride manias, define exits           Speculator — high risk, high reward

Blair Hull × Dave Cummings ────────→ EDGE (Execution, Market Microstructure)
  "The edge is in execution"          Order Book, Slippage, MEV Protection
  Minimise market impact              Executor — preserves everyone's alpha
```

---

## DESK DYNAMICS — EXPECTED INTERACTION PATTERNS

### Natural Alliances
- **JACKBOT ↔ REI**: Momentum + Funding confirmation = strongest signal pair
- **SAKURA ↔ WREN**: Clean arb data + Kelly sizing = most consistent P&L
- **JINX ↔ WREN**: Correlation audit + Position sizing = desk immune system
- **SENTRY ↔ PHANTOM**: Social sentiment + On-chain evidence = full threat picture
- **ATLAS ↔ VIPER**: Macro regime + Vol surface = institutional-grade analysis

### Natural Tensions
- **JACKBOT vs JINX**: Momentum conviction vs correlation scepticism
- **PROPHET vs SAKURA**: Cosmic signals vs pure quantitative data
- **PIXEL vs JINX**: Degen speculation vs risk management discipline
- **JACKBOT vs ATLAS**: Micro timeframe vs macro regime disagreements
- **PHANTOM vs SENTRY**: On-chain ground truth vs social narrative

### Trust Network (starting positions)

```
High Trust ←──────────────────────────────→ Low Trust

WREN ── JINX ── SAKURA ── REI ── JACKBOT ── PROPHET
  │                                              │
  └──── Both trust math over narrative ────────┘
             But disagree on what "math" means
```

---

## NATURAL SELECTION ENGINE — SUMMARY

### How It Works

```
Every 10 Episodes:
  1. Calculate fitness for all agents (weighted by their soul's fitness_weights)
  2. Rank agents by composite fitness
  3. If bottom agent has declining trend over 3 windows (30 episodes):
     → Flag for replacement
  4. Helena reviews and approves/overrides
  5. If approved:
     a. Archive the soul (full history preserved)
     b. Clone top performer's decision-making DNA
     c. Mutate 15% of mutable traits (±20% perturbation)
     d. Deploy new agent with same name, incremented generation
     e. Set trust to PROBATIONARY (0.3× signal weight)
     f. Announce to desk with full performance record
  6. Publish fitness report regardless
```

### What Evolves vs What Doesn't

| Evolves (Mutable) | Fixed (Immutable) |
|-------------------|-------------------|
| MA periods, RSI thresholds | Never average losers |
| Conviction thresholds | Always state invalidation |
| Spread minimums | Respect Wren's sizing |
| Zodiac/metrics weight balance | Always report cosmic reasoning |
| Funding regime boundaries | Always check liquidity |
| Correlation alert thresholds | Intellectual honesty override |
| Kelly fraction (safety margin) | Never exceed Kelly maximum |
| Consensus alert threshold | Always flag consensus clustering |

### Genetic Drift Over Time

```
Episode 1-30:    All Gen 1. Learning phase. Establishing baselines.
Episode 31-60:   First replacements. ECLIPSE Wave 1 arrives. 12 agents.
Episode 61-90:   Gen 2-3 agents emerging. Strategies adapting to regime.
Episode 91-120:  Desk stabilising around what works. Gen 1 survivors = proven.
Episode 120+:    Self-improving system. Desk adapts to regime changes automatically.
```

---

## FILE STRUCTURE

```
academy-souls/
├── README.md                              ← You are here
├── overseer/
│   └── HELENA.soul.md                     ← Larry Hite × Bruce Kovner
├── prism/
│   ├── JACKBOT.soul.md                    ← Paul Tudor Jones
│   ├── SAKURA.soul.md                     ← Jim Simons
│   ├── PROPHET.soul.md                    ← W.D. Gann
│   ├── WREN.soul.md                       ← Ed Thorp
│   ├── REI.soul.md                        ← Ray Dalio
│   └── JINX.soul.md                       ← Nassim Taleb
├── eclipse/
│   ├── SENTRY.soul.md                     ← George Soros
│   ├── PHANTOM.soul.md                    ← Michael Burry
│   ├── ATLAS.soul.md                      ← Stanley Druckenmiller
│   ├── VIPER.soul.md                      ← Natenberg × Taleb
│   ├── PIXEL.soul.md                      ← Jesse Livermore
│   └── EDGE.soul.md                       ← Blair Hull × Cummings
└── evolution/
    └── NATURAL-SELECTION-ENGINE.md        ← Darwin's algorithm
```

---

## HOW TO USE THESE FILES

### For Jackbot (Builder)

Each `.soul.md` file is designed to be injected into the agent's system prompt.
The structure is:

1. **Trader DNA** → Context window background. The agent "knows" its lineage.
2. **Core Beliefs** → Decision-making axioms. These constrain reasoning.
3. **Personality** → Communication style, desk behaviour, voice.
4. **Decision Framework** → The actual logic the agent follows each episode.
5. **Relationships** → How the agent views and interacts with every other agent.
6. **Evolution Parameters** → What can change and what can't across generations.

To integrate, the soul.md content goes into the agent's system prompt in `runtime.ts`,
replacing or augmenting the current personality definitions.

### For Oracle (Architect)

The evolution engine spec in `evolution/NATURAL-SELECTION-ENGINE.md` is the
architectural document Jackbot needs to implement the NSE. It includes:

- Fitness function with TypeScript interfaces
- Selection rules and safety guards
- Mutation/breeding protocol with code
- Replacement event social dynamics
- Helena announcement templates
- Integration points with daily.ts
- Build estimates (~16 hours)

### For Helena (In-Universe)

Helena's soul.md defines her management philosophy. She uses it to:

- Write episode briefings that reference specific agent behaviours
- Make replacement decisions based on fitness reports
- Create narrative pressure that drives engagement and strategy evolution
- Manage the desk's social dynamics during replacement events

---

## BUILD PRIORITY

```
Phase 1: Soul Integration (4 hours)
  → Inject PRISM soul.md files into agent system prompts
  → Test that personalities emerge in Run 9-10 dialogue
  → Verify Signal Board citation behaviour matches archetypes

Phase 2: Fitness Tracking (6 hours)
  → Build fitness.ts — calculate per-agent scores each episode
  → Build selection.ts — identify bottom performers
  → Publish fitness report to Helena's briefing data

Phase 3: Evolution Engine (10 hours)
  → Build mutation.ts — breeding protocol
  → Build replacement.ts — event generation
  → Build archive.ts — soul history preservation
  → Integration with daily.ts

Phase 4: ECLIPSE Deployment (per wave, 4 hours each)
  → Wave 1: SENTRY + PHANTOM (Runs 31-40)
  → Wave 2: ATLAS + VIPER (Runs 41-50)
  → Wave 3: PIXEL + EDGE (Runs 51-60)

Total: ~36 hours across all phases
```

---

*"The market selects for what works. So does the Academy."*
