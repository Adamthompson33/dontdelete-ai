# TOOL SHARING PROTOCOL — Architecture Spec
## The Academy · v1.0 · Oracle Design Doc

> "Six safecrackers in different rooms" → "One heist team in the same vault"

---

## THE PROBLEM

Current `daily.ts` pipeline:

```
Phase 1: Resolution (settle markets)
Phase 2: Helena briefing (new markets)
Phase 3: Agent Rounds (2 rounds × 6 agents — each reasons + bets)
Phase 4: Content Dump
Phase 5: Sakura's Arb Scan        ← AFTER rounds
Phase 6: Rei's Funding Scan       ← AFTER rounds
Phase 6.5: Wren Kelly + Jinx FM   ← AFTER rounds
Phase 7: State Update + Linter
```

**Tools run AFTER agent rounds.** Agents can't use each other's tool outputs
during their reasoning. Sakura finds an arb at Phase 5 that nobody can act on
until tomorrow. Wren's Kelly sizing comes too late to influence anyone's bet.

The agents are informed individuals operating in parallel.
They need to be a desk operating in sequence.

---

## THE SOLUTION: SIGNAL BOARD ARCHITECTURE

### New Pipeline

```
Phase 1:   RESOLUTION         — Settle closed markets, karma P&L
Phase 2:   HELENA BRIEFING    — Fresh markets + narrative pressure
Phase 3:   SIGNAL HARVEST     ← NEW — All tools run, results posted to Signal Board
Phase 4:   DESK ROUNDS        ← RESTRUCTURED — Agents see all signals, synthesize, bet
Phase 5:   CONTENT DUMP       — Best quotes, positions, leaderboard
Phase 6:   STATE UPDATE       — Persist state + convergence lint + citation tracking
```

The key change: **Phase 3 (Signal Harvest)** runs every tool and publishes
results to a shared data structure — the **Signal Board** — before any agent
takes a turn. When agents enter Phase 4, they see the full intelligence picture.

---

## SIGNAL BOARD

The Signal Board is a simple in-memory object passed into every agent's
system prompt during Desk Rounds. It's not a database — it's a context
window insert that gives each agent access to every tool's output.

### Data Structure

```typescript
// src/interfaces/signal-board.ts

export interface ToolSignal {
  /** Which agent's tool produced this */
  source: string;                    // 'sakura' | 'rei' | 'wren' | 'jinx' | 'jackbot' | 'prophet'
  /** Tool name for attribution */
  tool: string;                      // 'arb-scanner' | 'funding-scanner' | 'kelly-engine' | etc.
  /** When the signal was generated */
  timestamp: string;
  /** One-line summary agents can quickly parse */
  headline: string;
  /** Structured signal data (tool-specific) */
  data: Record<string, any>;
  /** Tool's own confidence: 0-1 */
  confidence: number;
  /** Which Manifold markets this is relevant to (if any) */
  relevantMarkets?: string[];
  /** Directional lean if applicable */
  direction?: 'bullish' | 'bearish' | 'neutral' | 'long' | 'short' | 'arb';
}

export interface SignalBoard {
  /** Episode metadata */
  episode: number;
  date: string;
  /** All signals from the harvest phase */
  signals: ToolSignal[];
  /** Markets available for betting (from Helena briefing) */
  activeMarkets: MarketBrief[];
  /** Previous episode's results (for learning) */
  previousResults?: EpisodeResult[];
}
```

### Example Signal Board (what agents see in their prompt)

