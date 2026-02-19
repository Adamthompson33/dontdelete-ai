/**
 * PREDICTION ENGINE
 * =================
 * Dependency Inversion: Depends only on IPredictionFactor, never concrete classes.
 * Single Responsibility: Orchestration + narrative generation only.
 * Open/Closed: New factors plug in without modifying this class.
 *
 * The engine:
 *  1. Collects FactorScores from every registered factor
 *  2. Collects RiskFlags from every registered factor
 *  3. Computes weighted advantage and win probabilities
 *  4. Groups scores by domain for summaries
 *  5. Generates the "Ultra Think" narrative
 */

import type {
  IPredictionFactor,
  MatchupContext,
  MatchupPrediction,
  FactorScore,
  RiskFlag,
  DomainSummary,
  PredictionNarrative,
  PredictionDomain,
} from '@/types/prediction';
import { createDefaultFactors } from './factors';

export class PredictionEngine {
  private readonly factors: IPredictionFactor[];

  /** Pass custom factors for testing or extension; defaults to the full set. */
  constructor(factors?: IPredictionFactor[]) {
    this.factors = factors ?? createDefaultFactors();
  }

  /** Register an additional factor at runtime (Open/Closed). */
  addFactor(factor: IPredictionFactor): void {
    this.factors.push(factor);
  }

