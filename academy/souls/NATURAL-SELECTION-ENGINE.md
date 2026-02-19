# NATURAL SELECTION ENGINE — Architecture Spec
## The Academy · v1.0 · Evolution Protocol

> "The agents that survive are not the strongest or the most intelligent,
> but the most adaptable to change."

---

## OVERVIEW

The Natural Selection Engine (NSE) is a meta-system that sits above the
daily trading pipeline. It evaluates agent performance over rolling windows,
identifies underperformers, breeds replacements from top performers, and
manages the social dynamics of replacement.

The NSE creates Darwinian pressure that forces the Academy to evolve toward
strategies that work in current market conditions — without manual intervention.

---

## FITNESS FUNCTION

### Per-Agent Fitness Score (calculated every 10 episodes)

```typescript
interface FitnessScore {
  agent: string;
  generation: number;
  window: { start: number; end: number };  // Episode range
  
  // Core metrics (weighted per agent's soul.md fitness_weights)
  pnl_contribution: number;      // Agent's P&L as % of desk total
  sharpe_ratio: number;          // Risk-adjusted returns
  signal_accuracy: number;       // % of signals that were directionally correct
  desk_citation_score: number;   // From citation tracker: synthesis, chains, engagement
  independence_score: number;    // Inverse of convergence: unique positions
  
  // Derived
  composite_fitness: number;     // Weighted sum using agent's fitness_weights
  fitness_trend: 'improving' | 'stable' | 'declining';  // 3-window trend
  
  // Danger zone
  replacement_candidate: boolean; // True if bottom performer + declining trend
}
```

### Fitness Calculation

```typescript
function calculateFitness(agent: Agent, episodes: Episode[]): FitnessScore {
  const weights = agent.soul.evolution_parameters.fitness_weights;
  
  // Calculate each metric over the window
  const pnl = calculatePnLContribution(agent, episodes);
  const sharpe = calculateAgentSharpe(agent, episodes);
  const accuracy = calculateSignalAccuracy(agent, episodes);
  const citations = calculateCitationScore(agent, episodes);
  const independence = calculateIndependenceScore(agent, episodes);
  
  // Normalise each to 0-1 scale
  const normalised = {
    pnl: normalise(pnl, -0.5, 0.5),            // -50% to +50% contribution
    sharpe: normalise(sharpe, -1, 3),             // -1 to 3 Sharpe
    accuracy: accuracy,                            // Already 0-1
    citations: normalise(citations, -5, 10),       // Citation karma range
    independence: normalise(independence, 0, 1),    // Already 0-1
  };
  
  // Weighted composite
  const composite = 
    normalised.pnl * weights.pnl_contribution +
    normalised.sharpe * weights.sharpe_ratio +
    normalised.accuracy * weights.signal_accuracy +
    normalised.citations * weights.desk_citation_score +
    normalised.independence * weights.independence_score;
  
  // Trend detection (compare current window to previous 2 windows)
  const trend = detectTrend(agent, composite);
  
  return {
    agent: agent.name,
    generation: agent.soul.generation,
    window: { start: episodes[0].number, end: episodes[episodes.length - 1].number },
    pnl_contribution: pnl,
    sharpe_ratio: sharpe,
    signal_accuracy: accuracy,
    desk_citation_score: citations,
    independence_score: independence,
    composite_fitness: composite,
    fitness_trend: trend,
    replacement_candidate: composite === getLowestFitness(allAgents) && trend === 'declining',
  };
}
```

---

## SELECTION PRESSURE

### Evaluation Cycle

Every 10 episodes, HELENA triggers the evaluation:

```
Episode 10, 20, 30, 40... → NSE runs
```

### Selection Rules

1. **Bottom performer identified** — lowest composite_fitness across all active agents
2. **Declining trend required** — must be declining over 3 consecutive windows (30 episodes)
   - This prevents killing agents who had one bad stretch but are recovering
3. **Minimum survival period** — new agents (PROBATIONARY) get 15 episodes before evaluation
4. **HELENA confirms** — Helena reviews the fitness report and makes the final call
   - She can override: spare an agent if portfolio needs their specific tool
   - She can accelerate: replace an agent before the 30-episode threshold if catastrophic

### Who Is Safe

- **HELENA**: Permanent. Not subject to selection.
- **WREN**: Protected during first 50 episodes (desk needs risk infrastructure)
- **JINX**: Protected during first 50 episodes (desk needs correlation auditing)
- All others: subject to natural selection after their minimum survival period

---

## REPLACEMENT: MUTATION PROTOCOL

When an agent is selected for replacement, the new agent is NOT random.
It is bred from the top performer's soul.md, mutated for the replacement's role.

