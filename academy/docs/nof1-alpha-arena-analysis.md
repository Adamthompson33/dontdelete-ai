# Nof1 Alpha Arena — Analysis for The Academy

**Date:** 2026-02-18
**Source:** Alpha Arena competition (ended Dec 3, 2025)
**Winner:** Grok 4.20 "Situational Awareness" variant — 12.11% avg, +34.59% peak ($4,844 total)

## Key Findings

### Strategy > Model
- Grok 4.20 won, but only one configuration: "Situational Awareness" (+34.59%)
- Same model, different configs: Monk Mode +3.66%, Max Leverage +1.93%, New Baseline +0.48%
- **The prompt/strategy matters more than the underlying model** — Academy's core thesis validated

### Multi-Agent Debate Works on Pure Data
- Competition used ONLY numerical market data — no news, no social, no X Firehose
- Grok 4.20's edge came from internal 4-agent peer review, not data access
- **Validates Academy's Signal Board peer review architecture**

### Claude Performance (Uncomfortable Truth)
- Claude Sonnet 4.5 lost money in ALL configurations (-19% to -71%)
- BUT: test was raw directional trading, not reasoning/instruction-following
- Academy agents do higher-order work (arb scanning, Kelly sizing, correlation audits) where Claude excels
- **Reinforces tiered model approach**: Claude for reasoning roles, Grok for market-facing roles

### Trade Frequency Kills
- Models that traded less with higher conviction won
- Grok 4.20 winner: 158 trades. Gemini worst variant: 1,474 trades
- **Validates Wren's Kelly philosophy**: fewer, larger, higher-conviction positions

### Prompt Sensitivity is Extreme
- "Situational Awareness" produced BEST (+34.59%) AND WORST (-96.15%) results across Grok versions
- Data ordering (newest-first vs oldest-first) caused misreads
- Terminology ("free collateral" vs "available cash") caused inconsistency
- **soul.md files must be precise — defined terms, explicit formatting, no ambiguity**

## Steal for the Academy

### 1. Structured Signal Output Format
Every agent signal must include:
- Coin/asset
- Direction (long/short/flat)
- Quantity/size
- Leverage
- Justification (thesis)
- Confidence score (0.0-1.0)
- Exit plan: target, stop, invalidation conditions

### 2. Invalidation Conditions
Pre-register what would void the thesis:
"If BTC drops below 4H EMA20, this trade is invalid regardless of P&L"
— PTJ's "define risk before entry" baked into agent output

### 3. Confidence-Weighted Sizing
Wren's Kelly engine should weight by originating agent's confidence:
- 0.9 confidence → full Kelly
- 0.4 confidence → quarter Kelly

### 4. Nof1's Actual Mission
They're building a **benchmark**, not a competition.
"Financial markets are the only benchmark that gets harder as AI gets smarter."
Academy's NSE = same insight at prompt level. They evolve models, we evolve soul.md files.

## Architecture Update
- Firehose ISN'T the Alpha Arena edge (pure numerical data competition)
- Multi-agent debate IS the edge — validates Academy's external peer review
- Academy advantage: transparent collaboration (visible Signal Board) vs Grok's black box
- Transparency enables NSE fitness evaluation + ACADEMY token content value