  /** Main entry point: produce a full MatchupPrediction. */
  predict(ctx: MatchupContext): MatchupPrediction {
    // ── 1. Collect all scores and risks ─────────────────────────
    const allScores: FactorScore[] = [];
    const allRisks: RiskFlag[] = [];

    for (const factor of this.factors) {
      allScores.push(...factor.evaluate(ctx));
      allRisks.push(...factor.assessRisks(ctx));
    }

    // ── 2. Compute weighted advantage ───────────────────────────
    const { netAdvantage, confidence } = this.computeWeightedAdvantage(allScores);

    // ── 3. Convert to probabilities ─────────────────────────────
    const { f1Prob, f2Prob } = this.toProbabilities(netAdvantage, confidence);

    // ── 4. Build domain summaries ───────────────────────────────
    const domainSummaries = this.buildDomainSummaries(allScores, ctx);

    // ── 5. Generate narrative ────────────────────────────────────
    const narrative = this.generateNarrative(ctx, domainSummaries, allRisks, f1Prob, f2Prob);

    return {
      fighter1WinProbability: f1Prob,
      fighter2WinProbability: f2Prob,
      scores: allScores,
      risks: allRisks,
      domainSummaries,
      narrative,
      confidence,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // PRIVATE METHODS
  // ────────────────────────────────────────────────────────────────

  private computeWeightedAdvantage(scores: FactorScore[]): {
    netAdvantage: number;
    confidence: number;
  } {
    if (scores.length === 0) return { netAdvantage: 0, confidence: 0 };

    let weightedSum = 0;
    let totalWeight = 0;
    let agreementPositive = 0;
    let agreementNegative = 0;

    for (const s of scores) {
      weightedSum += s.value * s.weight;
      totalWeight += s.weight;

      if (s.value > 0) agreementPositive++;
      else if (s.value < 0) agreementNegative++;
    }

    const netAdvantage = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Confidence = how many factors agree on direction
    const totalDirectional = agreementPositive + agreementNegative;
    const maxAgreement = Math.max(agreementPositive, agreementNegative);
    const agreementRatio = totalDirectional > 0 ? maxAgreement / totalDirectional : 0.5;

    // Scale confidence by number of factors (more data = more confidence)
    const dataConfidence = Math.min(scores.length / 10, 1);

    const confidence = agreementRatio * 0.7 + dataConfidence * 0.3;

    return { netAdvantage, confidence };
  }

  private toProbabilities(
    netAdvantage: number,
    confidence: number
  ): { f1Prob: number; f2Prob: number } {
    // Sigmoid-like mapping: netAdvantage of ±5 maps to roughly ±25% from 50%
    const maxSwing = 30; // Max deviation from 50-50 (even with extreme data)
    const sensitivity = 0.15; // How quickly advantage translates to probability

    // Tanh gives us a nice S-curve from -1 to 1
    const normalizedAdvantage = Math.tanh(netAdvantage * sensitivity);

    // Scale by confidence (low confidence → closer to 50-50)
    const swing = normalizedAdvantage * maxSwing * confidence;

    const f1Prob = Math.round(Math.max(20, Math.min(80, 50 + swing)));
    const f2Prob = 100 - f1Prob;

    return { f1Prob, f2Prob };
  }

  private buildDomainSummaries(
    scores: FactorScore[],
    ctx: MatchupContext
  ): DomainSummary[] {
    const domains = new Map<PredictionDomain, FactorScore[]>();

    for (const score of scores) {
      if (!domains.has(score.domain)) {
        domains.set(score.domain, []);
      }
      domains.get(score.domain)!.push(score);
    }

    const DOMAIN_LABELS: Record<PredictionDomain, string> = {
      zodiac: '🐉 Chinese Zodiac',
      numerology: '🔢 GG33 Numerology',
      metrics: '📊 Fight Metrics',
      vulnerability: '⚠️ Vulnerability',
      timing: '⏱️ Cosmic Timing',
      composite: '🎯 Composite',
    };

    const summaries: DomainSummary[] = [];

    for (const [domain, domainScores] of domains) {
      const netAdvantage = domainScores.reduce(
        (sum, s) => sum + s.value * s.weight,
        0
      );

      // Pick the highest-weight score as the headline
      const headline = [...domainScores]
        .sort((a, b) => Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight))[0];

      const favouredName = netAdvantage > 0
        ? ctx.fighter1.name
        : netAdvantage < 0
          ? ctx.fighter2.name
          : 'Neither';

      summaries.push({
        domain,
        label: DOMAIN_LABELS[domain] || domain,
        netAdvantage,
        headline: headline
          ? `${favouredName !== 'Neither' ? `${favouredName}: ` : ''}${headline.reasoning}`
          : 'No significant findings.',
        scores: domainScores,
      });
    }

    // Sort by absolute impact
    summaries.sort((a, b) => Math.abs(b.netAdvantage) - Math.abs(a.netAdvantage));

    return summaries;
  }

  private generateNarrative(
    ctx: MatchupContext,
    summaries: DomainSummary[],
    risks: RiskFlag[],
    f1Prob: number,
    f2Prob: number
  ): PredictionNarrative {
    const { fighter1, fighter2 } = ctx;
    const favoured = f1Prob > f2Prob ? fighter1 : fighter2;
    const underdog = f1Prob > f2Prob ? fighter2 : fighter1;
    const favouredProb = Math.max(f1Prob, f2Prob);
    const isTossUp = Math.abs(f1Prob - f2Prob) <= 6;

    // ── Key Factors ──────────────────────────────────────────────
    const keyFactors: string[] = summaries
      .filter((s) => Math.abs(s.netAdvantage) > 0.5)
      .slice(0, 4)
      .map((s) => {
        const dir = s.netAdvantage > 0 ? fighter1.name : fighter2.name;
        return `${s.label} favours ${dir}`;
      });

    // ── Verdict ──────────────────────────────────────────────────
    let verdict: string;
    if (isTossUp) {
      verdict = `COIN FLIP: ${fighter1.name} and ${fighter2.name} are cosmically deadlocked. The universe hasn't picked a side.`;
    } else if (favouredProb >= 65) {
      verdict = `STRONG LEAN: ${favoured.name} (${favouredProb}%) — multiple cosmic and statistical currents converge in their favour.`;
    } else {
      verdict = `SLIGHT EDGE: ${favoured.name} (${favouredProb}%) — marginal advantages that could evaporate on fight night.`;
    }

    // ── Breakdown ────────────────────────────────────────────────
    const breakdownParts: string[] = [];

    // Zodiac summary
    const zodiacSummary = summaries.find((s) => s.domain === 'zodiac');
    if (zodiacSummary) {
      breakdownParts.push(
        `ZODIAC DYNAMICS: ${fighter1.zodiac.animal} (${fighter1.zodiac.element}) vs ${fighter2.zodiac.animal} (${fighter2.zodiac.element}). ${zodiacSummary.headline}`
      );
    }

    // Numerology summary
    const numSummary = summaries.find((s) => s.domain === 'numerology');
    if (numSummary) {
      breakdownParts.push(
        `NUMEROLOGY LAYER: LP${fighter1.gg33.lifePath} vs LP${fighter2.gg33.lifePath}. ${numSummary.headline}`
      );
    }

    // Metrics summary
    const metricsSummary = summaries.find((s) => s.domain === 'metrics');
    if (metricsSummary) {
      breakdownParts.push(
        `STATISTICAL EDGE: ${metricsSummary.headline}`
      );
    }

    // Timing summary
    const timingSummary = summaries.find((s) => s.domain === 'timing');
    if (timingSummary && Math.abs(timingSummary.netAdvantage) > 0.3) {
      breakdownParts.push(
        `TIMING ALIGNMENT: ${timingSummary.headline}`
      );
    }

    // Risk summary
    const f1Risks = risks.filter((r) => r.fighterId === fighter1.id);
    const f2Risks = risks.filter((r) => r.fighterId === fighter2.id);
    if (f1Risks.length > 0 || f2Risks.length > 0) {
      const riskLines: string[] = [];
      if (f1Risks.length > 0) {
        riskLines.push(`${fighter1.name}: ${f1Risks.map((r) => r.label).join(', ')}`);
      }
      if (f2Risks.length > 0) {
        riskLines.push(`${fighter2.name}: ${f2Risks.map((r) => r.label).join(', ')}`);
      }
      breakdownParts.push(`RED FLAGS: ${riskLines.join(' | ')}`);
    }

    const breakdown = breakdownParts.join('\n\n');

    // ── Upset Angle ──────────────────────────────────────────────
    let upsetAngle: string;
    const underdogRisksCount = risks.filter(
      (r) => r.fighterId === favoured.id
    ).length;

    if (underdogRisksCount > 0) {
      upsetAngle = `${favoured.name} carries ${underdogRisksCount} active risk flag(s). If the karmic/injury energy manifests early, ${underdog.name} is positioned to capitalize. Watch for ${underdog.zodiac.animal} instincts in the opening exchanges.`;
    } else if (isTossUp) {
      upsetAngle = `This is genuinely too close to call. The fighter who imposes their style first wins. ${underdog.name}'s ${underdog.zodiac.animal} energy gives them a chaos factor that could flip the script.`;
    } else {
      upsetAngle = `${underdog.name} (${underdog.zodiac.animal}, LP${underdog.gg33.lifePath}) has upset potential if they can negate ${favoured.name}'s primary strengths. Look for ${underdog.zodiac.animal}-style adaptability to create openings.`;
    }

    // ── Method Prediction ────────────────────────────────────────
    const methodPrediction = this.predictMethod(ctx, summaries);

    return {
      verdict,
      breakdown,
      keyFactors,
      upsetAngle,
      methodPrediction,
    };
  }

  private predictMethod(
    ctx: MatchupContext,
    summaries: DomainSummary[]
  ): 'KO/TKO' | 'Submission' | 'Decision' | 'Draw' | 'Unknown' {
    const { fighter1, fighter2 } = ctx;
    const m1 = fighter1.metrics;
    const m2 = fighter2.metrics;

    // High-output strikers with KO power → KO/TKO
    const combinedStriking = m1.strikesPerMin + m2.strikesPerMin;
    const combinedAbsorption = m1.strikesAbsorbedPerMin + m2.strikesAbsorbedPerMin;

    // Either fighter has sub game → submission possible
    const subThreat = Math.max(m1.submissionsPerMin, m2.submissionsPerMin);

    // Both have great defense + low finish rate → decision
    const bothDefensive =
      m1.strikeDefense > 0.58 &&
      m2.strikeDefense > 0.58 &&
      m1.takedownDefense > 0.7 &&
      m2.takedownDefense > 0.7;

    if (bothDefensive && subThreat < 0.3) {
      return 'Decision';
    }

    if (subThreat > 0.6 && (m1.takedownDefense < 0.65 || m2.takedownDefense < 0.65)) {
      return 'Submission';
    }

    if (combinedStriking > 9 && combinedAbsorption > 8) {
      return 'KO/TKO';
    }

    if (combinedStriking > 7) {
      return 'KO/TKO';
    }

    return 'Decision';
  }
}
