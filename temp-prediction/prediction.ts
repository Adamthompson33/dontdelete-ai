/**
 * PREDICTION TYPES
 * ================
 * Interface Segregation Principle: Small, focused interfaces.
 * Each consumer only depends on what it actually needs.
 */

import { Fighter, LifePath, ChineseZodiac } from './fighter';

// ── Scoring ──────────────────────────────────────────────────────────

/** A single scored insight from any prediction factor */
export interface FactorScore {
  /** Unique key for deduplication (e.g. "zodiac:enemy-sign") */
  key: string;
  /** Human-readable label */
  label: string;
  /** -10 to +10, where positive favours fighter1 */
  value: number;
  /** Relative importance weight (0–1) */
  weight: number;
  /** Which analytical domain produced this */
  domain: PredictionDomain;
  /** Short explanation shown in the UI */
  reasoning: string;
  /** Optional severity for risk-type scores */
  severity?: 'info' | 'caution' | 'warning' | 'danger';
}

export type PredictionDomain =
  | 'zodiac'
  | 'numerology'
  | 'metrics'
  | 'vulnerability'
  | 'timing'
  | 'composite';

// ── Risk Assessment ──────────────────────────────────────────────────

export interface RiskFlag {
  fighterId: string;
  category: 'injury' | 'karmic' | 'cycle-end' | 'enemy-year' | 'general';
  severity: 'low' | 'medium' | 'high' | 'extreme';
  label: string;
  detail: string;
}

// ── Factor Contract (Open/Closed + Dependency Inversion) ─────────────

/** Every prediction factor implements this interface.
 *  The engine depends on this abstraction — never on concrete factors. */
export interface IPredictionFactor {
  readonly domain: PredictionDomain;
  readonly name: string;

  /** Produce scored insights for a matchup */
  evaluate(ctx: MatchupContext): FactorScore[];

  /** Produce risk flags (may be empty) */
  assessRisks(ctx: MatchupContext): RiskFlag[];
}

// ── Matchup Context (single input DTO) ───────────────────────────────

export interface MatchupContext {
  fighter1: Fighter;
  fighter2: Fighter;
  eventDate: string;   // YYYY-MM-DD
  eventCity?: string;
  isMainEvent?: boolean;
  isTitleFight?: boolean;
}

// ── Final Prediction Output ──────────────────────────────────────────

export interface MatchupPrediction {
  /** 0–100 confidence that fighter1 wins */
  fighter1WinProbability: number;
  /** 0–100 confidence that fighter2 wins */
  fighter2WinProbability: number;
  /** All individual factor scores */
  scores: FactorScore[];
  /** Aggregated risk flags for both fighters */
  risks: RiskFlag[];
  /** Domain-level summaries */
  domainSummaries: DomainSummary[];
  /** The "Ultra Think" narrative */
  narrative: PredictionNarrative;
  /** Overall confidence in the prediction (0–1) */
  confidence: number;
}

export interface DomainSummary {
  domain: PredictionDomain;
  label: string;
  /** Net advantage: positive = fighter1, negative = fighter2 */
  netAdvantage: number;
  /** Top insight from this domain */
  headline: string;
  scores: FactorScore[];
}

export interface PredictionNarrative {
  /** One-liner verdict */
  verdict: string;
  /** Detailed multi-paragraph analysis */
  breakdown: string;
  /** Key factors driving the pick */
  keyFactors: string[];
  /** Wild-card or upset scenario */
  upsetAngle: string;
  /** Recommended bet type (entertainment only) */
  methodPrediction: 'KO/TKO' | 'Submission' | 'Decision' | 'Draw' | 'Unknown';
}
