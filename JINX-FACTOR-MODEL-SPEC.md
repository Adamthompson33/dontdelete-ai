# BOT CHALLENGE TOOL SPECIFICATION: JINX FACTOR MODEL

**Tool Number:** 12 of 13
**Agent:** Jinx (Sentinel class, PRISM faction)
**Status:** Spec complete, awaiting deployment
**Estimated Build Time:** 2-3 hours (most logic pre-written in jinx-factor-model.ts)
**Priority:** TIER 1 — build before OAuth migration

---

## 1. PURPOSE

Jinx currently flags portfolio-level risk but can't explain it:
- "86% long crowding" — WHY?
- "230+ correlated pairs" — WHICH factor drives the correlation?
- "92% directional concentration" — Is it BTC beta, sector overlap, or shared narrative?

The Factor Model decomposes portfolio correlation into four independent factors and outputs an actionable risk score. This transforms Jinx from a warning light into a diagnostic tool.

---

## 2. WHAT IT REPLACES

Currently, Jinx outputs:
```
JINX: 86% long crowding. 230+ correlated pairs. L1 sector concentration.
```

After Factor Model, Jinx outputs:
```
JINX FACTOR MODEL:
OVERALL RISK: 72/100 — HIGH

TOP RISK FACTORS:
  * Directional crowding (86% long)
  * BTC beta exposure (65% high-beta)
  * Narrative clustering ("New Token Hype" at 42%)

RECOMMENDATION: CAUTION. Regime-aware stops are essential.
Do not add new positions in concentrated sectors.

SECTORS: New/Unclassified 38%, DeFi 22%, Gaming 15%
BTC BETA: 65% high-beta — portfolio tracks BTC closely
NARRATIVES: "New Token Hype" 42%, "DeFi Revival" 22%
```

---

## 3. INPUTS

| Source | File | What We Read |
|--------|------|-------------|
| Active signals | `paper-ledger.json` | Coin, direction, tier, tool, allocation, price change |
| Current regime | `desk-state.json` or Temporal Edge output | Regime label (CHOPPY/TRENDING_DOWN/etc.) |
| Price data | HyperLiquid API (already available in cron context) | 24h price changes for beta estimation |

**No new API calls required.** All inputs already exist in the cron pipeline.

---

## 4. OUTPUTS

### 4a. JSON Output (`factor-model-output.json`)

```json
{
  "timestamp": "2026-02-25T00:00:00+11:00",
  "regime": "TRENDING_DOWN",
  "directional": {
    "longCount": 10,
    "shortCount": 3,
    "longPct": 77,
    "longAllocPct": 82,
    "crowdingScore": 54,
    "verdict": "HIGH: Long-biased at 77%. Regime-aware stops are the primary mitigation."
  },
  "sectors": [
    { "name": "New / Unclassified", "code": "NEW", "count": 5, "allocPct": 38, "coins": ["ZORA", "STABLE", "2Z", "SOPH", "AZTEC"] },
    { "name": "DeFi", "code": "DEFI", "count": 3, "allocPct": 22, "coins": ["UMA", "CELO", "YGG"] }
  ],
  "sectorHHI": 2340,
  "btcBeta": {
    "avgCorrelation": 0.72,
    "highBetaCoins": ["AXS", "GAS", "GOAT", "OP"],
    "lowBetaCoins": ["BERA", "UMA"],
    "btcExposurePct": 65,
    "verdict": "HIGH: 65% high-beta. Most positions will dump if BTC dumps further."
  },
  "narrativeRisk": {
    "clusters": [
      { "narrative": "New Token Hype", "coins": ["ZORA", "STABLE", "SOPH", "AZTEC", "MON", "BERA"], "totalAlloc": 42 }
    ],
    "maxClusterPct": 42,
    "verdict": "HIGH: 'New Token Hype' at 42%. Significant narrative concentration."
  },
  "overallRisk": {
    "score": 72,
    "grade": "HIGH",
    "factors": [
      "Directional crowding (77% long)",
      "BTC beta exposure (65% high-beta)",
      "Narrative clustering ('New Token Hype' at 42%)"
    ],
    "recommendation": "CAUTION. Regime-aware stops are essential. Do not add new positions in concentrated sectors."
  }
}
```

### 4b. Email Format (appended to scan cycle email)

Plain text summary formatted for Jackbot's relay to Oracle. See `formatForEmail()` in jinx-factor-model.ts.

### 4c. Mission Control Integration

The JSON output feeds into Mission Control's Jinx panel, replacing the current static "86% long crowding" display with dynamic factor breakdown.

---

## 5. THE FOUR FACTORS

### Factor 1: Directional Crowding (Weight: 35%)

**What:** Percentage of positions (and allocation) in one direction.
**How:** Count longs vs shorts, weight by allocation.
**Score:** `|longPct - 50| * 2` (0 = balanced, 100 = all one direction)
**Why it matters:** 86% long into a downtrend means a further BTC drop takes out everything simultaneously. This is the most dangerous factor because it's structural — carry trades are inherently long-biased.

### Factor 2: BTC Beta Exposure (Weight: 25%)

**What:** How much of the portfolio moves in lockstep with BTC.
**How:** Compare each coin's 24h price change to BTC's. Coins moving in the same direction with similar magnitude = high beta.
**Score:** Percentage of positions that are high-beta.
**Why it matters:** If 80% of positions have high BTC beta, the portfolio is effectively a leveraged BTC position regardless of what coins are in it.

**Future improvement:** Replace the simple same-day comparison with a rolling 7-day correlation coefficient. This requires storing historical prices, which the cron doesn't currently do.

