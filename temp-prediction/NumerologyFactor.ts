/**
 * NUMEROLOGY FACTOR
 * =================
 * Single Responsibility: Only evaluates GG33 numerological dynamics.
 */

import {
  IPredictionFactor,
  MatchupContext,
  FactorScore,
  RiskFlag,
  PredictionDomain,
} from '@/types/prediction';
import {
  LIFE_PATH_MEANINGS,
  analyzeNumerologyMatchup,
  calculatePersonalYearForEvent,
  getPersonalYearMeaning,
  calculateEventDayEnergy,
  getSecondaryEnergyInfo,
} from '@/lib/numerology';
import type { LifePath } from '@/types/fighter';

export class NumerologyFactor implements IPredictionFactor {
  readonly domain: PredictionDomain = 'numerology';
  readonly name = 'GG33 Numerology Analysis';

  evaluate(ctx: MatchupContext): FactorScore[] {
    const scores: FactorScore[] = [];
    const { fighter1, fighter2, eventDate } = ctx;
    const lp1 = fighter1.gg33.lifePath;
    const lp2 = fighter2.gg33.lifePath;

    // ── Life Path Compatibility ──────────────────────────────────
    const compat = analyzeNumerologyMatchup(lp1 as LifePath, lp2 as LifePath);
    scores.push({
      key: 'num:life-path-compat',
      label: 'Life Path Compatibility',
      value: compat.compatibility > 0.7 ? 0 : compat.compatibility < 0.5 ? 0 : 0,
      weight: 0.5,
      domain: this.domain,
      reasoning: compat.analysis,
      severity: compat.compatibility < 0.5 ? 'caution' : 'info',
    });

    // ── Personal Year Energy ─────────────────────────────────────
    const py1 = calculatePersonalYearForEvent(fighter1.birthday, eventDate);
    const py2 = calculatePersonalYearForEvent(fighter2.birthday, eventDate);
    const pyMeaning1 = getPersonalYearMeaning(py1);
    const pyMeaning2 = getPersonalYearMeaning(py2);

    // Power years: 1 (new beginnings), 8 (power), 11 (intuition), 22 (master builder)
    const powerYears = [1, 8, 11, 22, 33];
    const weakYears = [7, 9, 19];

    const f1InPower = powerYears.includes(py1);
    const f2InPower = powerYears.includes(py2);
    const f1InWeak = weakYears.includes(py1);
    const f2InWeak = weakYears.includes(py2);

    if (f1InPower && !f2InPower) {
      scores.push({
        key: 'num:personal-year-f1-power',
        label: `Personal Year ${py1} (Power Cycle)`,
        value: 3,
        weight: 0.7,
        domain: this.domain,
        reasoning: `${fighter1.name} in Personal Year ${py1}: ${pyMeaning1.energy}. Peak cycle energy — operating with cosmic momentum.`,
      });
    }
    if (f2InPower && !f1InPower) {
      scores.push({
        key: 'num:personal-year-f2-power',
        label: `Personal Year ${py2} (Power Cycle)`,
        value: -3,
        weight: 0.7,
        domain: this.domain,
        reasoning: `${fighter2.name} in Personal Year ${py2}: ${pyMeaning2.energy}. Peak cycle energy — operating with cosmic momentum.`,
      });
    }

    if (f1InWeak) {
      scores.push({
        key: 'num:personal-year-f1-weak',
        label: `Personal Year ${py1} (Risk Cycle)`,
        value: -2,
        weight: 0.6,
        domain: this.domain,
        reasoning: `${fighter1.name} in Personal Year ${py1}: ${pyMeaning1.energy}. ${pyMeaning1.warning || 'Diminished cycle energy.'}`,
        severity: 'warning',
      });
    }
    if (f2InWeak) {
      scores.push({
        key: 'num:personal-year-f2-weak',
        label: `Personal Year ${py2} (Risk Cycle)`,
        value: 2,
        weight: 0.6,
        domain: this.domain,
        reasoning: `${fighter2.name} in Personal Year ${py2}: ${pyMeaning2.energy}. ${pyMeaning2.warning || 'Diminished cycle energy.'}`,
        severity: 'warning',
      });
    }

    // ── Master/Sub-Master Number Advantage ────────────────────────
    const masterNumbers: LifePath[] = [11, 22, 33, 44];
    const subMasterNumbers: LifePath[] = [13, 19, 28];
    const f1Master = masterNumbers.includes(lp1 as LifePath);
    const f2Master = masterNumbers.includes(lp2 as LifePath);
    const f1Sub = subMasterNumbers.includes(lp1 as LifePath);
    const f2Sub = subMasterNumbers.includes(lp2 as LifePath);

    if (f1Master && !f2Master) {
      scores.push({
        key: 'num:master-number-f1',
        label: `Master Number ${lp1}`,
        value: 2,
        weight: 0.5,
        domain: this.domain,
        reasoning: `${fighter1.name} carries Master Number ${lp1} (${LIFE_PATH_MEANINGS[lp1 as LifePath]?.name}). Higher vibrational ceiling in battle.`,
      });
    }
    if (f2Master && !f1Master) {
      scores.push({
        key: 'num:master-number-f2',
        label: `Master Number ${lp2}`,
        value: -2,
        weight: 0.5,
        domain: this.domain,
        reasoning: `${fighter2.name} carries Master Number ${lp2} (${LIFE_PATH_MEANINGS[lp2 as LifePath]?.name}). Higher vibrational ceiling in battle.`,
      });
    }

    // ── Event Day Energy Alignment ───────────────────────────────
    const eventEnergy = calculateEventDayEnergy(eventDate);
    const eventLP = eventEnergy.reducedEnergy;

    // Fighter whose life path matches event day energy gets a boost
    if (lp1 === eventLP && lp2 !== eventLP) {
      scores.push({
        key: 'num:event-day-align-f1',
        label: 'Event Day Resonance',
        value: 3,
        weight: 0.6,
        domain: this.domain,
        reasoning: `Event day vibrates at ${eventLP} — matching ${fighter1.name}'s Life Path. The arena is tuned to their frequency.`,
      });
    }
    if (lp2 === eventLP && lp1 !== eventLP) {
      scores.push({
        key: 'num:event-day-align-f2',
        label: 'Event Day Resonance',
        value: -3,
        weight: 0.6,
        domain: this.domain,
        reasoning: `Event day vibrates at ${eventLP} — matching ${fighter2.name}'s Life Path. The arena is tuned to their frequency.`,
      });
    }

    // ── Secondary Energy (Birthday Number) ───────────────────────
    const se1 = fighter1.gg33.secondaryEnergy;
    const se2 = fighter2.gg33.secondaryEnergy;
    const seInfo1 = getSecondaryEnergyInfo(se1);
    const seInfo2 = getSecondaryEnergyInfo(se2);

    // Check for special secondary energies
    if (se1 === 23 || se1 === 24) {
      scores.push({
        key: 'num:royal-star-f1',
        label: `${seInfo1.name} (Day ${se1})`,
        value: 1,
        weight: 0.3,
        domain: this.domain,
        reasoning: `${fighter1.name} born on the ${se1}th: ${seInfo1.influence}. Natural charisma amplifies performance.`,
      });
    }
    if (se2 === 23 || se2 === 24) {
      scores.push({
        key: 'num:royal-star-f2',
        label: `${seInfo2.name} (Day ${se2})`,
        value: -1,
        weight: 0.3,
        domain: this.domain,
        reasoning: `${fighter2.name} born on the ${se2}th: ${seInfo2.influence}. Natural charisma amplifies performance.`,
      });
    }

    // ── Special Notes / Alignments ───────────────────────────────
    if (fighter1.gg33.specialNotes) {
      scores.push({
        key: 'num:special-f1',
        label: 'Special Alignment',
        value: 2,
        weight: 0.4,
        domain: this.domain,
        reasoning: `${fighter1.name}: ${fighter1.gg33.specialNotes}`,
        severity: 'info',
      });
    }
    if (fighter2.gg33.specialNotes) {
      scores.push({
        key: 'num:special-f2',
        label: 'Special Alignment',
        value: -2,
        weight: 0.4,
        domain: this.domain,
        reasoning: `${fighter2.name}: ${fighter2.gg33.specialNotes}`,
        severity: 'info',
      });
    }

    return scores;
  }

