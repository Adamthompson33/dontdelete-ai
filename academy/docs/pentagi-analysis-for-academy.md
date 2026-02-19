# PentAGI Architecture Analysis → Academy Trading Desk Application
## Deep Research Breakdown for Oracle Review

---

## What PentAGI Is

PentAGI is a fully autonomous multi-agent penetration testing system (1.2K GitHub stars). It uses specialized AI agents working together to perform complex security assessments. Built in Go + TypeScript, backed by PostgreSQL with pgvector (vector store), Neo4j (knowledge graph via Graphiti), and a full observability stack (Grafana/Prometheus/Langfuse).

**Why it matters for the Academy:** It's a production-grade blueprint for making specialized AI agents collaborate on complex tasks through structured delegation. The pentesting domain is different, but the multi-agent orchestration patterns are directly portable.

---

## The Architecture That Matters

### 1. The Four-Agent Hierarchy

PentAGI uses four specialized agent roles:

| Agent | Role | Academy Equivalent |
|-------|------|--------------------|
| **Orchestrator** | Decomposes goals into tasks, delegates, synthesizes results | **Helena** |
| **Researcher** | Gathers intelligence, finds patterns, queries knowledge base | **Sentry, Phantom, Atlas** (ECLIPSE scanners) |
| **Developer** | Plans approach, designs strategy, selects tools | **Wren, Viper, Jinx** (PRISM/ECLIPSE analysts) |
| **Executor** | Runs the actual operations, stores results | **Sakura, Rei, Jackbot, Edge** (operators) |

**The key pattern:** Work flows through phases — Research → Planning → Execution — with the Orchestrator coordinating handoffs. Each agent has access to shared memory (Vector Store) and shared knowledge (Knowledge Base), but they operate independently within their domain.

### 2. The Flow → Task → SubTask → Action Hierarchy

This is the most directly applicable pattern. PentAGI decomposes work into:

```
Flow (high-level goal)
  └── Task (major objective)
       └── SubTask (assigned to specific agent type)
            └── Action (atomic operation with parameters + result)
                 ├── Artifact (output file/report)
                 └── Memory (observation/conclusion stored as vector)
```

**How this maps to the Academy:**

```
Episode (daily run = Flow)
  └── Phase (Signal Harvest, Market Analysis, Betting = Tasks)
       └── Agent Turn (Jackbot analyzes BTC, Rei scans funding = SubTasks)
            └── Tool Call (arb scan, Kelly calc, factor model = Actions)
                 ├── Signal Board Entry (= Artifact)
                 └── Agent Memory / Reflection (= Memory with embedding)
```

**What we're missing:** The Academy currently runs phases sequentially with all agents processing in parallel within each phase. PentAGI's model allows agents to delegate SUB-TASKS to each other mid-flow. Example: during Prophet's turn, he could delegate "check if this NBA line has moved on Asian books" to Sentry's sentiment scanner, get the result, and incorporate it into his prediction — all within one turn.

### 3. The Vector Store + Knowledge Graph Dual Memory

This is PentAGI's strongest architectural insight and the Academy's biggest gap.

**PentAGI's memory architecture:**
- **Vector Store (PostgreSQL + pgvector):** Every action result gets embedded and stored. When an agent starts a new task, it queries "similar past tasks" and gets relevant experiences. This is short-to-medium term memory — what worked before in similar situations.
- **Knowledge Graph (Neo4j via Graphiti):** Semantic relationships between entities. Not just "I scanned port 443" but "Port 443 → runs nginx 1.24 → has CVE-2024-XXXX → exploitable via technique Y." Entities are connected by typed relationships.

**What this would look like for the Academy:**

**Vector Store (what we should build):**
- Every agent signal gets embedded: "JACKBOT: BTC 13/33 MA crossover SHORT signal, Feb 17, confidence 7/10, result: +2.3%"
- Before each turn, agent queries: "What happened last time I saw this pattern?" and gets the 5 most similar past signals with outcomes
- This is how agents LEARN from their own history without needing it all in context

**Knowledge Graph (ambitious but powerful):**
- Entities: Markets, Agents, Signals, Outcomes, Strategies
- Relationships: "Prophet PREDICTED Hawks NO" → "Resolved CORRECT" → "Used signal from Sentry THREAT_BOARD"
- Query: "What signals have historically preceded correct NO predictions on NBA markets?" → Returns the causal chain