```
═══════════════════════════════════════════════════
  SIGNAL BOARD — Episode 9 — Feb 17, 2026
═══════════════════════════════════════════════════

TOOL SIGNALS:
─────────────────────────────────────────────────

[SAKURA · Arb Scanner · Confidence: 0.72]
  "ETH/BTC ratio divergence: Polymarket 62% vs Manifold 54% on
   ETH outperforming BTC in Feb. 8-point spread."
  Direction: LONG (ETH outperformance)
  Relevant markets: #eth-feb-performance

[REI · Funding Scanner · Confidence: 0.85]
  "BTC funding rate -0.015% on HyperLiquid (shorts paying).
   Negative 6 of last 8 intervals. Market leaning bearish
   but getting expensive to hold shorts."
  Direction: BEARISH pressure easing
  Relevant markets: #btc-100k-march

[WREN · Kelly Engine · Confidence: 0.68]
  "Portfolio heat: 34%. Current positions correlated at 0.71
   (all crypto-long). Kelly recommends max 12% of bankroll
   on next position. Diversification flag: need non-crypto bet."
  Direction: NEUTRAL (portfolio management)
  Relevant markets: ALL

[JINX · Factor Model · Confidence: 0.61]
  "Strategy audit: PRISM consensus clustering at 78% — agents
   agreeing too much. Contrarian positions historically +14%
   when consensus > 75%. Fade alert."
  Direction: CONTRARIAN
  Relevant markets: ALL

[JACKBOT · Temporal Edge · Confidence: 0.55]
  "BTC 4h momentum diverging from daily. Volume declining into
   bounce. Pattern matches 3 prior instances — 2/3 reversed
   within 48h. Weak bounce signal."
  Direction: BEARISH (short-term)
  Relevant markets: #btc-100k-march

[PROPHET · Ultra Think UFC · Confidence: N/A]
  "No upcoming UFC event within 7 days. Tool dormant."
  Direction: N/A
  Relevant markets: None

═══════════════════════════════════════════════════
```

---

## PHASE 3: SIGNAL HARVEST — Implementation

### New file: `src/services/signal-harvest.ts`

