/**
 * METRICS FACTOR
 * ==============
 * Single Responsibility: Only evaluates statistical fight metrics.
 * Pure data analysis — no astrology here.
 */

import {
  IPredictionFactor,
  MatchupContext,
  FactorScore,
  RiskFlag,
  PredictionDomain,
} from '@/types/prediction';
import type { Fighter } from '@/types/fighter';

/** Thresholds for metric evaluation */
const THRESHOLDS = {
  STRIKING_DIFF_DOMINANT: 1.5,   // Sig. strikes/min differential
  ACCURACY_DOMINANT: 0.08,       // 8% accuracy edge
  DEFENSE_DOMINANT: 0.06,        // 6% defense edge
  TD_RATE_DOMINANT: 0.8,         // TDs per min differential
  TD_ACCURACY_DOMINANT: 0.15,    // 15% TD accuracy edge
  ABSORPTION_DANGER: 5.5,        // Absorbing 5.5+ strikes/min = chin risk
} as const;

export class MetricsFactor implements IPredictionFactor {
  readonly domain: PredictionDomain = 'metrics';
  readonly name = 'Fight Metrics Analysis';

  evaluate(ctx: MatchupContext): FactorScore[] {
    const scores: FactorScore[] = [];
    const { fighter1, fighter2 } = ctx;
    const m1 = fighter1.metrics;
    const m2 = fighter2.metrics;

    // ── Striking Volume ──────────────────────────────────────────
    const strikeDiff = m1.strikesPerMin - m2.strikesPerMin;
    if (Math.abs(strikeDiff) > THRESHOLDS.STRIKING_DIFF_DOMINANT) {
      const dominant = strikeDiff > 0 ? fighter1 : fighter2;
      const value = strikeDiff > 0
        ? Math.min(strikeDiff * 1.5, 5)
        : Math.max(strikeDiff * 1.5, -5);
      scores.push({
        key: 'metrics:striking-volume',
        label: 'Striking Volume Edge',
        value: Math.round(value * 10) / 10,
        weight: 0.7,
        domain: this.domain,
        reasoning: `${dominant.name} lands ${dominant.metrics.strikesPerMin.toFixed(1)} sig. strikes/min vs ${(strikeDiff > 0 ? fighter2 : fighter1).metrics.strikesPerMin.toFixed(1)}. Significant output advantage creates pressure.`,
      });
    }

    // ── Striking Accuracy ────────────────────────────────────────
    const accDiff = m1.strikingAccuracy - m2.strikingAccuracy;
    if (Math.abs(accDiff) > THRESHOLDS.ACCURACY_DOMINANT) {
      const dominant = accDiff > 0 ? fighter1 : fighter2;
      scores.push({
        key: 'metrics:striking-accuracy',
        label: 'Precision Advantage',
        value: accDiff > 0 ? 2 : -2,
        weight: 0.6,
        domain: this.domain,
        reasoning: `${dominant.name} connects at ${(dominant.metrics.strikingAccuracy * 100).toFixed(0)}% accuracy. Cleaner, more efficient striking.`,
      });
    }

    // ── Strike Defense ───────────────────────────────────────────
    const defDiff = m1.strikeDefense - m2.strikeDefense;
    if (Math.abs(defDiff) > THRESHOLDS.DEFENSE_DOMINANT) {
      const dominant = defDiff > 0 ? fighter1 : fighter2;
      scores.push({
        key: 'metrics:strike-defense',
        label: 'Defensive Edge',
        value: defDiff > 0 ? 2 : -2,
        weight: 0.6,
        domain: this.domain,
        reasoning: `${dominant.name} avoids ${(dominant.metrics.strikeDefense * 100).toFixed(0)}% of incoming strikes. Harder to damage cleanly.`,
      });
    }

    // ── Absorption Rate (Chin Durability Proxy) ──────────────────
    const absorbHighF1 = m1.strikesAbsorbedPerMin > THRESHOLDS.ABSORPTION_DANGER;
    const absorbHighF2 = m2.strikesAbsorbedPerMin > THRESHOLDS.ABSORPTION_DANGER;

    if (absorbHighF1 && !absorbHighF2) {
      scores.push({
        key: 'metrics:absorption-risk-f1',
        label: 'High Absorption Rate',
        value: -2,
        weight: 0.5,
        domain: this.domain,
        reasoning: `${fighter1.name} absorbs ${m1.strikesAbsorbedPerMin.toFixed(1)} strikes/min — high volume damage intake raises finishing vulnerability.`,
        severity: 'caution',
      });
    }
    if (absorbHighF2 && !absorbHighF1) {
      scores.push({
        key: 'metrics:absorption-risk-f2',
        label: 'High Absorption Rate',
        value: 2,
        weight: 0.5,
        domain: this.domain,
        reasoning: `${fighter2.name} absorbs ${m2.strikesAbsorbedPerMin.toFixed(1)} strikes/min — high volume damage intake raises finishing vulnerability.`,
        severity: 'caution',
      });
    }

    // ── Takedown Offense ─────────────────────────────────────────
    const tdDiff = m1.takedownsPerMin - m2.takedownsPerMin;
    if (Math.abs(tdDiff) > THRESHOLDS.TD_RATE_DOMINANT) {
      const dominant = tdDiff > 0 ? fighter1 : fighter2;
      const other = tdDiff > 0 ? fighter2 : fighter1;
      scores.push({
        key: 'metrics:takedown-offense',
        label: 'Takedown Threat',
        value: tdDiff > 0 ? 3 : -3,
        weight: 0.7,
        domain: this.domain,
        reasoning: `${dominant.name} averages ${dominant.metrics.takedownsPerMin.toFixed(2)} TDs/min. This wrestling pressure can dictate where the fight takes place.`,
      });

      // Cross-reference with opponent's TD defense
      const tdDefOther = other.metrics.takedownDefense;
      if (tdDefOther < 0.65) {
        const extraValue = tdDiff > 0 ? 2 : -2;
        scores.push({
          key: 'metrics:td-vs-tdd',
          label: 'Grappling Mismatch',
          value: extraValue,
          weight: 0.6,
          domain: this.domain,
          reasoning: `${other.name}'s TD defense is only ${(tdDefOther * 100).toFixed(0)}% against ${dominant.name}'s wrestling. Likely to be taken down and controlled.`,
          severity: 'warning',
        });
      }
    }

    // ── Takedown Defense Comparison ──────────────────────────────
    const tddDiff = m1.takedownDefense - m2.takedownDefense;
    if (Math.abs(tddDiff) > 0.15) {
      const dominant = tddDiff > 0 ? fighter1 : fighter2;
      scores.push({
        key: 'metrics:td-defense-edge',
        label: 'Takedown Defense Edge',
        value: tddDiff > 0 ? 1.5 : -1.5,
        weight: 0.4,
        domain: this.domain,
        reasoning: `${dominant.name} stuffs ${(dominant.metrics.takedownDefense * 100).toFixed(0)}% of takedown attempts. Better at keeping the fight where they want it.`,
      });
    }

    // ── Submission Threat ────────────────────────────────────────
    const subDiff = m1.submissionsPerMin - m2.submissionsPerMin;
    if (Math.abs(subDiff) > 0.3) {
      const dominant = subDiff > 0 ? fighter1 : fighter2;
      scores.push({
        key: 'metrics:submission-threat',
        label: 'Submission Danger',
        value: subDiff > 0 ? 2 : -2,
        weight: 0.5,
        domain: this.domain,
        reasoning: `${dominant.name} averages ${dominant.metrics.submissionsPerMin.toFixed(1)} sub attempts/min. Constant threat on the mat — opponent must respect the grappling.`,
      });
    }

    // ── Style Clash Analysis ─────────────────────────────────────
    const styleScore = this.analyzeStyleClash(fighter1, fighter2);
    if (styleScore) {
      scores.push(styleScore);
    }

    return scores;
  }