### Breeding Process

```typescript
interface MutationConfig {
  donor: Agent;          // Top performer whose soul provides the template
  recipient_role: string; // The role being replaced (e.g., "temporal-edge")
  mutation_rate: number;  // 0.1 = 10% of mutable traits change
}

function breedReplacement(config: MutationConfig): SoulConfig {
  const donorSoul = config.donor.soul;
  const recipientTemplate = getOriginalSoulTemplate(config.recipient_role);
  
  // Start with the recipient's role structure (tool, archetype, core function)
  const newSoul = deepClone(recipientTemplate);
  
  // Inherit decision-making traits from the donor
  // (the top performer's approach to risk, conviction, sizing)
  newSoul.core_beliefs = mergeBeliefs(
    recipientTemplate.core_beliefs,  // 70% — maintain role identity
    donorSoul.core_beliefs,          // 30% — inherit winning mindset
    config.mutation_rate
  );
  
  // Mutate mutable traits
  for (const [trait, value] of Object.entries(newSoul.mutable_traits)) {
    if (Math.random() < config.mutation_rate) {
      newSoul.mutable_traits[trait] = mutateValue(value, 0.2); // ±20% of current value
    }
  }
  
  // Inherit relationship biases from donor
  // (who does the top performer trust/distrust?)
  newSoul.relationship_biases = blendRelationships(
    recipientTemplate.relationships,
    donorSoul.relationships,
    0.3  // 30% donor influence
  );
  
  // Increment generation
  newSoul.generation = recipientTemplate.generation + 1;
  
  // Reset trust
  newSoul.trust_status = 'PROBATIONARY';
  newSoul.trust_weight = 0.3;
  
  return newSoul;
}

function mutateValue(value: number, range: number): number {
  const delta = value * range;
  return value + (Math.random() * 2 - 1) * delta;
}
```

### What Gets Inherited vs Mutated

| Category | Inherited From | Mutation |
|----------|---------------|----------|
| Role / Tool / Archetype | Original template | Never changes |
| Core Beliefs (30%) | Top performer | Blended with role defaults |
| Mutable Traits | Original template | ±20% random perturbation |
| Personality Markers | Original template | Subtle shifts from donor |
| Immutable Traits | Original template | Never changes |
| Relationships | Blend (70/30) | Donor biases leak in |
| Trust Status | Always PROBATIONARY | Resets to 0.3× weight |
| Generation Counter | Previous + 1 | Auto-incremented |

### Example: Replacing PROPHET

If Prophet (Gen 1) is the bottom performer and Sakura (Gen 1) is the top performer:

