/**
 * PREDICTION MODULE - PUBLIC API
 * ==============================
 * This is the only import consumers need.
 *
 * Usage:
 *   import { predict, PredictionEngine } from '@/lib/prediction';
 *
 *   // Quick one-shot:
 *   const result = predict({ fighter1, fighter2, eventDate: '2025-07-12' });
 *
 *   // Or build a custom engine:
 *   const engine = new PredictionEngine([new ZodiacFactor(), new MetricsFactor()]);
 *   const result = engine.predict(ctx);
 */

export { PredictionEngine } from './PredictionEngine';
export { ZodiacFactor, NumerologyFactor, MetricsFactor, TimingFactor, createDefaultFactors } from './factors';

import { PredictionEngine } from './PredictionEngine';
import type { MatchupContext, MatchupPrediction } from '@/types/prediction';

// Singleton engine instance for convenience
let _engine: PredictionEngine | null = null;

function getEngine(): PredictionEngine {
  if (!_engine) {
    _engine = new PredictionEngine();
  }
  return _engine;
}

/** Convenience function: run a prediction with the default engine. */
export function predict(ctx: MatchupContext): MatchupPrediction {
  return getEngine().predict(ctx);
}

/** Reset the singleton (useful in tests). */
export function resetEngine(): void {
  _engine = null;
}

// Re-export types for consumers
export type {
  MatchupContext,
  MatchupPrediction,
  FactorScore,
  RiskFlag,
  DomainSummary,
  PredictionNarrative,
  PredictionDomain,
  IPredictionFactor,
} from '@/types/prediction';
