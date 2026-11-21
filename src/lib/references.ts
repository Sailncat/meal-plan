// Daily vitamin and mineral goals and upper limits for adults, by the official tables.
//
// EU: EFSA, Dietary Reference Values for nutrients, summary report (2017), adults ≥ 18;
//     upper limits from EFSA's Overview on Tolerable Upper Intake Levels, version 11 (August 2025),
//     with vitamin B6 at 12 mg/day (EFSA 2023 opinion).
// US: National Academies, Dietary Reference Intakes summary tables (Appendix J of the 2019
//     sodium and potassium report): RDAs and AIs, and Tolerable Upper Intake Levels.
// Salt, saturated fat and sugars use WHO limits for both (5 g salt; under 10% of energy each).

import type { Sex, Stage, Standard } from './types';

export interface Person {
  sex: Sex;
  age: number;
  stage: Stage;
  /** The day's energy target, which some goals scale with. */
  kcal: number;
}

export interface Limit {
  /** Daily upper limit in the nutrient's unit. */
  ul: number;
  /** The limit only covers supplements (and added forms), so only foods marked as supplements count. */
  supplementsOnly: boolean;
  /** A "safe level of intake" rather than a formal upper limit (EFSA, iron). */
  safeLevel?: boolean;
}

const MJ_PER_KCAL = 0.004184;
const pregnant = (s: Stage) => s === 'pregnant1' || s === 'pregnant2' || s === 'pregnant3';
const feeding = (s: Stage) => s === 'breastfeeding';

/** Pick a value by sex and life stage: [man, woman, pregnant, breastfeeding]. */
function by(p: Person, man: number, woman: number, preg = woman, lact = woman): number {
  if (p.sex === 'male') return man;
  if (pregnant(p.stage)) return preg;
  if (feeding(p.stage)) return lact;
  return woman;
}

/** Daily minimum goals, keyed by nutrient id (see nutrients.ts). */
export function dailyGoals(standard: Standard, p: Person): Record<string, number> {
  const mj = p.kcal * MJ_PER_KCAL;
  if (standard === 'eu') {
    const zincWoman = 9.3; // PRI at a moderate phytate intake (600 mg/day)
    return {
      vitA: by(p, 750, 650, 700, 1300),
      vitC: by(p, 110, 95, 105, 155),
      vitD: 15,
      vitE: by(p, 13, 11),
      vitK: 70,
      b1: 0.1 * mj, // 0.1 mg per MJ of energy
      b2: by(p, 1.6, 1.6, 1.9, 2.0),
      b3: 1.6 * mj, // 1.6 mg niacin equivalents per MJ
      b6: by(p, 1.7, 1.6, 1.8, 1.7),
      folate: by(p, 330, 330, 600, 500),
      b12: by(p, 4.0, 4.0, 4.5, 5.0),
      ca: p.age < 25 ? 1000 : 950,
      // Women before menopause need more iron; menopause is assumed from 51.
      fe: p.sex === 'male' ? 11 : pregnant(p.stage) || feeding(p.stage) || p.age < 51 ? 16 : 11,
      mg: by(p, 350, 300),
      p: 550,
      k: feeding(p.stage) ? 4000 : 3500,
      zn: by(p, 11.7, zincWoman, zincWoman + 1.6, zincWoman + 2.9),
      se: feeding(p.stage) ? 85 : 70,
      fibre: 25,
    };
  }
  const old = p.age > 70;
  const over50 = p.age > 50;
  return {
    vitA: by(p, 900, 700, 770, 1300),
    vitC: by(p, 90, 75, 85, 120),
    vitD: old ? 20 : 15,
    vitE: by(p, 15, 15, 15, 19),
    vitK: by(p, 120, 90),
    b1: by(p, 1.2, 1.1, 1.4, 1.4),
    b2: by(p, 1.3, 1.1, 1.4, 1.6),
    b3: by(p, 16, 14, 18, 17),
    b6: by(p, over50 ? 1.7 : 1.3, over50 ? 1.5 : 1.3, 1.9, 2.0),
    folate: by(p, 400, 400, 600, 500),
    b12: by(p, 2.4, 2.4, 2.6, 2.8),
    ca: p.sex === 'male' ? (old ? 1200 : 1000) : pregnant(p.stage) || feeding(p.stage) ? 1000 : over50 ? 1200 : 1000,
    fe: by(p, 8, over50 ? 8 : 18, 27, 9),
    mg: by(p, p.age <= 30 ? 400 : 420, p.age <= 30 ? 310 : 320, p.age <= 30 ? 350 : 360, p.age <= 30 ? 310 : 320),
    p: 700,
    k: by(p, 3400, 2600, 2900, 2800),
    zn: by(p, 11, 8, 11, 12),
    se: by(p, 55, 55, 60, 70),
    fibre: by(p, over50 ? 30 : 38, over50 ? 21 : 25, 28, 29),
  };
}

/** Daily maximums that aren't safety limits: salt, saturated fat and sugars. */
export function dailyCaps(p: Person): Record<string, number> {
  return {
    salt: 5,
    satfat: (p.kcal * 0.1) / 9,
    sugar: (p.kcal * 0.1) / 4,
  };
}

/** Upper safety limits for adults (the same in pregnancy and breastfeeding unless noted). */
export function upperLimits(standard: Standard, p: Person): Record<string, Limit> {
  const all = (ul: number, extra: Partial<Limit> = {}): Limit => ({ ul, supplementsOnly: false, ...extra });
  const supp = (ul: number): Limit => ({ ul, supplementsOnly: true });
  if (standard === 'eu') {
    return {
      vitA: supp(3000), // preformed vitamin A only
      vitD: all(100),
      vitE: all(300),
      b6: all(12),
      folate: supp(1000), // folic acid in supplements and fortified foods
      ca: all(2500),
      fe: all(40, { safeLevel: true }),
      mg: supp(250),
      zn: all(25),
      se: all(255),
    };
  }
  return {
    vitA: supp(3000), // preformed vitamin A only
    vitC: all(2000),
    vitD: all(100),
    vitE: supp(1000), // supplemental alpha-tocopherol
    b3: supp(35), // synthetic niacin
    b6: all(100),
    folate: supp(1000), // synthetic folic acid
    ca: all(p.age > 50 && !pregnant(p.stage) && !feeding(p.stage) ? 2000 : 2500),
    fe: all(45),
    mg: supp(350), // from supplements and medicines only
    p: all(p.age > 70 ? 3000 : pregnant(p.stage) ? 3500 : 4000),
    zn: all(40),
    se: all(400),
  };
}

export const STANDARD_NAMES: Record<Standard, string> = {
  eu: 'EU (EFSA)',
  us: 'US (National Academies)',
};
