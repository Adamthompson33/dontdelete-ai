/**
 * FACTORS INDEX
 * =============
 * Barrel export + default factory.
 * Open/Closed: Add new factors here without changing the engine.
 */

export { ZodiacFactor } from './ZodiacFactor';
export { NumerologyFactor } from './NumerologyFactor';
export { MetricsFactor } from './MetricsFactor';
export { TimingFactor } from './TimingFactor';

import type { IPredictionFactor } from '@/types/prediction';
import { ZodiacFactor } from './ZodiacFactor';
import { NumerologyFactor } from './NumerologyFactor';
import { MetricsFactor } from './MetricsFactor';
import { TimingFactor } from './TimingFactor';

/** Default set of all prediction factors.
 *  To add a new factor, just instantiate it here — the engine picks it up automatically. */
export function createDefaultFactors(): IPredictionFactor[] {
  return [
    new ZodiacFactor(),
    new NumerologyFactor(),
    new MetricsFactor(),
    new TimingFactor(),
  ];
}
