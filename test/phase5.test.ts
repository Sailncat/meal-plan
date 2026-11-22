import { describe, expect, it } from 'vitest';
import type { Entry, Food, Plan, Recipe } from '../src/lib/types';
import { emptyPlan, normalize } from '../src/lib/migrate';
import { addDays, daysBetween, rangeText, weekDates, weekday, weekStartOf, dayTitle } from '../src/lib/dates';
import { applyTemplate, copyWeek, ensureDay, saveTemplate, weekIsEmpty } from '../src/lib/weeks';
import { anyEaten, dayNut } from '../src/lib/calc';
import { dayCost, entryCost, foodCost } from '../src/lib/costs';
import { money } from '../src/lib/money';

// Week of Monday 16 Nov 2026.
const MON = '2026-11-16';
const day = (n: number) => addDays(MON, n);

const food = (id: string, kcal: number, over: Partial<Food> = {}): Food => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  unit: 'g',
  per: 100,
  nut: { kcal, protein: 10 },
  note: '',
  supplement: false,
  measures: [],
  countBy: null,
  ...over,
});
let n = 0;
const entry = (ref: string, amount: number, over: Partial<Entry> = {}): Entry => ({ id: 'e' + ++n, ref, amount, measure: null, ...over });

function setup(): Plan {
  const p = emptyPlan();
  p.foods.push(
    food('beef', 250, { pack: { size: 500, price: 20 } }),
    food('rice', 360, { pack: { size: 1000, price: 8 } }),
    food('egg', 143, { measures: [{ id: 'm-egg', name: 'egg', size: 60 }], countBy: 'm-egg', pack: { size: 600, price: 9 } }),
    food('oats', 380),
    food('d3', 0, { unit: 'tablet', per: 1, supplement: true, nut: { vitD: 50 } }),
  );
  const pot: Recipe = {
    id: 'pot',
    name: 'Beef & rice pot',
    servings: 2,
    notes: '',
    lines: [
      { food: 'beef', amount: 700, measure: null },
      { food: 'rice', amount: 300, measure: null },
    ],
  };
  p.recipes.push(pot);
  return p;
}