  assessRisks(ctx: MatchupContext): RiskFlag[] {
    const risks: RiskFlag[] = [];

    for (const fighter of [ctx.fighter1, ctx.fighter2]) {
      const py = calculatePersonalYearForEvent(fighter.birthday, ctx.eventDate);
      const lp = fighter.gg33.lifePath;
      const se = fighter.gg33.secondaryEnergy;

      // Life Path 7 or 19 = injury risk
      if (lp === 7 || lp === 19) {
        risks.push({
          fighterId: fighter.id,
          category: 'injury',
          severity: lp === 19 ? 'high' : 'medium',
          label: `Life Path ${lp}: Injury Prone`,
          detail: LIFE_PATH_MEANINGS[lp as LifePath]?.warning || `Life Path ${lp} carries inherent physical vulnerability.`,
        });
      }

      // Personal Year 7 = injury risk
      if (py === 7) {
        risks.push({
          fighterId: fighter.id,
          category: 'injury',
          severity: 'high',
          label: `Personal Year 7: Active Injury Cycle`,
          detail: 'Personal Year 7 carries elevated physical risk. Health setbacks are more likely during this cycle.',
        });
      }

      // Personal Year 9 = completion/endings
      if (py === 9) {
        risks.push({
          fighterId: fighter.id,
          category: 'cycle-end',
          severity: 'medium',
          label: 'Personal Year 9: Completion Cycle',
          detail: 'Year of endings. Risk of retirement, contract loss, or major career transition.',
        });
      }

      // Personal Year 19 = karmic injury
      if (py === 19) {
        risks.push({
          fighterId: fighter.id,
          category: 'karmic',
          severity: 'extreme',
          label: 'Personal Year 19: Karmic Physical Challenge',
          detail: 'The most dangerous personal year for fighters. Karmic debt manifests physically.',
        });
      }

      // Double 7: LP7 + SE7
      if (lp === 7 && se === 7) {
        risks.push({
          fighterId: fighter.id,
          category: 'injury',
          severity: 'extreme',
          label: 'DOUBLE 7: Amplified Vulnerability',
          detail: 'Both Life Path and Secondary Energy carry 7. Exponentially elevated injury risk.',
        });
      }

      // Secondary 13 = karmic debt
      if (se === 13) {
        risks.push({
          fighterId: fighter.id,
          category: 'karmic',
          severity: 'medium',
          label: 'Secondary 13: Karmic Debt',
          detail: 'Must work harder than opponents for the same results. Nothing comes easily.',
        });
      }
    }

    return risks;
  }
}