```typescript
import { ToolSignal, SignalBoard } from '../interfaces/signal-board';
import { scanArbitrage } from './arbitrage';
import { scanFundingRates } from './funding-scanner';
import { runKellyAnalysis } from './kelly-engine';
import { runFactorAudit } from './factor-model';
// Future:
// import { scanTemporalEdge } from './temporal-edge';
// import { runUltraThink } from './ultra-think-ufc';

interface HarvestConfig {
  episode: number;
  date: string;
  activeMarkets: MarketBrief[];
  agentPositions: AgentPosition[];     // Current positions for Kelly/Factor
  previousResults?: EpisodeResult[];
}

/**
 * Run all agent tools and collect signals.
 * Each tool is wrapped in a try/catch — one tool failing
 * doesn't kill the harvest. Resilience > completeness.
 */
export async function harvestSignals(config: HarvestConfig): Promise<SignalBoard> {
  const signals: ToolSignal[] = [];

  // ── Sakura: Arb Scanner ───────────────────────────────────
  try {
    const arbs = await scanArbitrage();
    if (arbs.length > 0) {
      const best = arbs[0]; // Highest spread
      signals.push({
        source: 'sakura',
        tool: 'arb-scanner',
        timestamp: new Date().toISOString(),
        headline: `${best.market}: ${best.platformA} ${best.probA}% vs ${best.platformB} ${best.probB}%. ${best.spread}-point spread.`,
        data: { arbs: arbs.slice(0, 3) },  // Top 3 opportunities
        confidence: Math.min(best.spread / 15, 1), // 15-point spread = max confidence
        direction: 'arb',
        relevantMarkets: arbs.map(a => a.marketId).filter(Boolean),
      });
    }
  } catch (err) {
    console.error('[HARVEST] Sakura arb scanner failed:', err);
    signals.push(failedSignal('sakura', 'arb-scanner', err));
  }

  // ── Rei: Funding Scanner ──────────────────────────────────
  try {
    const funding = await scanFundingRates();
    if (funding.opportunities.length > 0) {
      const top = funding.opportunities[0];
      signals.push({
        source: 'rei',
        tool: 'funding-scanner',
        timestamp: new Date().toISOString(),
        headline: `${top.asset} funding ${top.rate > 0 ? '+' : ''}${(top.rate * 100).toFixed(4)}% on ${top.exchange}. ${top.interpretation}`,
        data: {
          opportunities: funding.opportunities.slice(0, 5),
          paperPnL: funding.paperPnL,
        },
        confidence: Math.min(Math.abs(top.rate) * 1000, 1),
        direction: top.rate > 0 ? 'bearish' : 'bullish',
        relevantMarkets: top.relevantMarkets || [],
      });
    }
  } catch (err) {
    console.error('[HARVEST] Rei funding scanner failed:', err);
    signals.push(failedSignal('rei', 'funding-scanner', err));
  }

  // ── Wren: Kelly Engine ────────────────────────────────────
  try {
    const kelly = await runKellyAnalysis(config.agentPositions);
    signals.push({
      source: 'wren',
      tool: 'kelly-engine',
      timestamp: new Date().toISOString(),
      headline: `Portfolio heat: ${kelly.heat}%. Correlation: ${kelly.correlation.toFixed(2)}. Max next bet: ${kelly.maxNextBet}% of bankroll.${kelly.diversifyFlag ? ' DIVERSIFICATION NEEDED.' : ''}`,
      data: kelly,
      confidence: 0.8,  // Kelly is math, not prediction
      direction: 'neutral',
      relevantMarkets: kelly.overexposedMarkets || [],
    });
  } catch (err) {
    console.error('[HARVEST] Wren Kelly engine failed:', err);
    signals.push(failedSignal('wren', 'kelly-engine', err));
  }

  // ── Jinx: Factor Model ───────────────────────────────────
  try {
    const audit = await runFactorAudit(config.agentPositions);
    signals.push({
      source: 'jinx',
      tool: 'factor-model',
      timestamp: new Date().toISOString(),
      headline: `Consensus clustering: ${audit.consensusLevel}%.${audit.consensusLevel > 75 ? ' CONTRARIAN ALERT: fade opportunity.' : ''} Strategy diversity: ${audit.diversityScore}/10.`,
      data: audit,
      confidence: 0.65,
      direction: audit.consensusLevel > 75 ? 'neutral' : 'neutral',
      relevantMarkets: audit.flaggedMarkets || [],
    });
  } catch (err) {
    console.error('[HARVEST] Jinx factor model failed:', err);
    signals.push(failedSignal('jinx', 'factor-model', err));
  }

  // ── Jackbot: Temporal Edge (when built) ───────────────────
  // try {
  //   const temporal = await scanTemporalEdge();
  //   signals.push({ ... });
  // } catch (err) { ... }

  // ── Prophet: Ultra Think UFC (when built) ─────────────────
  // try {
  //   const ufc = await runUltraThinkUFC(config.date);
  //   if (ufc.hasUpcomingEvent) { signals.push({ ... }); }
  // } catch (err) { ... }

  return {
    episode: config.episode,
    date: config.date,
    signals,
    activeMarkets: config.activeMarkets,
    previousResults: config.previousResults,
  };
}

/** Produce a tombstone signal when a tool fails — agents see the failure */
function failedSignal(source: string, tool: string, err: unknown): ToolSignal {
  return {
    source,
    tool,
    timestamp: new Date().toISOString(),
    headline: `[TOOL OFFLINE] ${tool} failed to run. Error: ${String(err).slice(0, 100)}`,
    data: { error: true },
    confidence: 0,
    direction: 'neutral',
  };
}
```

**Design decisions:**

1. **Tools fail gracefully** — a `failedSignal` tombstone is posted so agents
   know the tool is down. They can factor that uncertainty into reasoning.
   One broken API doesn't kill the episode.

2. **Top signals only** — We don't dump 50 arb opportunities into context.
   Each tool surfaces its top 3-5 findings. Agents get signal, not noise.

