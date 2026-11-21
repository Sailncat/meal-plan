import { describe, expect, it } from 'vitest';
import { emptyPlan, normalize, toPlan } from '../src/lib/migrate';
import { profileGaps, restingEnergy, splitRest, targetsInUse, workOut } from '../src/lib/targets';
import { dailyCaps, dailyGoals, upperLimits } from '../src/lib/references';
import type { Profile } from '../src/lib/types';

const now = new Date('2026-11-21T12:00:00Z');
const man: Profile = { sex: 'male', birthYear: 1996, heightCm: 180, activity: 'moderate', aim: 'gain', pace: 0.25, stage: 'none', standard: 'eu' };

describe('working out targets', () => {
  it('uses Mifflin-St Jeor for resting energy', () => {
    expect(restingEnergy('male', 80, 180, 30)).toBe(1780); // 800 + 1125 − 150 + 5
    expect(restingEnergy('female', 60, 165, 28)).toBeCloseTo(1330.25, 6); // 600 + 1031.25 − 140 − 161
  });

  it('works out a man gaining slowly, by hand', () => {
    const w = workOut(man, 80, now)!;
    // 1780 × 1.55 = 2759; + 0.25 kg × 7700 / 7 = 275; 3034 → 3030
    expect(w.steps.daily).toBeCloseTo(2759, 6);
    expect(w.steps.aimKcal).toBeCloseTo(275, 6);
    expect(w.kcal).toEqual({ low: 2930, high: 3130 });
    expect(w.protein).toEqual({ low: 128, high: 176 }); // 80 × 1.6 and 80 × 2.2
    expect(w.fat).toEqual({ low: 67, high: 118 }); // 20% and 35% of 3030, ÷ 9
    // carbs = what's left: (3030 − 176×4 − 118×9) ÷ 4 = 316, (3030 − 128×4 − 67×9) ÷ 4 = 478.75
    expect(w.carbs).toEqual({ low: 316, high: 479 });
    expect(w.lowWarning).toBe(false);
  });

  it('takes a deficit for losing weight', () => {
    const w = workOut({ ...man, sex: 'female', birthYear: 1998, heightCm: 165, activity: 'light', aim: 'lose', pace: 0.5 }, 60, now)!;
    // 1330.25 × 1.375 = 1829.1; − 550 = 1279.1 → 1280
    expect(w.kcal).toEqual({ low: 1180, high: 1380 });
    expect(w.protein).toEqual({ low: 96, high: 132 });
  });

  it('warns when the calorie target is very low', () => {
    const w = workOut({ ...man, sex: 'female', birthYear: 1990, heightCm: 155, activity: 'sedentary', aim: 'lose', pace: 0.75 }, 50, now)!;
    expect(w.steps.centre).toBeLessThan(1200);
    expect(w.lowWarning).toBe(true);
  });

  it('adds pregnancy energy and protein, and never aims to lose', () => {
    const base = { ...man, sex: 'female' as const, birthYear: 1996, heightCm: 168, activity: 'light' as const, aim: 'lose' as const, pace: 0.5 };
    const notPregnant = workOut({ ...base, aim: 'maintain' }, 65, now)!;
    const second = workOut({ ...base, stage: 'pregnant2' }, 65, now)!;
    expect(second.steps.aimKcal).toBe(0);
    expect(second.steps.extraKcal).toBe(260);
    expect(second.protein.low - notPregnant.protein.low).toBe(9);
    const feeding = workOut({ ...base, stage: 'breastfeeding' }, 65, now)!;
    expect(feeding.steps.extraKcal).toBe(500);
  });

  it('says what is missing, and refuses under 18', () => {
    expect(profileGaps({ ...man, sex: null, heightCm: null }, null, now)).toEqual(['sex', 'height', 'weight']);
    expect(profileGaps({ ...man, birthYear: 2010 }, 60, now)).toEqual(['under18']);
    expect(workOut({ ...man, birthYear: 2010 }, 60, now)).toBeNull();
  });

  it('fits carbs and fat around typed calories and protein', () => {
    // fat 2000 × 20% ÷ 9 = 44.4, × 35% ÷ 9 = 77.8; carbs (2000 − 600 − 702) ÷ 4 = 174.5, (2000 − 400 − 396) ÷ 4 = 301
    expect(splitRest(2000, { low: 100, high: 150 })).toEqual({ fat: { low: 44, high: 78 }, carbs: { low: 175, high: 301 } });
  });
});