describe('dates', () => {
  it('does day maths without time zones getting in the way', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // across the clocks going back
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-16', '2026-11-20')).toBe(4);
    expect(weekday('2026-11-22')).toBe(0); // Sunday
  });
  it('finds weeks starting Monday or Sunday', () => {
    expect(weekStartOf('2026-11-22', 1)).toBe('2026-11-16');
    expect(weekStartOf('2026-11-22', 0)).toBe('2026-11-22');
    expect(weekDates('2026-11-18', 1)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  });
  it('writes dates and ranges', () => {
    expect(dayTitle('2026-11-22')).toBe('Sunday 22 Nov');
    expect(rangeText('2026-11-16', '2026-11-22')).toBe('16 – 22 Nov');
    expect(rangeText('2026-11-30', '2026-12-06')).toBe('30 Nov – 6 Dec');
    expect(rangeText('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
  });
});

describe('weeks', () => {
  const week = weekDates(MON, 1);
  const next = weekDates(addDays(MON, 7), 1);

  it('copies last week’s plan, leaving what was eaten and swapped behind', () => {
    const p = setup();
    const d = ensureDay(p, MON);
    d.meals.dinner.push(entry('r:pot', 1, { eaten: true, skipped: true }), entry('f:oats', 80, { extra: true, eaten: true, swapOf: 'x' }));
    d.supps = ['d3'];
    d.suppsTaken = ['d3'];
    expect(weekIsEmpty(p, next)).toBe(true);
    copyWeek(p, week, next);
    const copy = p.days[next[0]];
    expect(copy.meals.dinner).toHaveLength(1);
    expect(copy.meals.dinner[0]).toMatchObject({ ref: 'r:pot', amount: 1 });
    expect(copy.meals.dinner[0].eaten).toBeUndefined();
    expect(copy.meals.dinner[0].skipped).toBeUndefined();
    expect(copy.meals.dinner[0].id).not.toBe(d.meals.dinner[0].id);
    expect(copy.supps).toEqual(['d3']);
    expect(copy.suppsTaken).toEqual([]);
    expect(Object.keys(p.days).sort()).toEqual([MON, next[0]]); // empty days aren't stored
  });

  it('saves a week as a template and fills another week from it, by weekday', () => {
    const p = setup();
    ensureDay(p, day(2)).meals.breakfast.push(entry('f:oats', 90)); // Wednesday
    const t = saveTemplate(p, '  Cutting week ', week);
    expect(t.name).toBe('Cutting week');
    // A Sunday-first week still gets the oats on Wednesday.
    const sundayWeek = weekDates('2026-11-29', 0);
    applyTemplate(p, t, sundayWeek);
    expect(Object.keys(p.days).filter((d) => sundayWeek.includes(d))).toEqual(['2026-12-02']);
    expect(weekday('2026-12-02')).toBe(3);
  });

  it('survives a save and reload with templates, ticks and swaps', () => {
    const p = setup();
    const d = ensureDay(p, MON);
    const planned = entry('r:pot', 1, { skipped: true });
    d.meals.dinner.push(planned, entry('f:oats', 80, { extra: true, eaten: true, swapOf: planned.id }));
    saveTemplate(p, 'Base', week);
    const again = normalize(JSON.parse(JSON.stringify(p)));
    expect(again.days[MON].meals.dinner[0].skipped).toBe(true);
    expect(again.days[MON].meals.dinner[1]).toMatchObject({ extra: true, eaten: true, swapOf: planned.id });
    expect(again.templates[0].days).toHaveLength(7);
    // Remove the swap and the planned meal is no longer marked swapped.
    const raw = JSON.parse(JSON.stringify(p));
    raw.days[MON].meals.dinner.pop();
    expect(normalize(raw).days[MON].meals.dinner[0].skipped).toBeUndefined();
  });
});

describe('planned and eaten', () => {
  it('counts the plan, and separately what was eaten', () => {
    const p = setup();
    const d = ensureDay(p, MON);
    const pot = entry('r:pot', 1, { skipped: true });
    d.meals.breakfast.push(entry('f:oats', 100, { eaten: true }));
    d.meals.dinner.push(pot, entry('f:egg', 3, { measure: 'm-egg', extra: true, eaten: true, swapOf: pot.id }));
    const potKcal = (700 * 2.5 + 300 * 3.6) / 2; // 1415
    expect(dayNut(p, d, 'kcal')).toBeCloseTo(380 + potKcal, 6); // the plan, swap or not
    expect(dayNut(p, d, 'kcal', 'eaten')).toBeCloseTo(380 + 180 * 1.43, 6); // oats and the eggs eaten instead
    expect(anyEaten(d)).toBe(true);
    expect(anyEaten(undefined)).toBe(false);
  });
});

describe('costs', () => {
  it('prices what’s used, not whole packs', () => {
    const p = setup();
    expect(foodCost(p.foods[0], 250)).toBe(10);
    expect(foodCost(p.foods[3], 100)).toBeNull();
    const pot = entryCost(p, entry('r:pot', 1));
    expect(pot.total).toBeCloseTo((700 / 500) * 20 / 2 + (300 / 1000) * 8 / 2, 6); // 14 + 1.2
    expect(pot).toMatchObject({ known: true, partial: false });
    const d = ensureDay(p, MON);
    d.meals.breakfast.push(entry('f:oats', 90));
    d.meals.dinner.push(entry('r:pot', 1));
    expect(dayCost(p, d)).toMatchObject({ known: true, partial: true });
    expect(dayCost(p, d).total).toBeCloseTo(15.2, 6);
  });

  it('writes money the local way', () => {
    expect(money(12.4, 'PLN')).toBe('12.40 zł');
    expect(money(12.4, 'EUR')).toBe('€12.40');
    expect(money(1234.5, 'GBP')).toBe('£1,234.50');
    expect(money(950, 'HUF')).toBe('950 Ft');
    expect(money(3, 'CHF')).toBe('CHF 3.00');
  });
});