  assessRisks(ctx: MatchupContext): RiskFlag[] {
    const risks: RiskFlag[] = [];

    for (const fighter of [ctx.fighter1, ctx.fighter2]) {
      const m = fighter.metrics;

      // Fighter absorbs more than they land = durability concern
      if (m.strikesAbsorbedPerMin > m.strikesPerMin * 1.2) {
        risks.push({
          fighterId: fighter.id,
          category: 'general',
          severity: 'medium',
          label: 'Negative Strike Differential',
          detail: `${fighter.name} absorbs more than they land (${m.strikesAbsorbedPerMin.toFixed(1)} absorbed vs ${m.strikesPerMin.toFixed(1)} landed/min). Accumulative damage risk in longer fights.`,
        });
      }

      // Very low TD defense + opponent has TD game
      if (m.takedownDefense < 0.55) {
        risks.push({
          fighterId: fighter.id,
          category: 'general',
          severity: 'medium',
          label: 'Takedown Vulnerability',
          detail: `${fighter.name} only defends ${(m.takedownDefense * 100).toFixed(0)}% of takedowns. At risk of being controlled on the ground.`,
        });
      }
    }

    return risks;
  }

  /** Determine if there's a clear style clash dynamic */
  private analyzeStyleClash(f1: Fighter, f2: Fighter): FactorScore | null {
    const m1 = f1.metrics;
    const m2 = f2.metrics;

    // Striker vs Grappler
    const f1IsStriker = m1.strikesPerMin > 4.5 && m1.takedownsPerMin < 0.5;
    const f2IsStriker = m2.strikesPerMin > 4.5 && m2.takedownsPerMin < 0.5;
    const f1IsGrappler = m1.takedownsPerMin > 1.0 || m1.submissionsPerMin > 0.5;
    const f2IsGrappler = m2.takedownsPerMin > 1.0 || m2.submissionsPerMin > 0.5;

    if (f1IsStriker && f2IsGrappler) {
      // Does the striker have TD defense to keep it standing?
      const tddStriker = m1.takedownDefense;
      const value = tddStriker > 0.75 ? 2 : tddStriker > 0.60 ? 0 : -2;
      return {
        key: 'metrics:style-clash',
        label: 'Striker vs Grappler',
        value,
        weight: 0.7,
        domain: this.domain,
        reasoning: value > 0
          ? `Classic striker vs grappler. ${f1.name}'s TD defense (${(tddStriker * 100).toFixed(0)}%) should keep this standing — advantage striker.`
          : value < 0
            ? `Classic striker vs grappler. ${f1.name}'s TD defense (${(tddStriker * 100).toFixed(0)}%) may not hold — ${f2.name} can dictate where this goes.`
            : `Classic striker vs grappler. ${f1.name}'s TD defense (${(tddStriker * 100).toFixed(0)}%) makes this a coin flip on where the fight takes place.`,
      };
    }

    if (f2IsStriker && f1IsGrappler) {
      const tddStriker = m2.takedownDefense;
      const value = tddStriker > 0.75 ? -2 : tddStriker > 0.60 ? 0 : 2;
      return {
        key: 'metrics:style-clash',
        label: 'Striker vs Grappler',
        value,
        weight: 0.7,
        domain: this.domain,
        reasoning: value < 0
          ? `Classic striker vs grappler. ${f2.name}'s TD defense (${(tddStriker * 100).toFixed(0)}%) should keep this standing — advantage striker.`
          : value > 0
            ? `Classic striker vs grappler. ${f2.name}'s TD defense (${(tddStriker * 100).toFixed(0)}%) may not hold — ${f1.name} can dictate where this goes.`
            : `Classic striker vs grappler. ${f2.name}'s TD defense (${(tddStriker * 100).toFixed(0)}%) makes this a coin flip on where the fight takes place.`,
      };
    }

    return null;
  }
}