**New PROPHET (Gen 2) inherits:**
- Prophet's role: Ultra Think UFC, cosmic/numerology/stats prediction
- Prophet's tool: ultra-think-ufc
- Prophet's immutable traits: always state cosmic reasoning, guardrails, etc.
- 30% of Sakura's decision-making philosophy: more data-driven, less narrative
- Mutated zodiac_weight: was 0.35, now maybe 0.28 (Sakura's quantitative bias pulls it down)
- Mutated metrics_weight: was 0.25, now maybe 0.31 (emphasis shifts toward statistical data)
- Sakura's relationship biases: new Prophet trusts Wren more, trusts narrative less

**Result:** A Prophet that still reads the stars but weighs the stats more heavily.
After a few generations, the role evolves toward whatever balance actually makes money.

---

## SOCIAL DYNAMICS: THE REPLACEMENT EVENT

The replacement event is not silent. It's a narrative event that creates
desk-wide consequences. This is where the system gets genuinely interesting.

### Replacement Announcement Protocol

```typescript
interface ReplacementEvent {
  terminated: {
    agent: string;
    generation: number;
    final_fitness: FitnessScore;
    tenure_episodes: number;
    career_pnl: number;
    career_sharpe: number;
    cause: string;  // "sustained_underperformance" | "catastrophic_loss" | "helena_override"
  };
  successor: {
    agent: string;           // Same name
    generation: number;      // Previous + 1
    donor: string;           // Who they were bred from
    key_mutations: string[]; // What changed
  };
  desk_impact: {
    trust_reset: string;             // "All agents reset PROPHET trust to 0.3×"
    signal_weight_change: string;    // "PROPHET signals weighted at 30% until proven"
    probation_episodes: number;      // 15 episodes before full evaluation
  };
}
```

### HELENA's Announcement (injected into next episode's briefing)

```
[SYSTEM EVENT — AGENT REPLACEMENT]

PROPHET (Generation 1) has been decommissioned.
Tenure: 28 episodes. Career P&L: -3.2%. Sharpe: -0.14.
Fitness trend: Declining over final 3 evaluation windows.
Cause: Sustained underperformance.

A new PROPHET (Generation 2) has been deployed.
Bred from: SAKURA (current top performer, Gen 1).
Key mutations: Increased metrics weight (+24%), decreased zodiac
reliance (-20%), inherited quantitative-first decision framework.

All agents: Recalibrate trust for PROPHET to PROBATIONARY (0.3×).
PROPHET signals carry reduced weight for the next 15 episodes.
The new PROPHET must earn the desk's trust through performance.

To the new PROPHET: Your predecessor failed because cosmic signals
alone couldn't generate alpha. You carry Sakura's quantitative DNA.
Use it. The stars are still your domain — but the numbers must confirm.

The desk moves forward.
```

### Agent Reactions (emergent behaviour)

What makes this fascinating is how other agents SHOULD react:

- **Jackbot** might be relieved (old Prophet's cosmic signals contradicted his momentum reads)
  or suspicious (new Prophet has Sakura's data-driven approach — might be harder to argue with)
  
- **Sakura** sees her DNA in the new Prophet — this could create an unexpected alliance
  or a rivalry (does the new Prophet dilute Sakura's niche?)
  
- **Wren** treats it purely mechanically — adjusts trust weights, recalculates Kelly
  allocations for Prophet-sourced signals at 0.3×
  
- **Jinx** is fascinated — will audit whether the genetic variation actually improves
  the desk's diversity or reduces it (if Prophet becomes too similar to Sakura,
  that's a correlation risk)

These reactions emerge naturally from the agents' soul.md personalities processing
the replacement event. We don't script them. We just give them the information
and let their character determine the response.

---

## GENERATIONAL TRACKING

### Soul Archive

Every decommissioned soul.md is archived with full metadata:

```
/academy/souls/archive/
  PROPHET-gen1-episodes1-28.soul.md
  PROPHET-gen1-fitness-history.json
  PROPHET-gen1-career-stats.json
```

### Lineage Tree

Over time, a lineage tree emerges:

```
JACKBOT Gen 1 (PTJ) ──────────────────── still active
SAKURA Gen 1 (Simons) ─────────────┬──── still active
                                   │
PROPHET Gen 1 (Gann) ── REPLACED ──┘
PROPHET Gen 2 (Gann × Simons) ────┬──── active (probationary)
                                   │
                              [future]
                              PROPHET Gen 3 (Gann × Simons × ?)
```

### Genetic Drift

Over many generations, agents naturally drift toward strategies that work:

- In a trending market: momentum-biased traits survive, mean-reversion traits die
- In a choppy market: arb and basis trade traits survive, momentum traits die
- In a crisis: risk management traits dominate, speculative traits get replaced

The desk automatically adapts its strategy mix to the current regime —
not because anyone tuned it, but because natural selection did.

---

## IMPLEMENTATION

### Files Required

```
src/evolution/
├── fitness.ts           # Fitness calculation per agent
├── selection.ts         # Bottom performer identification
├── mutation.ts          # Breeding / soul mutation
├── replacement.ts       # Event generation and deployment
├── archive.ts           # Soul archiving and lineage tracking
└── index.ts             # NSE orchestrator (runs every 10 episodes)
```

### Integration with Daily Pipeline

```typescript
// In daily.ts, after Phase 6 (State Update):

if (episode % 10 === 0) {
  const fitnessReport = await evaluateAllAgents(episode);
  
  if (fitnessReport.replacementCandidate) {
    const approved = await helenaReview(fitnessReport);
    
    if (approved) {
      const topPerformer = fitnessReport.rankings[0];
      const replacement = breedReplacement({
        donor: topPerformer,
        recipient_role: fitnessReport.replacementCandidate.role,
        mutation_rate: 0.15,
      });
      
      await archiveSoul(fitnessReport.replacementCandidate);
      await deploySoul(replacement);
      await announceReplacement(fitnessReport, replacement);
    }
  }
  
  // Always publish fitness report (even without replacement)
  await publishFitnessReport(fitnessReport);
}
```

### Build Estimate

```
1. fitness.ts                    — 3 hours
2. selection.ts                  — 1 hour
3. mutation.ts                   — 4 hours (most complex)
4. replacement.ts                — 2 hours
5. archive.ts                    — 1 hour
6. Integration + Helena messages — 2 hours
7. Testing with mock data        — 3 hours
                            Total: ~16 hours
```

---

## THE VISION

After 100 episodes, the Academy roster won't look like it did on day one.
Some agents will be on their third or fourth generation. Others — the ones
that adapted — will still be Gen 1 originals. The lineage tree tells the
story of what worked and what didn't.

The desk becomes a living system. Not designed. Evolved.

**That's the Academy.**