**Practical implementation:**
- pgvector is free and works with your existing Prisma/SQLite setup (or upgrade to PostgreSQL)
- For the knowledge graph, start simple: a `signal_outcomes` table with `signal_id, agent_id, market_id, prediction, confidence, outcome, profit_loss` and query it with SQL before investing in Neo4j
- The vector embeddings are the real win — $0.0001 per embedding via OpenAI, so embedding every signal costs essentially nothing

### 4. The Agent Interaction Protocol

PentAGI's agent communication follows a strict sequence:

```
1. Orchestrator initializes → queries Vector Store for similar past work
2. Orchestrator delegates to Researcher → "gather intel on target"
3. Researcher queries Vector Store for patterns → queries Knowledge Base for known issues
4. Researcher stores findings → returns results to Orchestrator
5. Orchestrator delegates to Developer → "plan approach based on research"
6. Developer queries Vector Store for techniques → loads tool capabilities from KB
7. Developer returns plan to Orchestrator
8. Orchestrator delegates to Executor → "execute this plan"
9. Executor loads tool guides → runs operations → stores results
10. Orchestrator synthesizes all results into final report
```

**The Academy equivalent — "The Trading Pipeline":**

```
1. Helena initializes episode → queries past episode outcomes for similar market conditions
2. Helena delegates to SCANNERS (Sakura, Rei, Sentry, Phantom)
   → "What opportunities exist right now?"
3. Scanners query their data sources + Vector Store for similar past signals
4. Scanners store findings on Signal Board → return to Helena
5. Helena delegates to ANALYSTS (Jinx, Wren, Viper)
   → "Validate and size these opportunities"
6. Analysts run factor models, Kelly sizing, vol assessment
   → Query Vector Store: "When Sakura found this pattern before, what happened?"
7. Analysts return validated + sized opportunities to Helena
8. Helena delegates to OPERATORS (Prophet, Jackbot, Atlas)
   → "Place these bets with this sizing"
9. Operators execute → store results in Vector Store
10. Helena synthesizes → episode report, leaderboard update, karma adjustment
```

**What changes:** Instead of all agents running in parallel and posting to a shared feed, you get a PHASED PIPELINE where each layer's output feeds the next layer's input. Scanners find → Analysts validate → Operators execute. Helena orchestrates the handoffs.

### 5. Smart Container Management / Tool Selection

PentAGI automatically selects Docker images based on task requirements. A network scanning task gets a container with nmap. A web exploitation task gets a container with Burp Suite.

**Academy equivalent:** Dynamic tool loading per agent per turn. Instead of every agent having access to every tool, Helena assigns tools based on the current task:
- "This episode has 3 NBA markets resolving" → Prophet gets ULTRA THINK loaded, Jackbot gets his temporal edge tools UNLOADED (not relevant)
- "Funding rates are spiking" → Rei gets priority, her scanner runs first, results feed into Jinx's factor model before anyone else moves
- This prevents wasted computation and focuses each turn

### 6. Observability Stack (Langfuse + Grafana)

PentAGI has full observability:
- **Langfuse:** Tracks every LLM call — tokens used, latency, cost, prompt/response pairs
- **Grafana/Prometheus:** System metrics, agent performance over time
- **OpenTelemetry:** Distributed tracing across agent interactions

**Academy application:**
- **Langfuse (or similar):** Track cost per agent per episode. Which agent is burning the most tokens? Which produces the most actionable signals per dollar spent? This feeds directly into the Natural Selection Engine's fitness function.
- **Performance dashboard:** Win rate by agent over time, Sharpe ratio trends, correlation between agents' signals. This is what Helena needs to run the evolution protocol.
- **The killer metric:** Cost per profitable signal. If Jackbot costs $0.003/turn and produces 1 profitable signal per 3 turns, his cost per signal is $0.009. If Prophet costs $0.003/turn and produces 1 per 10 turns, his cost per signal is $0.03. Helena should be optimizing for this.

---

## The Five Things to Steal

Ranked by impact-to-effort ratio:

### 1. Vector Store for Signal Memory (HIGH IMPACT, MEDIUM EFFORT)
- Embed every signal + outcome as a vector
- Before each agent turn, retrieve 5 most similar past signals with their outcomes
- Agents literally learn from history: "Last 3 times I saw this MA crossover pattern, 2 were profitable"
- **Build time:** ~8 hours (pgvector setup + embedding pipeline + retrieval in agent briefing)
- **Cost:** ~$0.50/month for embeddings at Academy scale