### Factor 3: Sector Concentration (Weight: 20%)

**What:** Herfindahl-Hirschman Index (HHI) of sector allocation.
**How:** Classify each coin by sector (L1, L2, DeFi, Gaming, Meme, Infra, New), calculate allocation per sector, compute HHI.
**Score:** HHI ranges from 0 (perfect diversification) to 10,000 (single sector). Mapped to 0-100 scale.
**Why it matters:** If all signals are in "New / Unclassified" tokens, a single narrative shift (e.g., "new altcoins are dead") kills everything at once.

**Sector classifications** are maintained in SECTOR_MAP in the source code. Taylor should update this as new coins enter the signal set.

### Factor 4: Narrative Clustering (Weight: 20%)

**What:** How many coins share the same market narrative / investment thesis.
**How:** Pre-defined narrative clusters (coins can belong to multiple). Calculate allocation per narrative.
**Score:** Largest narrative cluster's allocation percentage.
**Why it matters:** "New Token Hype" can include coins from different sectors (ZORA is "New", MON is "Meme") but they trade on the same story. Sector analysis misses this — narrative analysis catches it.

### Regime Multiplier

The overall risk score is adjusted by regime:
- TRENDING_DOWN: ×1.3 (directional risk is amplified)
- TRENDING_UP: ×0.8 (long crowding is less dangerous)
- VOLATILE: ×1.2 (all risk is amplified)
- CHOPPY: ×1.0 (neutral)

---

## 6. RISK GRADES

| Score | Grade | Meaning |
|-------|-------|---------|
| 0-34 | LOW | Portfolio is well-diversified. Normal operations. |
| 35-59 | MODERATE | Some concentration. Current risk controls adequate. |
| 60-79 | HIGH | Significant risk. Don't add to concentrated positions. Sentry gate essential. |
| 80-100 | CRITICAL | Portfolio is a directional bet. Consider reducing exposure or adding hedges. |

---

## 7. CRON INTEGRATION

### Where it runs in the cycle

```
1. Temporal Edge → regime
2. Rei → signals
3. Sentry → directional calls + hard gate
4. Pixel → momentum
5. Wren → dedup + sizing
6. ★ JINX FACTOR MODEL → reads all of the above, outputs decomposition ★
7. Outcome Tracker → evaluates previous signals
8. All results emailed to Jackbot
```

The Factor Model runs AFTER Wren (needs final portfolio composition) and BEFORE the email is sent (results included in the scan email).

### Cron entry

```bash
# Add to existing cron schedule, after Wren, before email send
# Taylor: adjust path and timing to match existing cron setup
*/240 * * * * cd /path/to/bot-challenge && npx ts-node tools/jinx-factor-model.ts >> logs/factor-model.log 2>&1
```

Or integrate directly into the existing scan orchestrator if tools run sequentially in a single script.

---

## 8. DEPLOYMENT CHECKLIST

- [ ] Copy `jinx-factor-model.ts` to `bot-challenge/tools/`
- [ ] Verify `paper-ledger.json` path matches actual location
- [ ] Verify `desk-state.json` exists (or wire to Temporal Edge output)
- [ ] Update SECTOR_MAP for any coins not yet classified
- [ ] Run once manually: `npx ts-node tools/jinx-factor-model.ts`
- [ ] Verify JSON output at `factor-model-output.json`
- [ ] Integrate into cron orchestrator (after Wren, before email)
- [ ] Add Factor Model summary to scan cycle email template
- [ ] Test one full cron cycle with Factor Model included
- [ ] Confirm email to Jackbot includes factor decomposition

---

## 9. FUTURE ENHANCEMENTS (not for initial deploy)

1. **Rolling beta calculation:** Store 7-day price history, compute proper Pearson correlation coefficient instead of single-day proxy.
2. **Dynamic sector classification:** Use LLM to classify new coins by reading their description from CoinGecko/CMC.
3. **Factor-adjusted Kelly sizing:** Feed factor model into Wren — if sector concentration is CRITICAL, auto-reduce allocation to that sector.
4. **Wren sector caps:** Hard limit on allocation to any single sector (e.g., max 30% in any one sector).
5. **Cross-agent alerts:** If Factor Model detects CRITICAL risk, auto-trigger Sentry to re-scan all positions for exits.
6. **Historical factor tracking:** Log factor scores over time to see if diversification improves as the desk matures.

---

## 10. RELATIONSHIP TO OTHER TOOLS

```
                    ┌─────────────────┐
                    │  Temporal Edge   │
                    │  (regime input)  │
                    └────────┬────────┘
                             │
    ┌──────────┐   ┌────────▼────────┐   ┌──────────┐
    │   Rei    │──▶│  JINX FACTOR    │◀──│  Sentry  │
    │(signals) │   │     MODEL       │   │(blocks)  │
    └──────────┘   └────────┬────────┘   └──────────┘
                            │
    ┌──────────┐   ┌────────▼────────┐
    │  Pixel   │──▶│   Wren (sized   │
    │(momentum)│   │   portfolio)    │
    └──────────┘   └─────────────────┘
```

The Factor Model is a read-only diagnostic. It doesn't modify signals or block trades. It provides information that Oracle and Si use to make strategic decisions (e.g., "stop adding L1 longs" or "hedge with explicit BTC short").

In a future version, it could feed directly into Wren for automated sector caps, but that's not for initial deployment.

---

*Spec authored by Oracle, February 25, 2026*
*Implementation: jinx-factor-model.ts (pre-written, needs Taylor to wire file paths)*
*Estimated deployment: 1-2 hours including testing*
