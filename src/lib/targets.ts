// Daily targets worked out from the profile, and which targets are actually in use.
//
// Calories: Mifflin-St Jeor resting energy × an activity factor, then ± the aim
// (about 7,700 kcal per kg of body weight). Pregnancy and breastfeeding add EFSA's extra energy:
// 70, 260 and 500 kcal a day by trimester, 500 while breastfeeding.
// Protein: 1.6–2.2 g per kg of body weight, the range sports nutrition research supports for
// people who lift, plus EFSA's pregnancy and breastfeeding extras.
// Fat: 20–35% of energy (EFSA and US reference ranges). Carbs: the energy left over.

import type { Activity, MacroKey, Plan, Profile, Range, Sex, Stage } from './types';

export const ACTIVITIES: { id: Activity; factor: number; label: string; sub: string }[] = [
  { id: 'sedentary', factor: 1.2, label: 'Mostly sitting', sub: 'Desk job, little or no exercise' },
  { id: 'light', factor: 1.375, label: 'Lightly active', sub: 'Exercise 1–3 days a week' },
  { id: 'moderate', factor: 1.55, label: 'Moderately active', sub: 'Exercise 3–5 days a week' },
  { id: 'active', factor: 1.725, label: 'Very active', sub: 'Hard exercise 6–7 days a week' },
  { id: 'very', factor: 1.9, label: 'Extremely active', sub: 'Hard training plus a physical job' },
];

export const PACES = {
  lose: [0.25, 0.5, 0.75],
  gain: [0.25, 0.5],
} as const;

export const KCAL_PER_KG = 7700;
export const PROTEIN_PER_KG: Range = { low: 1.6, high: 2.2 };
export const FAT_SHARE: Range = { low: 0.2, high: 0.35 };
/** Half-width of the calorie target band. */
export const KCAL_BAND = 100;
/** Below these, the app warns that the calorie target is very low. */
export const KCAL_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };

const EXTRA_KCAL: Record<Stage, number> = { none: 0, pregnant1: 70, pregnant2: 260, pregnant3: 500, breastfeeding: 500 };
const EXTRA_PROTEIN: Record<Stage, number> = { none: 0, pregnant1: 1, pregnant2: 9, pregnant3: 28, breastfeeding: 19 };

export const isPregnantOrFeeding = (s: Stage) => s !== 'none';

/** Age in whole years this year. */
export const ageOf = (birthYear: number | null, now = new Date()) => (birthYear ? now.getFullYear() - birthYear : null);

export const latestWeight = (plan: Plan): number | null => plan.weights.at(-1)?.kg ?? null;

/** Mifflin-St Jeor resting energy in kcal a day. */
export function restingEnergy(sex: Sex, kg: number, cm: number, age: number): number {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
}

export type ProfileGap = 'sex' | 'age' | 'height' | 'weight' | 'under18';

/** What's still missing before targets can be worked out, in the order to ask for it. */
export function profileGaps(profile: Profile, weightKg: number | null, now = new Date()): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  const age = ageOf(profile.birthYear, now);
  if (!profile.sex) gaps.push('sex');
  if (age == null) gaps.push('age');
  else if (age < 18) gaps.push('under18');
  if (!profile.heightCm) gaps.push('height');
  if (!weightKg) gaps.push('weight');
  return gaps;
}

export interface Worked {
  kcal: Range;
  protein: Range;
  carbs: Range;
  fat: Range;
  /** The steps, for showing how the numbers came about. */
  steps: { resting: number; factor: number; daily: number; aimKcal: number; extraKcal: number; centre: number };
  lowWarning: boolean;
}

const r10 = (n: number) => Math.round(n / 10) * 10;
const r1 = (n: number) => Math.round(n);

/** Fat and carb bands that fit a calorie target and protein band. */
export function splitRest(kcalCentre: number, protein: Range): { carbs: Range; fat: Range } {
  const fat = { low: r1((kcalCentre * FAT_SHARE.low) / 9), high: r1((kcalCentre * FAT_SHARE.high) / 9) };
  const carbs = {
    low: Math.max(0, r1((kcalCentre - protein.high * 4 - fat.high * 9) / 4)),
    high: Math.max(0, r1((kcalCentre - protein.low * 4 - fat.low * 9) / 4)),
  };
  return { carbs, fat };
}

/** Targets from the profile, or null while something is missing. */
export function workOut(profile: Profile, weightKg: number | null, now = new Date()): Worked | null {
  if (profileGaps(profile, weightKg, now).length) return null;
  const sex = profile.sex!;
  const age = ageOf(profile.birthYear, now)!;
  const kg = weightKg!;
  const factor = ACTIVITIES.find((a) => a.id === profile.activity)?.factor ?? 1.55;
  const resting = restingEnergy(sex, kg, profile.heightCm!, age);
  const daily = resting * factor;
  // No losing or gaining on purpose while pregnant or breastfeeding.
  const aim = isPregnantOrFeeding(profile.stage) ? 'maintain' : profile.aim;
  const aimKcal = aim === 'maintain' ? 0 : ((aim === 'lose' ? -1 : 1) * profile.pace * KCAL_PER_KG) / 7;
  const extraKcal = sex === 'female' ? EXTRA_KCAL[profile.stage] : 0;
  const centre = r10(daily + aimKcal + extraKcal);
  const extraProtein = sex === 'female' ? EXTRA_PROTEIN[profile.stage] : 0;
  const protein = { low: r1(kg * PROTEIN_PER_KG.low + extraProtein), high: r1(kg * PROTEIN_PER_KG.high + extraProtein) };
  return {
    kcal: { low: centre - KCAL_BAND, high: centre + KCAL_BAND },
    protein,
    ...splitRest(centre, protein),
    steps: { resting, factor, daily, aimKcal, extraKcal, centre },
    lowWarning: centre < KCAL_FLOOR[sex],
  };
}

export type Source = 'worked' | 'yours' | 'typed';

export interface InUse {
  targets: Record<MacroKey, Range>;
  /** worked = from the profile; yours = typed over a worked-out one; typed = typed while there's no profile yet. */
  source: Record<MacroKey, Source>;
  worked: Worked | null;
}

const KEYS: MacroKey[] = ['kcal', 'protein', 'carbs', 'fat'];

/**
 * The targets the app judges days against. With a complete profile, the worked-out ones,
 * except any the user typed their own over. Without one, the typed calories and protein,
 * with carbs and fat fitted around them.
 */
export function targetsInUse(plan: Plan, now = new Date()): InUse {
  const worked = workOut(plan.profile, latestWeight(plan), now);
  const t = plan.targets;
  const base: Record<MacroKey, Range> = worked
    ? { kcal: worked.kcal, protein: worked.protein, carbs: worked.carbs, fat: worked.fat }
    : (() => {
        const centre = (t.kcal.low + t.kcal.high) / 2;
        return { kcal: t.kcal, protein: t.protein, ...splitRest(centre, t.protein) };
      })();
  const targets = {} as Record<MacroKey, Range>;
  const source = {} as Record<MacroKey, Source>;
  for (const k of KEYS) {
    const typedWithoutProfile = !worked && (k === 'kcal' || k === 'protein');
    if (t.custom[k]) {
      targets[k] = t[k];
      source[k] = worked ? 'yours' : 'typed';
    } else {
      targets[k] = base[k];
      source[k] = typedWithoutProfile ? 'typed' : 'worked';
    }
  }
  return { targets, source, worked };
}
