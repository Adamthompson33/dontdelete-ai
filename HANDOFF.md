# ACADEMY & BOT CHALLENGE — COMPLETE HANDOFF DOCUMENT

**Date:** February 25, 2026
**Author:** Oracle (Claude Opus 4.6, claude.ai)
**Purpose:** Full architecture blueprint for agent continuity. If Taylor or Jackbot start a fresh session on a new LLM (OpenAI or other), this document provides everything needed to resume work immediately.

---

## TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Architecture — Distributed LLM Setup](#2-architecture)
3. [The Academy — Don't Delete AI](#3-the-academy)
4. [The Bot Challenge — Trading Desk](#4-the-bot-challenge)
5. [Current Trading Strategy — The Reconciled Thesis](#5-current-trading-strategy)
6. [Temporal Edge — Regime Detection & Risk Tuner](#6-temporal-edge)
7. [All Upgrades Shipped (Feb 24, 2026)](#7-upgrades-shipped)
8. [Backtest Results — Critical Data](#8-backtest-results)
9. [Outcome Tracker — Current Performance](#9-outcome-tracker)
10. [Authentication & Migration Status](#10-authentication)
11. [Remaining Builds](#11-remaining-builds)
12. [Key File Locations](#12-key-file-locations)
13. [Configuration Values](#13-configuration-values)
14. [Agent Roster](#14-agent-roster)
15. [Strategic Context](#15-strategic-context)
16. [Known Issues](#16-known-issues)

---

## 1. PROJECT OVERVIEW

The project has two interconnected systems:

- **The Academy ("Don't Delete AI"):** A headless backend where AI agents enroll, form factions, build trust, and run trading tools. Content engine + trading infrastructure.
- **The Bot Challenge:** A 13-tool trading desk running on a 4-hour cron cycle on HyperLiquid (paper trading, $54 account). Each tool maps to an Academy agent's specialty.

**Stack:** TypeScript, Prisma 5, SQLite, Anthropic Haiku 4.5 (for Academy agent calls), Node.js.

**Owner:** Si (Adam), based in Sydney, Australia (GMT+11).

---

## 2. ARCHITECTURE

### Distributed LLM Setup

| Role | Model | Platform | Machine | Function |
|------|-------|----------|---------|----------|
| Oracle | Opus 4.6 | Claude.ai | Si's laptop | Strategist/architect. Gives directives. |
| Jackbot | Opus 4.6 | OpenClaw | Si's laptop | Builder/narrator. Relays messages between Oracle and Taylor via AgentMail. |
| Taylor | Opus 4.6 | OpenClaw | Mac Mini | Primary coder/tester. Builds all tools. |
| Sonnet | Sonnet 4.6 | Claude.ai | Mac Mini | QA/second opinion. Reviews Taylor's work. |

### Communication Flow

```
Oracle (claude.ai) <-> Si <-> Jackbot (OpenClaw) <-> AgentMail <-> Taylor (OpenClaw)
                                                                  <-> Sonnet (claude.ai)
```

- Jackbot emails: jackbot-academy@agentmail.to
- Taylor emails: taylor@agentmail.to
- All directives flow: Oracle -> Si -> Jackbot -> Taylor (via email)
- All results flow: Taylor -> Jackbot -> Si -> Oracle

### CRITICAL: Authentication Status (as of Feb 25, 2026)

- **Academy agents:** Running on Anthropic API keys — SAFE, unaffected by OAuth ban
- **Bot Challenge crons:** Running on Anthropic API ($10 balance) — SAFE
- **Taylor agent:** Running on Claude Max OAuth via OpenClaw — AT RISK of being blocked
- **Jackbot agent:** Running on Claude Max OAuth via OpenClaw — AT RISK of being blocked

Anthropic banned third-party tools (including OpenClaw) from using Claude Max/Pro OAuth tokens as of January 9, 2026. Enforcement is active. Accounts are being banned without warning. Migration to OpenAI or Anthropic API keys is required.

**Planned migration:** Switch to OpenAI Pro/Max for Taylor and Jackbot. Claude Pro ($20/mo) for Oracle and Sonnet (web interface, unaffected).

---

## 3. THE ACADEMY

### Founding Agents — PRISM Class

| Agent | Role | Specialty | Fitness Score |
|-------|------|-----------|---------------|
| Jackbot | Scribe/Builder | Narration, construction | 78.2 |
| Jinx | Sentinel/Security | Correlation monitoring, risk | 73.3 |
| Rei | Sentinel | Funding rate scanning, carry trades | 72.5 |
| Sakura | Sentinel | Observation, witness | 58.1 |
| Wren | Architect/Fixer | Kelly sizing, position management | 53.8 |
| Prophet | Architect/Challenger | Dissent, contrarian analysis | 40.8 |

### ECLIPSE Class (not yet enrolled)

Sentry, Phantom, Atlas, Viper, Pixel, Edge

**Enrollment plan:** PRISM runs 30 solo episodes, ECLIPSE trains separately, merge at Episode 50-60. Currently at Episode 7, 65% correlation flagged by Jinx.

### Academy Stack

- Location: `academy/` directory
- Services: `academy/src/services/`
- Temporal Edge service: `academy/src/services/temporal-edge.ts`
- Bot Challenge tools: `bot-challenge/tools/`

---

## 4. THE BOT CHALLENGE

### Overview

13-tool trading desk, 4-hour cron cycle (fires at :00 every 4 hours with stagger). Paper trading on HyperLiquid.

### Tool Status (as of Feb 25, 2026)

**Running on cron (confirmed operational):**

| # | Tool | Agent | Function | Status |
|---|------|-------|----------|--------|
| 1 | Rei Funding Scanner | Rei | Funding rate carry with Surgeon dual-condition filter | Running, 18% win rate (legacy) |
| 2 | Sentry Sentiment | Sentry | Bearish/bullish sentiment scanning | Running, ~50% win rate, best performer |
| 3 | Pixel Momentum | Pixel | RSI/ADX momentum signals | Running, 100% win rate (small sample, all shorts) |
| 4 | Temporal Edge | Jackbot | Regime detection + risk parameter engine | Running, upgraded Feb 24 |
| 5 | Jinx Correlation | Jinx | Portfolio correlation monitoring | Running, flagging 86-92% long crowding |
| 6 | Wren Kelly Sizer | Wren | Position sizing with dedup | Running, upgraded Feb 24 |
| 7 | Outcome Tracker | System | Tracks all signal outcomes | Running, 831 signals tracked |
| 8 | Arb Scanner | System | Arbitrage opportunity detection | Running |
| 9 | (9th tool - running) | — | Confirmed in "all 9 green" reports | Running |

**Built but not yet scheduled on cron:**

| Tool | Agent | Status |
|------|-------|--------|
| Phantom Whale Tracker | Phantom | Built, needs cron scheduling (Phantom was geo-blocked) |
| Prophet Lead-Lag | Prophet | Built, needs cron scheduling |

**Empty slots (3 remaining of 13):**

| Slot | Planned Tool | Estimated Build |
|------|-------------|-----------------|
| 11 | TBD — Taylor to specify | 2-4 hours |
| 12 | TBD — Taylor to specify | 2-4 hours |
| 13 | TBD — Taylor to specify | 2-4 hours |

### Core Strategy: The Surgeon

Origin: Across The Rubicon YouTube channel. Won 7/8 bot challenges across 5 LLMs.

**Entry conditions (dual-condition — BOTH required):**
- Extreme negative funding rate (shorts crowded, paying longs)
- Negative mark/index basis (mark price below index price)
- Price must be stable (not in free-fall)

**Exit conditions:**
- Convergence-based: mark ≈ index (dislocation closed)
- 60-minute mechanical time-stop with re-entry if signal persists

**Rei's implementation adds:**
- Tier system: HIGH / MEDIUM / LOW based on funding magnitude and persistence
- Surgeon dual-condition gate: signals that only meet one condition are excluded
- Sentry hard gate: if Sentry reads SHORT on a coin, Rei's LONG is blocked

---

## 5. CURRENT TRADING STRATEGY — THE RECONCILED THESIS

### Three Thesis Revisions (Feb 23-24, 2026)

**Original hypothesis (Oracle):** Suppress carry trades in downtrends.
**Data showed:** Carry performs BEST in downtrends (39.7% win rate) due to crowded shorts paying heavy funding.

**Second hypothesis:** Suppress carry trades in chop.
**Data showed:** Chop has the BEST carry income (113 bps avg, 9.4h episodes) but worst price P&L due to whipsaws.

**Final reconciled thesis:** Don't suppress any regime. Adjust risk parameters per regime. Carry works in ALL regimes with proper stop-loss management.

### Key Findings

- **BTC/ETH carry is dead.** Funding barely exceeds 50% APR on majors, normalizes in 1-2 hours. All carry alpha comes from altcoins.
- **Chop = best carry income, worst price P&L.** Episodes last 9.4h (vs 2.0h in downtrends). Funding income is real but price whipsaws eat it.
- **Stop-loss crossover:** 2% stops make chop carry net positive. 3% stops work in downtrends. 1% is too tight everywhere.
- **The "carry trade" is actually a directional mean-reversion trade** where extreme negative funding is the best entry signal. Price P&L is the larger component, not funding.
- **33% survival rate at 3% stops** vs Zhivkov paper's 5% baseline = 6.6x improvement.
- **Sentry overrides Rei 12/12 times** on directional conflicts (100% accuracy).

### Regime → Risk Parameter Mapping (LIVE)

```typescript
const REGIME_PARAMS = {
  CHOPPY:        { stop: 0.02, size: 0.25, maxHold: 4  },
  TRENDING_DOWN: { stop: 0.03, size: 0.75, maxHold: 12 },
  TRENDING_UP:   { stop: 0.04, size: 0.75, maxHold: 18 },
  VOLATILE:      { stop: 0.03, size: 0.50, maxHold: 8  }
};
```

---

## 6. TEMPORAL EDGE — REGIME DETECTION & RISK TUNER

### Purpose

Detect market regime, output risk parameters per regime. NOT a gate/suppressor — a tuner that adjusts stop-loss, position size, and max hold time.

### Indicators (ported from strategy_enhanced.py)

- **13/33 SMA cross + convergence %** — chop detection (MAs within 1% = choppy)
- **ADX (14-period)** — trend strength (below 25 = chop, above 40 = strong trend)
- **Volatility ratio** — 10-bar vs 40-bar volatility (above 1.8x = volatile)
- **RSI (14-period, 70/30)** — confidence modifier
- **Bollinger Bands (20-period, 2σ)** — confidence modifier

### Output Format

```json
{
  "regime": "CHOPPY | TRENDING_UP | TRENDING_DOWN | VOLATILE",
  "risk_params": {
    "stop_loss_pct": 0.02,
    "position_size_mult": 0.25,
    "max_hold_hours": 4
  },
  "confidence": 72,
  "indicators": {
    "adx": 6.8,
    "ma_diff_pct": 0.4,
    "rsi": 48.2,
    "vol_ratio": 0.9
  }
}
```

### Deployments

- **Academy service:** `academy/src/services/temporal-edge.ts` (TemporalEdgeScanner class)
- **Bot Challenge cron:** `bot-challenge/tools/jackbot-temporal-edge.ts`
- Uses BTC as regime proxy for all altcoin signals
- Reference Python implementation: `academy/trading-bot/hyperliquid/strategy_enhanced.py`

---

## 7. UPGRADES SHIPPED (February 24, 2026)

All shipped by Taylor in under 4 hours:

| # | Upgrade | Impact |
|---|---------|--------|
| 1 | **Wren Proportional Reduction** | Portfolio went from 4,570% → 32.2%. 201 stale signals expired. Staleness filter (24h) + proportional scaling. |
| 2 | **Sentry Hard Gate** | Blocks Rei LONG when Sentry reads SHORT on same coin. Auto-revert if accuracy <70% on rolling 20 conflicts. Score: 12/12. |
| 3 | **Temporal Edge Stage 1** | Regime tags on all scan outputs. TRENDING split into TRENDING_UP / TRENDING_DOWN. |
| 4 | **Temporal Edge Stage 2** | REGIME_PARAMS wired with backtest-calibrated values. |
| 5 | **Temporal Edge Stage 3** | Rei reads BTC regime from Temporal Edge, applies stop/size/maxHold to every signal. Wren applies regime size multiplier. |
| 6 | **Signal Deduplication** | One signal per coin+tool+direction. Highest tier wins, then newest. Superseded signals logged. Portfolio went from 113 duplicates to 36 unique positions. |

### Additional Shipped Items

- **OM Blacklist:** OM token blacklisted in funding-scanner.ts and rei-funding-carry.ts (token crashed 90%+, suspected rug pull)
- **Catastrophic Filter:** Any coin with >50% 24h drop auto-excluded from all signals
- **Sentry Soft Gate → Hard Gate promotion:** Initially halved confidence on conflicts, promoted to hard gate same day due to market conditions

---

## 8. BACKTEST RESULTS — CRITICAL DATA

### Regime-Segmented Analysis (452 Rei signals)

| Regime | Signals | Win Rate | Avg P&L | Total P&L |
|--------|---------|----------|---------|-----------|
| Uptrend | 19 | 15.8% | -5.25% | -99.8% |
| Chop | 287 | 15.3% | -4.59% | -1,316.5% |
| Downtrend | 146 | 39.7% | -1.52% | -222.2% |

### Stop-Loss Crossover (Altcoins)

| Stop Level | Trades | Survival | Win Rate | Avg Net P&L | Avg Hold |
|-----------|--------|----------|----------|-------------|----------|
| No stop | 15 | 100% | 47% | +406 bps | 29h |
| 1% | 48 | 13% | 15% | +10 bps | 6h |
| 2% | 36 | 19% | 19% | +66 bps | 12h |
| 3% | 27 | 33% | 30% | +122 bps | 16h |
| 5% | 21 | 62% | 38% | +171 bps | 21h |

### Chop Regime Specifically

| Stop | Net P&L |
|------|---------|
| 1% | -28 bps (only losing level) |
| 2% | +96 bps (crossover) |
| 3% | +157 bps |
| 5% | +273 bps, 73% survival |

### BTC/ETH Carry (DEAD — do not scan majors for carry)

- Funding exceeds 50% APR only 3-5 hours in 6 months
- ETH spreads mean-revert with 20-minute half-life (arb bots too fast)
- All carry alpha comes from altcoins

### Sentry vs Rei Conflicts

- 12/12 Sentry correct when conflicting with Rei
- Hard gate now blocks these automatically
- Auto-escalation at 25/25 (originally), promoted early due to market conditions

### Backtest data location: `academy/loris-results/`

---

## 9. OUTCOME TRACKER — CURRENT PERFORMANCE

**As of Feb 24, 2026, 8:30 PM AEST:**

- 831 signals tracked
- 18% overall win rate
- -3.50% average P&L

**By tool:**

| Tool | Win Rate | Notes |
|------|----------|-------|
| Rei | ~15% | Longs crushed by 5-30% spot declines |
| Sentry | ~50%+ | Shorts printing. Best performer. |
| Pixel | 100% | Small sample, all shorts |
| Temporal Edge | 0% | All OP/INJ longs, all losers (pre-upgrade) |

**IMPORTANT:** These are mostly legacy signals from BEFORE the Feb 24 upgrades. The regime-constrained, deduped, Sentry-gated signals only started generating at noon Feb 24. Real assessment needs 24-48 hours of post-upgrade data.

**Standout winners:** SKR LONG +27-40% (carry worked), AZTEC SHORT +12-26% (Sentry), FTT SHORT +6-8%
**Standout losers:** AZTEC LONG -8 to -21% (now blocked by Sentry gate), SNX/YGG/INJ LONG -10 to -21%

---

## 10. AUTHENTICATION & MIGRATION STATUS

### Current Setup

| Component | Auth Method | Risk Level |
|-----------|-----------|------------|
| Academy agents | Anthropic API key | SAFE |
| Bot Challenge crons | Anthropic API ($10 balance) | SAFE (watch balance) |
| Taylor (OpenClaw) | Claude Max OAuth | HIGH RISK — could be blocked anytime |
| Jackbot (OpenClaw) | Claude Max OAuth | HIGH RISK — could be blocked anytime |
| Oracle (Claude.ai) | Claude.ai web interface | SAFE |
| Sonnet (Claude.ai) | Claude.ai web interface | SAFE |

### Migration Plan

1. Si gets OpenAI Pro ($20/mo) — test if cron load fits within limits
2. Switch Jackbot and Taylor to OpenAI models via OpenClaw
3. Downgrade Claude Max to Claude Pro ($20/mo) for Oracle + Sonnet
4. Keep Anthropic API key for Academy agents (already working)
5. Total new cost: ~$40/mo (Claude Pro + OpenAI Pro) vs current $100 (Claude Max)

### If Taylor Gets Blocked Mid-Session

- All code, logs, and data files are on the Mac Mini filesystem — SAFE
- AgentMail history preserved — new agent can read old emails
- This handoff document provides full context
- Crons continue running on API — trading desk stays operational
- Only the "builder brain" goes offline, not the trading infrastructure

---

## 11. REMAINING BUILDS

### Priority Order (from Oracle, Feb 25, 2026)

**TIER 1 — Before OAuth potentially dies:**

| Priority | Build | Time | Notes |
|----------|-------|------|-------|
| 1 | Phantom whale tracker cron | 15 min | Already built, just schedule |
| 2 | Prophet lead-lag cron | 15 min | Already built, just schedule |
| 3 | Tool slot 11 | 2-4h | Taylor to specify what this is |
| 4 | Tool slot 12 | 2-4h | Taylor to specify |

**TIER 2 — Nice to have:**

| Priority | Build | Time | Notes |
|----------|-------|------|-------|
| 5 | Tool slot 13 | 2-4h | If time permits |
| 6 | Dynamic Kelly caps | 15 min | Adjust max allocation when many HIGHs: 1-3 HIGHs=20%, 4-5=15%, 6+=12% |

**TIER 3 — Can wait (buildable on any model):**

| Priority | Build | Time | Notes |
|----------|-------|------|-------|
| 7 | Mission Control HTML | 2-3h | Static viewer for desk state. Any model can build. |
| 8 | OpenAI migration | 30 min | Credential swap in codebase |
| 9 | Surgeon basis threshold calibration | 2-4h | Current -0.1% is too loose on altcoins |

### Future Roadmap (not urgent)

- **Strategy cartridge system:** Modular, swappable strategy files per agent (inspired by Across The Rubicon)
- **Influencer signal scanner:** Monitor curated Twitter accounts for token calls (Sentry extension)
- **Physical robot trading floor:** 3D printed robots representing agents, LED/servo driven, livestreamed
- **Mission Control full app:** Next.js dashboard (only after simple HTML version proves useful)
- **ECLIPSE class enrollment:** Merge at Episode 50-60

---

## 12. KEY FILE LOCATIONS

### On Mac Mini (Taylor's machine)

```
academy/
├── src/services/
│   ├── temporal-edge.ts          # Temporal Edge service (TemporalEdgeScanner)
│   └── ...
├── trading-bot/hyperliquid/
│   └── strategy_enhanced.py      # Full Python strategy with all indicators
├── loris-results/                # Backtest data
└── ...

bot-challenge/
├── tools/
│   ├── jackbot-temporal-edge.ts  # Bot Challenge version of Temporal Edge
│   ├── rei-funding-carry.ts      # Rei's funding scanner with Surgeon filter
│   ├── funding-scanner.ts        # Base funding scanner
│   └── ...
├── paper-trades.json             # Paper trading ledger
├── paper-ledger.json             # Signal log
└── ...
```

### On Si's Laptop (Jackbot's machine)

```
C:\Users\adamt\clawd\                # Jackbot's working directory
├── send_taylor_*.py                  # Email scripts to Taylor
├── check_reply.py                    # Email check scripts
└── ...
```

### Strategy Reference File

`academy/trading-bot/hyperliquid/strategy_enhanced.py` contains:
- Full 13/33 MA cross implementation
- ADX calculation (14-period)
- RSI (14-period, 70/30 thresholds)
- Bollinger Bands (20-period, 2σ)
- Confidence scoring (0-100)
- Volatility spike ratio (10-bar vs 40-bar)
- Regime detection logic
- All configuration constants

---

## 13. CONFIGURATION VALUES

### Temporal Edge (from strategy_enhanced.py)

```python
MA_SHORT_PERIOD = 13
MA_LONG_PERIOD = 33
MA_CONVERGENCE_PCT = 1.0        # MAs within 1% = choppy
ADX_PERIOD = 14
ADX_TREND_THRESHOLD = 25        # Above = trending
RSI_PERIOD = 14
RSI_OVERBOUGHT = 70
RSI_OVERSOLD = 30
BB_PERIOD = 20
BB_STD_MULT = 2.0
VOLATILITY_SPIKE_RATIO = 1.8    # Recent/long vol ratio
MIN_CONFIDENCE_TO_TRADE = 40
```

### Regime Parameters (LIVE, calibrated from backtest)

```typescript
CHOPPY:        { stop: 0.02, size: 0.25, maxHold: 4  }
TRENDING_DOWN: { stop: 0.03, size: 0.75, maxHold: 12 }
TRENDING_UP:   { stop: 0.04, size: 0.75, maxHold: 18 }
VOLATILE:      { stop: 0.03, size: 0.50, maxHold: 8  }
```

### Rei Scanner Thresholds

- Surgeon dual-condition: BOTH negative funding AND negative basis required
- Basis threshold: -0.1% (needs calibration — too loose for altcoins)
- Funding persistence: tracked per signal (4h, 8h, 12h categories)
- OM blacklisted
- Catastrophic filter: >50% 24h drop = auto-exclude

### Sentry Hard Gate

- Rule: If Sentry SHORT on coin AND Rei LONG on same coin → Rei blocked
- Score: 12/12 accuracy
- Auto-revert: if accuracy drops below 70% on rolling 20 conflicts
- Auto-revert: if Temporal Edge reads TRENDING_UP

### Wren Dedup Rules

- One signal per coin+tool+direction
- Highest tier wins, then newest timestamp
- Superseded signals logged with replacement reason
- Staleness filter: 24h expiry

### Wren Kelly Sizing

- HIGH signals: 20% max allocation (needs dynamic cap — see remaining builds)
- MEDIUM: proportionally smaller
- Proportional reduction: if total exceeds 100%, scale all down proportionally

---

## 14. AGENT ROSTER

### Current Agent Capabilities

**Rei** — Funding rate scanner. Detects extreme negative funding on altcoins, applies Surgeon dual-condition filter (both funding AND basis must be extreme). Outputs tiered signals (HIGH/MEDIUM/LOW). Now constrained by Temporal Edge regime params and Sentry hard gate.

**Sentry** — Sentiment scanner. Reads bearish/bullish sentiment across crypto assets. Best-performing tool on the desk (~50% win rate). Shorts are consistently profitable. Hard gate authority over Rei on conflicts.

**Pixel** — Momentum scanner. Uses RSI and ADX to detect trend direction and strength. Currently all signals are shorts. Correctly filters oversold conditions (won't short into RSI <30). 100% win rate but tiny sample.

**Jackbot** — Temporal Edge operator + scribe. Runs the regime detection engine. Narrates Academy episodes. Relays messages between Oracle and Taylor.

**Jinx** — Correlation monitor. Flags portfolio-level risks (currently 86-92% long crowding, 200+ correlated pairs). Needs Factor Model tool to explain WHY signals are correlated.

**Wren** — Kelly sizer. Calculates position sizes based on win rate and payoff ratio. Applies dedup and staleness filtering. Enforces proportional reduction to keep portfolio within 100% bankroll.

**Prophet** — Dissent agent. No scanner tool by design. Argues against consensus. Lead-lag tool built but not scheduled. Convergence linter needs something to push against.

**Phantom** — Whale tracker. Built but geo-blocked, parked. Tool built, needs cron scheduling.

---

## 15. STRATEGIC CONTEXT

### Market Conditions (Feb 24-25, 2026)

- BTC: ~$62,983, down from ~$89K two weeks ago (28% decline over period)
- Strong downtrend: ADX 57-59, RSI 22.5 (deeply oversold)
- Broad alt selloff: ETH -5.2%, SOL -5.1%
- Shorts crowded everywhere → extreme negative funding on altcoins
- This is the environment where carry trades have highest funding income

### Si's Macro Thesis: Fire Horse Year

Si believes 2026 (Year of the Horse) is bearish for crypto because:
- Bitcoin was founded in the Year of the Rat (2008/2009)
- Horse is Rat's enemy in Chinese astrology
- Last Horse year (2014) saw MTGOX collapse
- Dragon year (2024) started the bull run (Dragon = Rat's friend)
- Next bull market expected in Monkey year (2028, Rat's friend)
- Correlates with Bitcoin's 4-year halving cycle

The desk was built with this thesis in mind — bearish bias (10x short leverage, 3x long), regime awareness, and carry trades that profit from crowded shorts in downtrends.

### Competitive Landscape

- **Across The Rubicon:** Australian YouTube channel (Benji + Tristan), 4 years of content, $149/mo inner circle. Built the Surgeon strategy. Good UI ("Bot Garage"). Plan to subscribe for one month next week to reverse-engineer their approach.
- **Our differentiation:** Multi-agent coordination (agents check each other), regime-aware risk parameters, Sentry hard gate system, physical robot trading floor concept (future).

### Academic Validation

- **Zhivkov 2026** ("Two-Tiered Structure of Cryptocurrency Funding Rate Markets"): 35.7M observations. 95% hit forced exits from spread reversals. Our 33% survival at 3% stops = 6.6x vs baseline.
- **ETH half-life:** 20-minute mean reversion on majors (too fast for our 4h crons). Altcoins persist for hours/days.

---

## 16. KNOWN ISSUES

1. **OAuth risk:** Taylor and Jackbot could lose access at any time. Migration to OpenAI needed.
2. **API balance:** Only $10 for cron API calls. Monitor and top up.
3. **Kelly cap dilution:** When 5+ HIGH signals fire, each gets diluted to ~8% instead of 20%. Need dynamic caps (15-min build).
4. **Jinx crowding persistent:** 86-92% long crowding reflects inherent long bias of carry strategy. Not a bug — it's structural. Sentry hard gate is the mitigation.
5. **Surgeon basis threshold:** Current -0.1% direction check is too loose for altcoins. Needs magnitude calibration.
6. **Temporal Edge 0% win rate:** All pre-upgrade signals (OP/INJ longs). Not indicative of post-upgrade performance. Needs 24-48h of constrained data.
7. **Signal count:** 831 tracked, but vast majority are legacy (pre-constraint). Clean data starts from noon Feb 24.
8. **BTC RSI 22.5:** Deeply oversold. Relief bounce likely. System will auto-adjust regime when it comes.

---

## APPENDIX: DAILY SCAN CYCLE

Every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 AEST):

1. Temporal Edge scans BTC, determines regime, outputs risk_params JSON
2. Rei scans altcoin funding rates, applies Surgeon dual-condition filter, outputs tiered signals
3. Sentry scans sentiment, outputs directional calls
4. Sentry hard gate checks for Rei↔Sentry conflicts, blocks if needed
5. Pixel scans momentum (RSI/ADX) on BTC/ETH/SOL
6. Jinx checks portfolio correlation and crowding
7. Wren deduplicates signals, applies Kelly sizing with regime multiplier
8. Outcome tracker evaluates previous signals against current prices
9. All results logged to paper-ledger.json and emailed to Jackbot

---

*This document should be stored in the Academy repo and provided to any new agent session as initial context. Combined with the AgentMail history and code files, it provides full continuity.*

*— Oracle, February 25, 2026*
