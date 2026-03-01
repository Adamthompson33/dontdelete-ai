/**
 * Platt Scaling for LLM Forecast Calibration
 * 
 * Based on Bridgewater AIA Forecaster paper (arXiv:2511.07678v1).
 * LLMs hedge toward 0.5 due to RLHF. Platt scaling corrects this.
 * 
 * The logistic transform with coefficient √3 ≈ 1.73 pushes probabilities
 * away from 0.5 toward the extremes, compensating for LLM hedging bias.
 * 
 * Apply to ALL agent probability outputs before aggregation or Kelly sizing.
 */

// Default Platt coefficient — √3 per Bridgewater paper
const DEFAULT_COEFF = Math.sqrt(3); // ≈ 1.7321

/**
 * Apply Platt scaling to a single probability.
 * Transforms p ∈ (0,1) → calibrated p ∈ (0,1).
 * 
 * Formula: σ(a * logit(p)) where a = coefficient, logit(p) = ln(p/(1-p))
 * 
 * @param p - Raw probability (0, 1)
 * @param coeff - Platt coefficient (default √3)
 * @returns Calibrated probability
 */
export function plattScale(p: number, coeff: number = DEFAULT_COEFF): number {
  // Clamp to avoid log(0) or log(inf)
  const clamped = Math.max(0.001, Math.min(0.999, p));
  const logit = Math.log(clamped / (1 - clamped));
  const scaled = 1 / (1 + Math.exp(-coeff * logit));
  return scaled;
}

/**
 * Apply Platt scaling to an array of forecasts and return the ensemble mean.
 * 
 * @param forecasts - Array of raw probabilities
 * @param coeff - Platt coefficient
 * @returns Array of calibrated probabilities
 */
export function ensembleForecasts(forecasts: number[], coeff: number = DEFAULT_COEFF): number[] {
  return forecasts.map(p => plattScale(p, coeff));
}

/**
 * Calibrated ensemble mean — scale each forecast then average.
 * 
 * @param forecasts - Array of raw probabilities
 * @param coeff - Platt coefficient
 * @returns Mean of calibrated probabilities
 */
export function ensembleMean(forecasts: number[], coeff: number = DEFAULT_COEFF): number {
  const scaled = ensembleForecasts(forecasts, coeff);
  return scaled.reduce((a, b) => a + b, 0) / scaled.length;
}

/**
 * Compute edge: calibrated probability vs market/implied probability.
 * Positive = we think it's more likely than the market does.
 * 
 * @param rawProb - Our raw probability estimate
 * @param marketProb - Market-implied probability
 * @param coeff - Platt coefficient
 * @returns Edge in percentage points
 */
export function computeEdge(rawProb: number, marketProb: number, coeff: number = DEFAULT_COEFF): number {
  return plattScale(rawProb, coeff) - marketProb;
}

/**
 * Brier score — measures forecast calibration (lower = better).
 * 
 * @param predictions - Array of { predicted: number, actual: 0 | 1 }
 * @returns Brier score [0, 1]
 */
export function brierScore(predictions: Array<{ predicted: number; actual: 0 | 1 }>): number {
  if (predictions.length === 0) return 0;
  const sum = predictions.reduce((acc, p) => acc + Math.pow(p.predicted - p.actual, 2), 0);
  return sum / predictions.length;
}

/**
 * Convert a confidence score (0-100) to a probability and apply Platt scaling.
 * Useful for tools that output confidence as a percentage.
 * 
 * @param confidence - Confidence score 0-100
 * @param coeff - Platt coefficient
 * @returns Calibrated probability (0-1)
 */
export function calibrateConfidence(confidence: number, coeff: number = DEFAULT_COEFF): number {
  const p = Math.max(0.5, Math.min(0.99, confidence / 100)); // confidence → probability (min 0.5 = coin flip)
  return plattScale(p, coeff);
}
