/**
 * TIMING FACTOR
 * =============
 * Single Responsibility: Only evaluates event-date specific alignments
 * and temporal patterns (fight-night energy, date numerology, etc.)
 */

import {
  IPredictionFactor,
  MatchupContext,
  FactorScore,
  RiskFlag,
  PredictionDomain,
} from '@/types/prediction';
import {
  calculateEventDayEnergy,
  calculatePersonalYearForEvent,
} from '@/lib/numerology';
import { getChineseZodiacYearForDate } from '@/lib/zodiac';

export class TimingFactor implements IPredictionFactor {
  readonly domain: PredictionDomain = 'timing';
  readonly name = 'Cosmic Timing Analysis';

  evaluate(ctx: MatchupContext): FactorScore[] {
    const scores: FactorScore[] = [];
    const { fighter1, fighter2, eventDate } = ctx;

    const eventEnergy = calculateEventDayEnergy(eventDate);
    const eventDay = parseInt(eventDate.split('-')[2]);
    const eventMonth = parseInt(eventDate.split('-')[1]);

    // ── Birthday Proximity Boost ─────────────────────────────────
    // Fighting near your birthday = personal energy peak
    const bday1Month = parseInt(fighter1.birthday.split('-')[1]);
    const bday1Day = parseInt(fighter1.birthday.split('-')[2]);
    const bday2Month = parseInt(fighter2.birthday.split('-')[1]);
    const bday2Day = parseInt(fighter2.birthday.split('-')[2]);

    const daysFromBday1 = this.daysBetween(eventMonth, eventDay, bday1Month, bday1Day);
    const daysFromBday2 = this.daysBetween(eventMonth, eventDay, bday2Month, bday2Day);

    if (daysFromBday1 <= 7) {
      scores.push({
        key: 'timing:birthday-boost-f1',
        label: 'Birthday Energy',
        value: 2,
        weight: 0.5,
        domain: this.domain,
        reasoning: `${fighter1.name} fights within ${daysFromBday1} days of their birthday. Personal energy cycle at its peak — heightened vitality.`,
      });
    }
    if (daysFromBday2 <= 7) {
      scores.push({
        key: 'timing:birthday-boost-f2',
        label: 'Birthday Energy',
        value: -2,
        weight: 0.5,
        domain: this.domain,
        reasoning: `${fighter2.name} fights within ${daysFromBday2} days of their birthday. Personal energy cycle at its peak — heightened vitality.`,
      });
    }

    // ── Event Day Number Alignment ───────────────────────────────
    // If the event day matches a fighter's secondary energy, they're "tuned in"
    const se1 = fighter1.gg33.secondaryEnergy;
    const se2 = fighter2.gg33.secondaryEnergy;

    if (eventDay === se1 && eventDay !== se2) {
      scores.push({
        key: 'timing:day-sync-f1',
        label: 'Date-Birth Number Sync',
        value: 2,
        weight: 0.4,
        domain: this.domain,
        reasoning: `${fighter1.name} was born on the ${se1}th, fighting on the ${eventDay}th. Date-birth number synchronization amplifies their natural energy.`,
      });
    }
    if (eventDay === se2 && eventDay !== se1) {
      scores.push({
        key: 'timing:day-sync-f2',
        label: 'Date-Birth Number Sync',
        value: -2,
        weight: 0.4,
        domain: this.domain,
        reasoning: `${fighter2.name} was born on the ${se2}th, fighting on the ${eventDay}th. Date-birth number synchronization amplifies their natural energy.`,
      });
    }

    // ── 19 Day Event Warning ─────────────────────────────────────
    if (eventEnergy.dayNumber === 19 || eventEnergy.secondaryEnergy === 19) {
      scores.push({
        key: 'timing:19-day',
        label: '19 Energy Day',
        value: 0,
        weight: 0.5,
        domain: this.domain,
        reasoning: 'This event falls on a 19-energy day. Karmic forces amplified — upsets and injuries more likely across the card.',
        severity: 'warning',
      });
    }

    // ── Main Event Pressure ──────────────────────────────────────
    if (ctx.isMainEvent) {
      // Main event fighters with LP 3 or 8 thrive under big lights
      const bigStageNumbers = [3, 8, 11];
      const f1ThrivesUnderLights = bigStageNumbers.includes(fighter1.gg33.lifePath);
      const f2ThrivesUnderLights = bigStageNumbers.includes(fighter2.gg33.lifePath);

      if (f1ThrivesUnderLights && !f2ThrivesUnderLights) {
        scores.push({
          key: 'timing:main-event-f1',
          label: 'Big Stage Energy',
          value: 2,
          weight: 0.4,
          domain: this.domain,
          reasoning: `${fighter1.name}'s Life Path ${fighter1.gg33.lifePath} thrives under the main event spotlight. The bigger the stage, the better the performance.`,
        });
      }
      if (f2ThrivesUnderLights && !f1ThrivesUnderLights) {
        scores.push({
          key: 'timing:main-event-f2',
          label: 'Big Stage Energy',
          value: -2,
          weight: 0.4,
          domain: this.domain,
          reasoning: `${fighter2.name}'s Life Path ${fighter2.gg33.lifePath} thrives under the main event spotlight. The bigger the stage, the better the performance.`,
        });
      }
    }

    return scores;
  }

  assessRisks(ctx: MatchupContext): RiskFlag[] {
    const risks: RiskFlag[] = [];
    const eventEnergy = calculateEventDayEnergy(ctx.eventDate);

    // 19 Day = elevated injury risk for everyone
    if (eventEnergy.dayNumber === 19) {
      risks.push({
        fighterId: ctx.fighter1.id,
        category: 'injury',
        severity: 'medium',
        label: '19 Energy Day',
        detail: 'Event falls on a karmic 19 day. All fighters carry slightly elevated injury risk.',
      });
      risks.push({
        fighterId: ctx.fighter2.id,
        category: 'injury',
        severity: 'medium',
        label: '19 Energy Day',
        detail: 'Event falls on a karmic 19 day. All fighters carry slightly elevated injury risk.',
      });
    }

    return risks;
  }

  /** Approximate days between two month/day pairs (ignoring year) */
  private daysBetween(m1: number, d1: number, m2: number, d2: number): number {
    const doy1 = (m1 - 1) * 30.44 + d1;
    const doy2 = (m2 - 1) * 30.44 + d2;
    const diff = Math.abs(doy1 - doy2);
    return Math.round(Math.min(diff, 365.25 - diff));
  }
}