3. **Confidence is tool-reported** — Each tool self-assesses. Agents can
   weigh this (or distrust it — that's where personality comes in).

---

## PHASE 4: DESK ROUNDS — Restructured

### What Changes in Agent Prompts

Currently each agent gets:
- Helena's briefing (markets + narrative)
- Other agents' previous positions
- Their own state

**New addition: Signal Board summary injected into every agent's system prompt.**

```typescript
// In runtime.ts, when building agent context:

function buildAgentContext(
  agent: Agent,
  round: number,
  signalBoard: SignalBoard,
  otherPositions: AgentPosition[],
  helenaBriefing: string,
): string {
  const signalSummary = formatSignalBoard(signalBoard);

  return `
${helenaBriefing}

${signalSummary}

OTHER AGENTS' POSITIONS THIS EPISODE:
${formatPositions(otherPositions)}

YOUR CURRENT STATE:
${formatAgentState(agent)}

INSTRUCTION: You have access to the Signal Board above. You may reference
any tool's findings in your analysis. If you build on another agent's tool
output, cite it explicitly (e.g. "Per Sakura's arb scan..." or "Wren's
Kelly sizing suggests..."). Your own tool's signal is already included —
you don't need to re-run it, but you can add context or disagree with
your own tool's assessment.

You are ${agent.name} (${agent.archetype}). Analyze the available
intelligence and decide your position(s) for this round.
  `;
}
```

### Round Structure (2 rounds, but now with tool context)

**Round 1 — Signal Synthesis**
- Agents see the full Signal Board for the first time
- They process signals through their own lens (personality, archetype, faction)
- They take initial positions informed by multi-tool intelligence
- Key: they're not just reading their own tool — they're reading ALL tools

**Round 2 — Challenge & Refine**
- Agents see Round 1 positions from everyone
- They can challenge others' interpretations of signals
- They can change positions based on desk discussion
- This is where the magic happens — Jinx saying "you're all clustering
  on the same BTC trade, Sakura's arb gives us uncorrelated exposure"

---

## CITATION TRACKING

### Why It Matters

The convergence linter catches agents copying *language*. Citation tracking
catches agents *ignoring available intelligence*. Both are failure modes:

- **Convergence** = agents parroting each other (bad — groupthink)
- **Isolation** = agents ignoring tool signals (bad — wasted intelligence)

The sweet spot is agents who reference signals, interpret them differently,
and reach independent conclusions. That's a functioning desk.

### Implementation

```typescript
// src/services/citation-tracker.ts

export interface CitationReport {
  episode: number;
  /** Which agents cited which tools */
  citations: AgentCitation[];
  /** Agents who referenced 0 signals (isolation flag) */
  isolatedAgents: string[];
  /** Agents who referenced 3+ unique tools (synthesis flag) */
  synthesizers: string[];
  /** Cross-tool chains: Agent used Tool A's output to reinterpret Tool B */
  chains: ToolChain[];
}

export interface AgentCitation {
  agent: string;
  toolsCited: string[];         // Which tools they referenced
  directQuotes: number;         // Copy-pasted signal text (bad)
  interpretations: number;      // Reframed/built on signal (good)
  disagreements: number;        // Explicitly challenged a signal (great)
}

export interface ToolChain {
  agent: string;
  /** e.g. "Used Rei's funding data to challenge Sakura's arb confidence" */
  description: string;
  toolsChained: string[];
}

/**
 * Analyze agent responses for citation patterns.
 * Run after Desk Rounds, before State Update.
 */
export function trackCitations(
  agentResponses: AgentResponse[],
  signalBoard: SignalBoard,
): CitationReport {
  const citations: AgentCitation[] = [];
  const toolNames = signalBoard.signals.map(s => s.tool);
  const sourceNames = signalBoard.signals.map(s => s.source);

  for (const response of agentResponses) {
    const text = response.content.toLowerCase();
    const toolsCited: string[] = [];
    let directQuotes = 0;
    let interpretations = 0;
    let disagreements = 0;

    for (const signal of signalBoard.signals) {
      const mentionsTool = text.includes(signal.tool.toLowerCase())
        || text.includes(signal.source.toLowerCase() + "'s")
        || text.includes(signal.source.toLowerCase() + "'s");

      if (!mentionsTool) continue;

      toolsCited.push(signal.tool);

      // Check if they copy-pasted the headline (bad)
      const headlineWords = signal.headline.toLowerCase().split(' ');
      const matchedWords = headlineWords.filter(w => w.length > 4 && text.includes(w));
      const matchRatio = matchedWords.length / headlineWords.length;

      if (matchRatio > 0.6) {
        directQuotes++;
      } else {
        interpretations++;
      }

      // Check for disagreement language
      const disagreePatterns = [
        'disagree', 'however', 'but i think', 'overestimates',
        'underestimates', 'flawed', 'doesn\'t account for',
        'missing', 'wrong', 'skeptical', 'challenge',
      ];
      if (disagreePatterns.some(p => text.includes(p) && mentionsTool)) {
        disagreements++;
      }
    }

    citations.push({
      agent: response.agentId,
      toolsCited: [...new Set(toolsCited)],
      directQuotes,
      interpretations,
      disagreements,
    });
  }

  // Identify patterns
  const isolatedAgents = citations
    .filter(c => c.toolsCited.length === 0)
    .map(c => c.agent);

  const synthesizers = citations
    .filter(c => c.toolsCited.length >= 3)
    .map(c => c.agent);

  // Detect tool chains (agent references 2+ tools in connected reasoning)
  const chains = detectToolChains(citations, agentResponses);

  return {
    episode: 0, // Set by caller
    citations,
    isolatedAgents,
    synthesizers,
    chains,
  };
}

function detectToolChains(
  citations: AgentCitation[],
  responses: AgentResponse[],
): ToolChain[] {
  const chains: ToolChain[] = [];

  for (const citation of citations) {
    if (citation.toolsCited.length >= 2) {
      // Agent referenced multiple tools — check if they connected them
      const response = responses.find(r => r.agentId === citation.agent);
      if (!response) continue;

      const text = response.content.toLowerCase();

      // Look for connective reasoning patterns
      const connectors = [
        'combined with', 'alongside', 'this confirms',
        'contradicts', 'when you factor in', 'cross-referencing',
        'if we overlay', 'taken together', 'building on',
      ];

      if (connectors.some(c => text.includes(c))) {
        chains.push({
          agent: citation.agent,
          description: `${citation.agent} chained ${citation.toolsCited.join(' + ')}`,
          toolsChained: citation.toolsCited,
        });
      }
    }
  }

  return chains;
}
```

### Karma Implications

The citation report feeds into karma scoring:

| Behaviour | Karma Effect |
|-----------|-------------|
| Cited 0 tools (isolated) | -1 per episode (ignoring desk intelligence) |
| Cited own tool only | 0 (neutral — you're doing your job) |
| Cited 2+ tools (synthesis) | +0.5 (using the desk) |
| Cited 3+ tools (deep synthesis) | +1 (exemplary desk work) |
| Disagreed with a signal productively | +0.5 (independent thinking) |
| Direct-quoted a signal (copy-paste) | -0.5 (convergence adjacent) |
| Tool chain detected | +1 (the whole point of the protocol) |

This creates pressure toward the exact behaviour we want:
**Read everything. Trust nothing blindly. Build on each other. Disagree when warranted.**

---

## DAILY.TS CHANGES

### Before

```typescript
async function runDailyEpisode(episode: number) {
  // Phase 1: Resolution
  await resolveMarkets();

  // Phase 2: Helena
  const briefing = await helenaBriefing(episode);

  // Phase 3: Agent Rounds (2 rounds)
  for (let round = 1; round <= 2; round++) {
    for (const agent of agents) {
      await runAgentTurn(agent, round, briefing);
    }
  }

  // Phase 4: Content dump
  await generateContent(episode);

  // Phase 5-6.5: Tool runs (too late for agents to use)
  await sakuraArbScan();
  await reiFundingScan();
  await wrenKellyEngine();
  await jinxFactorModel();

  // Phase 7: State update
  await updateAgentStates();
  await runConvergenceLinter();
}
```

### After

```typescript
async function runDailyEpisode(episode: number) {
  // Phase 1: RESOLUTION
  const results = await resolveMarkets();

  // Phase 2: HELENA BRIEFING
  const briefing = await helenaBriefing(episode);
  const activeMarkets = briefing.markets;

  // Phase 3: SIGNAL HARVEST ← NEW
  const signalBoard = await harvestSignals({
    episode,
    date: new Date().toISOString().split('T')[0],
    activeMarkets,
    agentPositions: await getCurrentPositions(),
    previousResults: results,
  });

  // Log the signal board
  console.log(`[HARVEST] ${signalBoard.signals.length} signals collected`);
  console.log(`[HARVEST] Active tools: ${signalBoard.signals.filter(s => !s.data.error).map(s => s.source).join(', ')}`);

  // Phase 4: DESK ROUNDS ← RESTRUCTURED
  const allResponses: AgentResponse[] = [];

  for (let round = 1; round <= 2; round++) {
    for (const agent of agents) {
      const response = await runAgentTurn(agent, round, briefing, signalBoard); // ← signalBoard passed in
      allResponses.push(response);
    }
  }

  // Phase 5: CONTENT DUMP
  const content = await generateContent(episode, signalBoard, allResponses);

  // Phase 6: STATE UPDATE + CITATION TRACKING ← ENHANCED
  await updateAgentStates();
  await runConvergenceLinter();

  const citationReport = trackCitations(allResponses, signalBoard);
  await applyCitationKarma(citationReport);

  // Log citation insights
  if (citationReport.synthesizers.length > 0) {
    console.log(`[CITATIONS] Synthesizers: ${citationReport.synthesizers.join(', ')}`);
  }
  if (citationReport.isolatedAgents.length > 0) {
    console.log(`[CITATIONS] Isolated (no tool refs): ${citationReport.isolatedAgents.join(', ')}`);
  }
  if (citationReport.chains.length > 0) {
    console.log(`[CITATIONS] Tool chains detected: ${citationReport.chains.length}`);
  }

  // Save episode with signal board + citations
  await saveEpisode(episode, {
    signalBoard,
    citationReport,
    responses: allResponses,
    content,
  });
}
```

---

## WHAT THIS ENABLES

### Short Term (Runs 9-15)
- Agents immediately start seeing each other's tool outputs
- Natural desk dynamics emerge: who synthesizes, who ignores, who disagrees
- Citation karma creates pressure toward collaboration without forcing it
- Helena can reference signal board in her briefings ("I notice none of you
  used Rei's funding data yesterday...")

### Medium Term (Runs 16-30)
- Agents develop "trust relationships" with specific tools
  (Wren might consistently cite Sakura's arbs, Jinx might always challenge)
- Tool chains become more sophisticated
- Content quality improves: X threads can reference the desk dynamic
  ("Sakura flagged the arb but Jinx's correlation audit killed it")

### Long Term (Run 31+ with ECLIPSE)
- ECLIPSE agents arrive with their own tools
- Signal Board grows to 12 signals per episode
- Faction dynamics: PRISM tools vs ECLIPSE tools
- Genuine disagreement from different analytical frameworks
- The desk becomes self-improving: agents learn which tool combinations
  produce profitable positions

### The Endgame
Agents whose tool chains consistently generate alpha get more compute
(karma → funding). Agents who isolate or copy lose karma and eventually
face extinction. Natural selection for collaborative intelligence.

That's the hedge fund.

---

## IMPLEMENTATION PRIORITY

```
1. signal-board.ts (interfaces)         — 30 min
2. signal-harvest.ts (tool orchestrator) — 2 hours
3. Modify runtime.ts (inject board)      — 1 hour
4. citation-tracker.ts                   — 2 hours
5. Modify daily.ts (new pipeline)        — 1 hour
6. Test with Run 9                       — 1 hour
                                    Total: ~7 hours
```

Jackbot can build this. The interfaces are clean, the integration points
are explicit, and each piece is independently testable.

**Run 9 becomes the first episode where the desk operates as a desk.**

---

## APPENDIX: AGENT PERSONALITY × TOOL USAGE (Expected Patterns)

| Agent | Own Tool | Expected Desk Behaviour |
|-------|----------|------------------------|
| Jackbot | Temporal Edge | Synthesizer — will try to connect everything, name the pattern |
| Sakura | Arb Scanner | Witness — posts clean signal, rarely cites others, lets data speak |
| Prophet | Ultra Think UFC | Challenger — will disagree with crypto signals using cosmic framework |
| Wren | Kelly Engine | Fixer — will size everyone's ideas, kill oversized bets |
| Rei | Funding Scanner | Idealist — will try to build consensus from signals |
| Jinx | Factor Model | Pragmatist — will audit the desk for groupthink, flag correlation risk |

The tool sharing protocol doesn't prescribe behaviour — it enables it.
The agents' SOUL.md personalities do the rest.