describe('which targets are in use', () => {
  it('uses typed calories and protein until the profile is filled in', () => {
    const p = emptyPlan();
    p.targets.kcal = { low: 2200, high: 2500 };
    p.targets.protein = { low: 160, high: 250 };
    const u = targetsInUse(p, now);
    expect(u.worked).toBeNull();
    expect(u.targets.kcal).toEqual({ low: 2200, high: 2500 });
    expect(u.source.kcal).toBe('typed');
    expect(u.source.carbs).toBe('worked');
  });

  it('switches to worked-out targets once the profile is complete', () => {
    const p = emptyPlan();
    p.profile = man;
    p.weights = [{ date: '2026-11-01', kg: 82 }, { date: '2026-11-20', kg: 80 }];
    const u = targetsInUse(p, now);
    expect(u.targets.kcal).toEqual({ low: 2930, high: 3130 }); // uses the latest weight, 80 kg
    expect(u.source.kcal).toBe('worked');
  });

  it('keeps any target the user typed their own over', () => {
    const p = emptyPlan();
    p.profile = man;
    p.weights = [{ date: '2026-11-20', kg: 80 }];
    p.targets.custom.protein = true;
    p.targets.protein = { low: 160, high: 250 };
    const u = targetsInUse(p, now);
    expect(u.targets.protein).toEqual({ low: 160, high: 250 });
    expect(u.source.protein).toBe('yours');
    expect(u.source.kcal).toBe('worked');
  });

  it('updates when a new weight is logged', () => {
    const p = emptyPlan();
    p.profile = man;
    p.weights = [{ date: '2026-11-20', kg: 80 }];
    const before = targetsInUse(p, now).targets.kcal.low;
    p.weights.push({ date: '2026-11-21', kg: 84 });
    // 4 kg more: resting + 40 kcal, × 1.55 = + 62; 3034 + 62 = 3096 → 3100, so the band moves up 70
    expect(targetsInUse(p, now).targets.kcal.low).toBe(before + 70);
  });
});

describe('reference values', () => {
  const person = { sex: 'male' as const, age: 30, stage: 'none' as const, kcal: 3030 };
  it('gives EFSA adult goals, scaling thiamin and niacin with energy', () => {
    const g = dailyGoals('eu', person);
    expect(g.vitA).toBe(750);
    expect(g.ca).toBe(950);
    expect(g.fe).toBe(11);
    expect(g.zn).toBe(11.7);
    expect(g.b1).toBeCloseTo(0.1 * 3030 * 0.004184, 6);
    expect(g.b3).toBeCloseTo(1.6 * 3030 * 0.004184, 6);
  });
  it('gives EFSA values for younger adults and women', () => {
    expect(dailyGoals('eu', { ...person, age: 20 }).ca).toBe(1000);
    const w = dailyGoals('eu', { ...person, sex: 'female', age: 40 });
    expect(w.fe).toBe(16);
    expect(dailyGoals('eu', { ...person, sex: 'female', age: 60 }).fe).toBe(11);
    expect(dailyGoals('eu', { ...person, sex: 'female', stage: 'breastfeeding' }).vitA).toBe(1300);
  });
  it('gives US goals by age band', () => {
    const w55 = dailyGoals('us', { ...person, sex: 'female', age: 55 });
    expect(w55.fe).toBe(8);
    expect(w55.ca).toBe(1200);
    expect(w55.b6).toBe(1.5);
    expect(w55.fibre).toBe(21);
    expect(dailyGoals('us', { ...person, age: 25 }).mg).toBe(400);
    expect(dailyGoals('us', { ...person, age: 45 }).mg).toBe(420);
    expect(dailyGoals('us', { ...person, sex: 'female', stage: 'pregnant2', age: 28 }).fe).toBe(27);
  });
  it('gives upper limits, marking supplement-only ones', () => {
    const eu = upperLimits('eu', person);
    expect(eu.vitD).toEqual({ ul: 100, supplementsOnly: false });
    expect(eu.b6.ul).toBe(12);
    expect(eu.mg.supplementsOnly).toBe(true);
    expect(eu.fe.safeLevel).toBe(true);
    const us = upperLimits('us', { ...person, age: 60 });
    expect(us.ca.ul).toBe(2000);
    expect(us.vitC.ul).toBe(2000);
  });
  it('caps salt, saturated fat and sugars', () => {
    const c = dailyCaps(person);
    expect(c.salt).toBe(5);
    expect(c.satfat).toBeCloseTo(33.67, 2);
    expect(c.sugar).toBeCloseTo(75.75, 2);
  });
});

describe('loading older plans', () => {
  it('turns the old four target numbers into ranges and adds an empty profile', () => {
    const p = normalize({ app: 'meal-plan', targets: { kcalLow: 2200, kcalHigh: 2500, proteinLow: 160, proteinHigh: 250 } });
    expect(p.targets.kcal).toEqual({ low: 2200, high: 2500 });
    expect(p.targets.protein).toEqual({ low: 160, high: 250 });
    expect(p.targets.custom).toEqual({ kcal: false, protein: false, carbs: false, fat: false });
    expect(p.profile.sex).toBeNull();
    expect(p.profile.standard).toBe('eu');
    expect(p.weights).toEqual([]);
  });
  it('keeps one weight per day, oldest first, and drops junk', () => {
    const p = normalize({
      app: 'meal-plan',
      weights: [{ date: '2026-11-20', kg: 80 }, { date: '2026-11-01', kg: 82 }, { date: 'yesterday', kg: 1 }, { date: '2026-11-20', kg: 79.5 }, { date: '2026-11-05', kg: -3 }],
    });
    expect(p.weights).toEqual([{ date: '2026-11-01', kg: 82 }, { date: '2026-11-20', kg: 79.5 }]);
  });
  it('keeps the profile through a save and reload', () => {
    const p = emptyPlan();
    p.profile = { ...man, stage: 'none', standard: 'us' };
    expect(toPlan(JSON.parse(JSON.stringify(p))).profile).toEqual(p.profile);
  });
});
