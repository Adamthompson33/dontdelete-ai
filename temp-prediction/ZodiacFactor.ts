/**
 * ZODIAC FACTOR
 * =============
 * Single Responsibility: Only evaluates Chinese Zodiac dynamics.
 * Open/Closed: New zodiac rules are added here without touching the engine.
 */

import {
  IPredictionFactor,
  MatchupContext,
  FactorScore,
  RiskFlag,
  PredictionDomain,
} from '@/types/prediction';
import {
  isEnemySign,
  isSoulmateSign,
  getElementRelation,
  getTrineGroup,
  getYearlyFortune,
  calculateContractScore,
  getChineseZodiacYearForDate,
  ZODIAC_ELEMENTS,
  ELEMENT_CYCLE,
} from '@/lib/zodiac';

export class ZodiacFactor implements IPredictionFactor {
  readonly domain: PredictionDomain = 'zodiac';
  readonly name = 'Chinese Zodiac Analysis';

  evaluate(ctx: MatchupContext): FactorScore[] {
    const scores: FactorScore[] = [];
    const { fighter1, fighter2, eventDate } = ctx;
    const sign1 = fighter1.zodiac.animal;
    const sign2 = fighter2.zodiac.animal;
    const elem1 = fighter1.zodiac.element;
    const elem2 = fighter2.zodiac.element;

    // ── Enemy Sign Clash ─────────────────────────────────────────
    if (isEnemySign(sign1, sign2)) {
      scores.push({
        key: 'zodiac:enemy-clash',
        label: 'Enemy Sign Clash',
        value: 0, // neutral — chaos benefits neither predictably
        weight: 0.7,
        domain: this.domain,
        reasoning: `${sign1} vs ${sign2} is a natural enemy pairing. Expect a volatile, unpredictable fight with bad blood energy.`,
        severity: 'warning',
      });
    }

    // ── Soulmate Pairing ─────────────────────────────────────────
    if (isSoulmateSign(sign1, sign2)) {
      scores.push({
        key: 'zodiac:soulmate',
        label: 'Soulmate Pairing',
        value: 0,
        weight: 0.3,
        domain: this.domain,
        reasoning: `${sign1} and ${sign2} are secret friends. Expect a respectful, technical contest — less chaos, more chess.`,
        severity: 'info',
      });
    }

    // ── Element Cycle ────────────────────────────────────────────
    const elemRelation = getElementRelation(elem1, elem2);
    if (elemRelation === 'destroys') {
      scores.push({
        key: 'zodiac:element-destroys',
        label: `${elem1} Destroys ${elem2}`,
        value: 3,
        weight: 0.6,
        domain: this.domain,
        reasoning: `${fighter1.name}'s ${elem1} element overwhelms ${fighter2.name}'s ${elem2} in the destruction cycle. Elemental dominance in exchanges.`,
      });
    } else if (elemRelation === 'generates') {
      scores.push({
        key: 'zodiac:element-generates',
        label: `${elem1} Generates ${elem2}`,
        value: -1,
        weight: 0.3,
        domain: this.domain,
        reasoning: `${fighter1.name}'s ${elem1} feeds energy to ${fighter2.name}'s ${elem2}. ${fighter2.name} may absorb and redirect attacks.`,
      });
    }

    // Check reverse: does elem2 destroy elem1?
    const reverseRelation = getElementRelation(elem2, elem1);
    if (reverseRelation === 'destroys') {
      scores.push({
        key: 'zodiac:element-destroys-reverse',
        label: `${elem2} Destroys ${elem1}`,
        value: -3,
        weight: 0.6,
        domain: this.domain,
        reasoning: `${fighter2.name}'s ${elem2} element overwhelms ${fighter1.name}'s ${elem1}. Elemental disadvantage for ${fighter1.name}.`,
      });
    }

    // ── Yearly Fortune (Trine vs Bad Luck Year) ──────────────────
    const eventYear = parseInt(eventDate.split('-')[0]);
    const fortune1 = getYearlyFortune(sign1, eventYear);
    const fortune2 = getYearlyFortune(sign2, eventYear);

    if (fortune1.isGoodYear && !fortune2.isGoodYear) {
      scores.push({
        key: 'zodiac:yearly-advantage-f1',
        label: `${sign1} Trine Year`,
        value: 4,
        weight: 0.8,
        domain: this.domain,
        reasoning: `${fighter1.name} is in their trine year — cosmic tailwind. Fortune favours the ${sign1}.`,
      });
    }
    if (fortune2.isGoodYear && !fortune1.isGoodYear) {
      scores.push({
        key: 'zodiac:yearly-advantage-f2',
        label: `${sign2} Trine Year`,
        value: -4,
        weight: 0.8,
        domain: this.domain,
        reasoning: `${fighter2.name} is in their trine year — cosmic tailwind. Fortune favours the ${sign2}.`,
      });
    }
    if (fortune1.isBadYear) {
      scores.push({
        key: 'zodiac:bad-year-f1',
        label: `${sign1} Enemy Year`,
        value: -3,
        weight: 0.7,
        domain: this.domain,
        reasoning: `${fighter1.name} is in their enemy sign year — everything is harder. Cosmic headwinds.`,
        severity: 'warning',
      });
    }
    if (fortune2.isBadYear) {
      scores.push({
        key: 'zodiac:bad-year-f2',
        label: `${sign2} Enemy Year`,
        value: 3,
        weight: 0.7,
        domain: this.domain,
        reasoning: `${fighter2.name} is in their enemy sign year — fighting against the current.`,
        severity: 'warning',
      });
    }

    // ── Contract Zodiac Score ────────────────────────────────────
    if (fighter1.gg33.ufcSigningYear && fighter2.gg33.ufcSigningYear) {
      const contract1 = calculateContractScore(sign1, fighter1.gg33.ufcSigningYear as any);
      const contract2 = calculateContractScore(sign2, fighter2.gg33.ufcSigningYear as any);
      const contractDelta = contract1.score - contract2.score;

      if (Math.abs(contractDelta) > 0) {
        scores.push({
          key: 'zodiac:contract-energy',
          label: 'Contract Zodiac Alignment',
          value: contractDelta > 0 ? 2 : -2,
          weight: 0.4,
          domain: this.domain,
          reasoning: `${fighter1.name}: ${contract1.badge} (${contract1.score > 0 ? '+' : ''}${contract1.score}) vs ${fighter2.name}: ${contract2.badge} (${contract2.score > 0 ? '+' : ''}${contract2.score}). ${contractDelta > 0 ? fighter1.name : fighter2.name} has better organizational energy.`,
        });
      }
    }

    // ── Event Day Zodiac ─────────────────────────────────────────
    const eventZodiacYear = getChineseZodiacYearForDate(eventDate);
    const trine1 = getTrineGroup(sign1);
    const trine2 = getTrineGroup(sign2);
    const f1InTrine = trine1.members.includes(eventZodiacYear);
    const f2InTrine = trine2.members.includes(eventZodiacYear);

    if (f1InTrine && !f2InTrine) {
      scores.push({
        key: 'zodiac:event-trine-f1',
        label: 'Event Zodiac Trine Alignment',
        value: 2,
        weight: 0.5,
        domain: this.domain,
        reasoning: `The ${eventZodiacYear} year energy aligns with ${fighter1.name}'s ${trine1.name} trine. Home-field cosmic advantage.`,
      });
    } else if (f2InTrine && !f1InTrine) {
      scores.push({
        key: 'zodiac:event-trine-f2',
        label: 'Event Zodiac Trine Alignment',
        value: -2,
        weight: 0.5,
        domain: this.domain,
        reasoning: `The ${eventZodiacYear} year energy aligns with ${fighter2.name}'s ${trine2.name} trine. Home-field cosmic advantage.`,
      });
    }

    return scores;
  }

  assessRisks(ctx: MatchupContext): RiskFlag[] {
    const risks: RiskFlag[] = [];
    const eventYear = parseInt(ctx.eventDate.split('-')[0]);

    for (const fighter of [ctx.fighter1, ctx.fighter2]) {
      const fortune = getYearlyFortune(fighter.zodiac.animal, eventYear);

      if (fortune.isBadYear) {
        risks.push({
          fighterId: fighter.id,
          category: 'enemy-year',
          severity: 'high',
          label: `${fighter.zodiac.animal} in Enemy Year`,
          detail: fortune.warning || fortune.analysis,
        });
      }
    }

    return risks;
  }
}
