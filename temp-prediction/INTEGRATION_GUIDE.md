# Ultra Think Prediction Engine — Integration Guide

## Architecture Overview (SOLID Principles Applied)

```
src/
├── types/
│   └── prediction.ts          # All prediction interfaces (Interface Segregation)
├── lib/
│   └── prediction/
│       ├── index.ts            # Public API — single entry point
│       ├── PredictionEngine.ts # Orchestrator (Dependency Inversion)
│       └── factors/
│           ├── index.ts        # Factor registry (Open/Closed)
│           ├── ZodiacFactor.ts     # SRP: only zodiac analysis
│           ├── NumerologyFactor.ts # SRP: only GG33 numerology
│           ├── MetricsFactor.ts    # SRP: only fight stats
│           └── TimingFactor.ts     # SRP: only cosmic timing
└── components/
    └── UltraThinkPrediction.tsx    # UI — only rendering
```

## SOLID Breakdown

### S — Single Responsibility
Each factor handles **one analytical domain**. `ZodiacFactor` doesn't know about strike rates. `MetricsFactor` doesn't know about Life Paths. The engine orchestrates but never calculates domain-specific logic.

### O — Open/Closed
To add a new factor (e.g., "Location Energy" based on fight city):

```typescript
// src/lib/prediction/factors/LocationFactor.ts
import { IPredictionFactor, MatchupContext, FactorScore, RiskFlag } from '@/types/prediction';

export class LocationFactor implements IPredictionFactor {
  readonly domain = 'location' as any;
  readonly name = 'Location Energy Analysis';

  evaluate(ctx: MatchupContext): FactorScore[] {
    // Your logic here — no existing code changes needed
    return [];
  }

  assessRisks(ctx: MatchupContext): RiskFlag[] {
    return [];
  }
}
```

Then register it in `factors/index.ts`:
```typescript
import { LocationFactor } from './LocationFactor';

export function createDefaultFactors(): IPredictionFactor[] {
  return [
    new ZodiacFactor(),
    new NumerologyFactor(),
    new MetricsFactor(),
    new TimingFactor(),
    new LocationFactor(), // ← Just add it here
  ];
}
```

**Zero changes** to the engine, the component, or other factors.

### L — Liskov Substitution
Every factor implements `IPredictionFactor`. You can swap any factor for a mock/stub in tests:

```typescript
const mockFactor: IPredictionFactor = {
  domain: 'zodiac',
  name: 'Mock Zodiac',
  evaluate: () => [{ key: 'test', label: 'Test', value: 5, weight: 1, domain: 'zodiac', reasoning: 'test' }],
  assessRisks: () => [],
};

const engine = new PredictionEngine([mockFactor]);
```

### I — Interface Segregation
- `FactorScore` is a simple, flat object — no methods, no inheritance
- `RiskFlag` is independent from `FactorScore` — a factor can produce risks without scores
- `MatchupContext` is a read-only DTO — factors cannot mutate it

### D — Dependency Inversion
The engine constructor accepts `IPredictionFactor[]`, not concrete classes:

```typescript
export class PredictionEngine {
  constructor(factors?: IPredictionFactor[]) { ... }
}
```

High-level module (engine) depends on abstraction (interface). Low-level modules (factors) implement the abstraction. Neither depends on the other's internals.

---

## Integration into Your MatchupRow

Add the `UltraThinkPrediction` component inside your existing `MatchupRow`:

```tsx
// In your MatchupRow component, after the fighter panels:

import UltraThinkPrediction from '@/components/UltraThinkPrediction';

// Inside the return:
<UltraThinkPrediction
  matchup={matchup}
  eventDate={eventDate}
  eventCity={eventCity}
/>
```

That's it. The component handles everything internally:
- Runs the prediction engine on mount (memoized)
- Renders the collapsed preview (probability chips)
- Expands into the full tabbed analysis on click

---

## Quick Usage (Outside Components)

```typescript
import { predict } from '@/lib/prediction';

const result = predict({
  fighter1: gaethje,
  fighter2: pimblett,
  eventDate: '2025-07-12',
  isMainEvent: true,
});

console.log(result.fighter1WinProbability); // e.g. 58
console.log(result.narrative.verdict);      // "SLIGHT EDGE: Gaethje (58%)..."
console.log(result.risks);                  // [{fighterId: '...', severity: 'high', ...}]
```

---

## Scoring System

- Each factor produces `FactorScore[]` where `value` ranges from **-10 to +10**
  - Positive = favours fighter1
  - Negative = favours fighter2
  - Zero = neutral (informational)
- Each score has a `weight` (0–1) indicating importance
- The engine computes `weightedSum / totalWeight` for net advantage
- A sigmoid (tanh) maps net advantage to win probability
- Confidence is derived from factor agreement + data volume

## Probability Guardrails

- **Floor: 20%** — no fighter is ever given less than 20% chance
- **Ceiling: 80%** — no fighter is ever given more than 80%
- **Max swing: ±30%** from the 50-50 baseline
- This keeps predictions honest — astrology + metrics can inform, but fights are chaotic
