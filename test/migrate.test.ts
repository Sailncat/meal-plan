import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { toPlan, emptyPlan, normalize } from '../src/lib/migrate';
import { dayNut, weekNut, foodUsedIn, recipeUseCount } from '../src/lib/calc';
import { backupReminder } from '../src/lib/backup';
import { parseInput } from '../src/lib/num';
import { ALL_NUTRIENTS } from '../src/lib/nutrients';

// A made-up plan in the old Claude artifact's format, with its odd corners: legacy shake flags,
// a half-serving snack, eggs by count, blank amounts and links to deleted things.
const v1 = JSON.parse(readFileSync(new URL('./fixtures/v1-sample.json', import.meta.url), 'utf8'));
// Optionally also check a real exported plan kept outside the repo.
const realPath = process.env.MEAL_PLAN_REAL_FIXTURE;
const real = realPath && existsSync(realPath) ? JSON.parse(readFileSync(realPath, 'utf8')) : null;

// ---- the old artifact's own maths, copied from its code, as the reference ----
const n = (v: any) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
function oldDay(p: any, d: any, key: string): number {
  const ing = (id: string) => p.ingredients.find((i: any) => i.id === id);
  const val = (i: any, k: string) => (k === 'kcal' || k === 'protein' ? i[k] : i.n?.[k]);
  const line = (l: any) => {
    const i = ing(l.ing);
    if (!i || !n(i.per) || val(i, key) == null) return 0;
    return (n(l.amount) / n(i.per)) * n(val(i, key));
  };
  const lines = (ls: any[]) => ls.reduce((t, l) => t + line(l), 0);
  const serving = (id: string) => {
    const r = p.recipes.find((x: any) => x.id === id);
    return r ? lines(r.lines) / (n(r.servings) || 1) : 0;
  };
  let t = 0;
  for (const w of ['breakfast', 'dinner']) if (d[w]?.recipe) t += serving(d[w].recipe);
  const legacy = (d.breakfast?.shake ? 1 : 0) + (d.dinner?.shake ? 1 : 0);
  t += (d.shakes == null ? legacy : n(d.shakes)) * lines(p.shake.lines);
  for (const id of d.supps || []) {
    const i = ing(id);
    if (i) t += line({ ing: id, amount: i.per });
  }
  for (const sn of d.snacks || []) {
    if (!sn?.ref) continue;
    if (sn.ref[0] === 'r') t += serving(sn.ref.slice(2)) * n(sn.amount);
    else t += line({ ing: sn.ref.slice(2), amount: sn.amount });
  }
  return t;
}

describe('moving the old artifact plan across', () => {
  const plan = toPlan(v1);

  it('keeps every food and recipe, and turns the shake into a recipe', () => {
    expect(plan.foods).toHaveLength(v1.ingredients.length);
    expect(plan.recipes).toHaveLength(v1.recipes.length + 1);
    expect(plan.recipes.at(-1)!.name).toBe('Shake');
  });

  it('makes Breakfast, Dinner, Shakes and Snacks meals', () => {
    expect(plan.slots.map((s) => s.name)).toEqual(['Breakfast', 'Dinner', 'Shakes', 'Snacks']);
  });

  it('turns the "Supplement:" name prefix into the supplement switch', () => {
    const d3 = plan.foods.find((f) => f.id === 'vitd')!;
    expect(d3.supplement).toBe(true);
    expect(d3.name).toBe('Vitamin D3');
    expect(plan.foods.filter((f) => f.supplement)).toHaveLength(1);
  });

  it('counts the old per-meal shake flags as shakes', () => {
    expect(plan.week[2].meals.shakes).toHaveLength(1);
    expect(plan.week[2].meals.shakes[0].amount).toBe(2);
  });

  it('drops links to deleted recipes and supplements', () => {
    expect(plan.week[4].meals.dinner).toEqual([]);
    expect(plan.week[3].supps).toEqual(['vitd']);
  });

  it('gives every day exactly the same totals as before, for every nutrient', () => {
    v1.week.forEach((d: any, k: number) => {
      for (const nd of ALL_NUTRIENTS) {
        expect(dayNut(plan, plan.week[k], nd.k)).toBeCloseTo(oldDay(v1, d, nd.k), 6);
      }
    });
  });

  it('works out a known day by hand', () => {
    // Monday: oatmeal 337.5 + 150 + 106.8 = 594.3; chicken with rice 440 + 88.4 + 525 = 1053.4;
    // 2 shakes (110 + 125) × 2 = 470; 200 g cottage cheese 194; vitamin D 0. Total 2,311.7 kcal
    expect(dayNut(plan, plan.week[0], 'kcal')).toBeCloseTo(2311.7, 6);
    expect(weekNut(plan, 'protein')).toBeGreaterThan(0);
  });

  it('survives a save and reload unchanged', () => {
    const again = toPlan(JSON.parse(JSON.stringify(plan)));
    expect(again).toEqual(plan);
  });

  it('knows where foods and recipes are used', () => {
    expect(foodUsedIn(plan, 'cottage')).toEqual(['Beef wraps', 'This week’s meals']);
    expect(recipeUseCount(plan, 'oatmeal')).toBe(6);
  });
});