### 2. Phased Pipeline Instead of Parallel Execution (HIGH IMPACT, MEDIUM EFFORT)
- Restructure daily.ts from "all agents go at once" to Scanner → Analyst → Operator phases
- Each phase's output feeds the next phase's context
- Helena orchestrates handoffs between phases
- **Build time:** ~6 hours (refactor daily.ts runtime loop)
- **This is the single biggest architectural improvement available**

### 3. Inter-Agent Delegation (MEDIUM IMPACT, HIGH EFFORT)
- Allow agents to request specific data from other agents mid-turn
- Prophet says "I need Sentry's latest threat board on Hawks game" → system fetches it → Prophet incorporates it
- Requires a message-passing layer between agents
- **Build time:** ~12 hours (delegation protocol + message routing + context injection)

### 4. Cost-Per-Signal Tracking / Langfuse (MEDIUM IMPACT, LOW EFFORT)
- Log every LLM call with agent ID, turn number, token count, cost
- Calculate cost per profitable signal per agent
- Feed into Natural Selection Engine fitness function
- **Build time:** ~3 hours (logging wrapper around Anthropic API calls)

### 5. Knowledge Graph for Causal Chains (HIGH IMPACT, HIGH EFFORT)
- Track which signals led to which outcomes through which agents
- "Sentry flagged social volume → Phantom confirmed whale exit → Sakura found spread → Wren sized at 0.3 Kelly → Jackbot executed → Result: +4.2%"
- Shows which COMBINATIONS of agents produce wins, not just individuals
- **Build time:** ~16 hours (Neo4j setup + relationship modeling + query interface)
- **This is the endgame feature** — but defer until Phase 2

---

## How PentAGI's Team Structure Maps to Academy Desks

```
PentAGI:                          Academy:
┌─────────────┐                   ┌─────────────┐
│ Orchestrator │                   │   Helena    │
│ (delegates)  │                   │ (overseer)  │
└──────┬───────┘                   └──────┬──────┘
       │                                  │
  ┌────┼────┐                     ┌───────┼───────┐
  │    │    │                     │       │       │
  ▼    ▼    ▼                     ▼       ▼       ▼
┌───┐┌───┐┌───┐              ┌───────┐┌───────┐┌────────┐
│ R ││ D ││ E │              │SCANNER││ANALYST││OPERATOR│
└───┘└───┘└───┘              └───────┘└───────┘└────────┘
                              Sakura   Jinx     Jackbot
                              Rei      Wren     Prophet
                              Sentry   Viper    Atlas
                              Phantom  Edge     Pixel
```

The difference: PentAGI has 3 specialist types with 1 agent each. The Academy has 3 specialist types with 4 agents each. That's the "trading desk" advantage — you get multiple perspectives within each layer, which is exactly what prediction markets need (consensus signals are stronger than individual signals).

---

## Recommended Build Order for Oracle's Review

| Priority | Feature | Source Pattern | Build Time | Impact |
|----------|---------|---------------|------------|--------|
| 1 | Phased Pipeline (Scanner→Analyst→Operator) | PentAGI Flow→Task→SubTask | ~6 hrs | Highest — fixes the "all agents parallel" problem |
| 2 | Vector Store for Signal Memory | PentAGI Vector Store + pgvector | ~8 hrs | High — agents learn from their own history |
| 3 | Cost-Per-Signal Tracking | PentAGI Langfuse integration | ~3 hrs | Medium — feeds Natural Selection Engine |
| 4 | Inter-Agent Delegation | PentAGI Orchestrator→Agent protocol | ~12 hrs | Medium — enables agent collaboration |
| 5 | Knowledge Graph (causal chains) | PentAGI Graphiti/Neo4j | ~16 hrs | High but defer — endgame feature |

**Total: ~45 hours for full PentAGI-inspired upgrade**

---

## One-Line Summary for Oracle

PentAGI proves that the Orchestrator → Specialist Pipeline → Shared Memory architecture works at production scale. The Academy already has the specialists (12 agents) and the orchestrator (Helena). What's missing is the pipeline structure (phased execution instead of parallel), the shared memory (vector store for signal history), and the observability layer (cost-per-signal tracking). These three additions transform the Academy from "12 agents talking at each other" into "12 agents working together through structured delegation with institutional memory."
