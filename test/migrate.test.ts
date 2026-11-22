import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { toPlan, emptyPlan, emptyDay, normalize } from '../src/lib/migrate';
import type { Plan } from '../src/lib/types';
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

// The old undated Monday–Sunday week lands on the week holding "now": 16–22 Nov 2026 for a Wednesday.
const NOW = new Date(2026, 10, 18, 12);
const DATES = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
const W = (p: Plan) => DATES.map((d) => p.days[d] ?? emptyDay(p.slots));

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
  const plan = toPlan(v1, NOW);

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
    expect(W(plan)[2].meals.shakes).toHaveLength(1);
    expect(W(plan)[2].meals.shakes[0].amount).toBe(2);
  });

  it('drops links to deleted recipes and supplements', () => {
    expect(W(plan)[4].meals.dinner).toEqual([]);
    expect(W(plan)[3].supps).toEqual(['vitd']);
  });

  it('gives every day exactly the same totals as before, for every nutrient', () => {
    v1.week.forEach((d: any, k: number) => {
      for (const nd of ALL_NUTRIENTS) {
        expect(dayNut(plan, W(plan)[k], nd.k)).toBeCloseTo(oldDay(v1, d, nd.k), 6);
      }
    });
  });

  it('works out a known day by hand', () => {
    // Monday: oatmeal 337.5 + 150 + 106.8 = 594.3; chicken with rice 440 + 88.4 + 525 = 1053.4;
    // 2 shakes (110 + 125) × 2 = 470; 200 g cottage cheese 194; vitamin D 0. Total 2,311.7 kcal
    expect(dayNut(plan, W(plan)[0], 'kcal')).toBeCloseTo(2311.7, 6);
    expect(weekNut(plan, DATES, 'protein')).toBeGreaterThan(0);
  });

  it('survives a save and reload unchanged', () => {
    const again = toPlan(JSON.parse(JSON.stringify(plan)), new Date(2027, 0, 1));
    expect(again).toEqual(plan); // a v3 plan doesn't move, whatever the date
  });

  it('puts the old week on this week’s dates and keeps it as a template', () => {
    expect(plan.version).toBe(3);
    expect(Object.keys(plan.days).every((d) => DATES.includes(d))).toBe(true);
    expect(plan.templates).toHaveLength(1);
    expect(plan.templates[0].name).toBe('My usual week');
    for (let k = 0; k < 7; k++) expect(dayNut(plan, plan.templates[0].days[k], 'kcal')).toBeCloseTo(dayNut(plan, W(plan)[k], 'kcal'), 6);
  });

  it('knows where foods and recipes are used', () => {
    expect(foodUsedIn(plan, 'cottage')[0]).toBe('Beef wraps');
    expect(foodUsedIn(plan, 'cottage')[1]).toMatch(/^Meals on \d days?$/);
    expect(foodUsedIn(plan, 'cottage')).toContain('Saved weeks');
    // six days of oatmeal this week, and six more in the "My usual week" template made from it
    expect(recipeUseCount(plan, 'oatmeal')).toBe(12);
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
    expect(p.days).toEqual({});
    expect(p.templates).toEqual([]);
    expect(p.slots.length).toBeGreaterThan(0);
    expect(p.foods[0].per).toBe(100);
  });

  it('drops entries that point nowhere sensible', () => {
    const p = emptyPlan();
    const raw: any = JSON.parse(JSON.stringify(p));
    raw.recipes = [{ id: 'abc', name: 'Stew', servings: 2, lines: [] }];
    raw.days = {
      '2026-11-16': { meals: { breakfast: [{ ref: 'x:1', amount: 1 }, { ref: 'r:abc', amount: '2' }, { ref: 'r:gone', amount: 1 }, 'junk'] } },
      'not a date': { meals: { breakfast: [{ ref: 'r:abc', amount: 1 }] } },
      '2026-11-17': { meals: { breakfast: [{ ref: 'r:gone', amount: 1 }] } },
    };
    const clean = normalize(raw);
    expect(Object.keys(clean.days)).toEqual(['2026-11-16']); // a bad date and a day left empty are dropped
    expect(clean.days['2026-11-16'].meals.breakfast).toHaveLength(1);
    expect(clean.days['2026-11-16'].meals.breakfast[0].amount).toBe(2);
    expect(clean.days['2026-11-16'].suppsTaken).toEqual([]);
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
  const plan = toPlan(v1, NOW);
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
    const plan = toPlan(real, NOW);
    real.week.forEach((d: any, k: number) => {
      for (const nd of ALL_NUTRIENTS) expect(dayNut(plan, W(plan)[k], nd.k)).toBeCloseTo(oldDay(real, d, nd.k), 6);
    });
  });
});

describe('recipe extras in saved plans', () => {
  it('keeps steps, times, photo and source, and drops tags from earlier saves', () => {
    const p = emptyPlan();
    const saved = JSON.parse(JSON.stringify(p));
    saved.recipes = [
      { id: 'r', name: 'Oats', servings: 1, lines: [], notes: '', steps: [' Boil. ', '', 3], prepMin: '5', cookMin: 0, photo: 'data:image/jpeg;base64,AAAA', source: 'https://example.com/oats', tags: ['breakfast'] },
    ];
    const r = normalize(saved).recipes[0];
    expect(r).toEqual({ id: 'r', name: 'Oats', servings: 1, lines: [], notes: '', steps: ['Boil.'], prepMin: 5, cookMin: null, photo: 'data:image/jpeg;base64,AAAA', source: 'https://example.com/oats' });
    expect('tags' in r).toBe(false);
  });
});