describe('cleaning up damaged or partial plans', () => {
  it('rejects things that are not plans', () => {
    expect(() => toPlan(null)).toThrow();
    expect(() => toPlan({ hello: 1 })).toThrow();
    expect(() => toPlan([1, 2])).toThrow();
  });

  it('fills in a plan with missing parts', () => {
    const p = normalize({ app: 'meal-plan', foods: [{ name: 'Rice' }] });
    expect(p.week).toHaveLength(7);
    expect(p.slots.length).toBeGreaterThan(0);
    expect(p.foods[0].per).toBe(100);
    expect(p.week[0].meals[p.slots[0].id]).toEqual([]);
  });

  it('drops entries that point nowhere sensible', () => {
    const p = emptyPlan();
    const raw: any = JSON.parse(JSON.stringify(p));
    raw.recipes = [{ id: 'abc', name: 'Stew', servings: 2, lines: [] }];
    raw.week[0].meals.breakfast = [{ ref: 'x:1', amount: 1 }, { ref: 'r:abc', amount: '2' }, { ref: 'r:gone', amount: 1 }, 'junk'];
    const clean = normalize(raw);
    expect(clean.week[0].meals.breakfast).toHaveLength(1);
    expect(clean.week[0].meals.breakfast[0].amount).toBe(2);
  });
});

describe('typing numbers', () => {
  it('accepts commas and dots', () => {
    expect(parseInput('1,5')).toBe(1.5);
    expect(parseInput(' 250 ')).toBe(250);
    expect(parseInput('')).toBeNull();
    expect(parseInput('abc')).toBeNull();
  });
});

describe('backup reminder', () => {
  const plan = toPlan(v1);
  const now = new Date('2026-11-21T12:00:00Z');
  it('shows when there has never been a backup', () => {
    expect(backupReminder(plan, now)).toBe(Infinity);
  });
  it('stays quiet for a week after a backup, then shows', () => {
    plan.meta.lastBackup = '2026-11-18T12:00:00Z';
    expect(backupReminder(plan, now)).toBeNull();
    plan.meta.lastBackup = '2026-11-10T12:00:00Z';
    expect(backupReminder(plan, now)).toBe(11);
  });
  it('stays quiet while snoozed', () => {
    plan.meta.backupSnoozedUntil = '2026-11-22T12:00:00Z';
    expect(backupReminder(plan, now)).toBeNull();
  });
  it('stays quiet for an empty plan', () => {
    expect(backupReminder(emptyPlan(), now)).toBeNull();
  });
});

describe.runIf(real)('a real exported plan', () => {
  it('gives every day exactly the same totals as the old artifact', () => {
    const plan = toPlan(real);
    real.week.forEach((d: any, k: number) => {
      for (const nd of ALL_NUTRIENTS) expect(dayNut(plan, plan.week[k], nd.k)).toBeCloseTo(oldDay(real, d, nd.k), 6);
    });
  });
});
