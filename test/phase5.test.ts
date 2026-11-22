import { describe, expect, it } from 'vitest';
import type { Entry, Food, Plan, Recipe } from '../src/lib/types';
import { emptyPlan, normalize } from '../src/lib/migrate';
import { addDays, daysBetween, rangeText, weekDates, weekday, weekStartOf, dayTitle } from '../src/lib/dates';
import { applyTemplate, copyWeek, ensureDay, saveTemplate, weekIsEmpty } from '../src/lib/weeks';
import { anyEaten, dayNut } from '../src/lib/calc';
import { planBatches, prepDayFor } from '../src/lib/batches';
import { dayCost, entryCost, foodCost, shoppingList } from '../src/lib/shopping';
import { aisleFromOff, aisleFromUsda } from '../src/lib/aisles';
import { money } from '../src/lib/money';
import { amountText } from '../src/lib/units';

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
    food('beef', 250, { aisle: 'meat', pack: { size: 500, price: 20 } }),
    food('rice', 360, { aisle: 'grains', pack: { size: 1000, price: 8 } }),
    food('egg', 143, { aisle: 'dairy', measures: [{ id: 'm-egg', name: 'egg', size: 60 }], countBy: 'm-egg', pack: { size: 600, price: 9 } }),
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

describe('batches', () => {
  it('cooks when first needed; leftovers fill the next meal', () => {
    const p = setup();
    // One pot is two dinners: Mon and Tue share one, Wed and Thu the next.
    for (let i = 0; i < 4; i++) ensureDay(p, day(i)).meals.dinner.push(entry('r:pot', 1));
    const b = planBatches(p, MON, day(6));
    expect(b.map((x) => [x.cookDate, x.batches, x.uses.map((u) => u.date)])).toEqual([
      [MON, 1, [MON, day(1)]],
      [day(2), 1, [day(2), day(3)]],
    ]);
    expect(b.every((x) => x.spare === 0 && !x.late.length)).toBe(true);
  });

  it('doesn’t stretch leftovers past how long they keep', () => {
    const p = setup();
    p.settings.fridgeDays = 2;
    ensureDay(p, day(0)).meals.dinner.push(entry('r:pot', 1));
    ensureDay(p, day(3)).meals.dinner.push(entry('r:pot', 1));
    const b = planBatches(p, MON, day(6));
    expect(b.map((x) => x.cookDate)).toEqual([day(0), day(3)]);
    expect(b[0].spare).toBe(1);
  });

  it('makes enough batches for a big meal', () => {
    const p = setup();
    ensureDay(p, MON).meals.dinner.push(entry('r:pot', 3));
    const [b] = planBatches(p, MON, MON);
    expect(b).toMatchObject({ batches: 2, made: 4, spare: 1 });
  });

  it('carries a pot cooked last Sunday into Monday', () => {
    const p = setup();
    ensureDay(p, day(-1)).meals.dinner.push(entry('r:pot', 1));
    ensureDay(p, MON).meals.dinner.push(entry('r:pot', 1));
    const b = planBatches(p, MON, day(6));
    expect(b).toHaveLength(1);
    expect(b[0].cookDate).toBe(day(-1));
  });

  it('cooks on prep days when they’re set, and flags meals past the leftovers limit', () => {
    const p = setup();
    p.settings.prepDays = [0, 3]; // Sunday and Wednesday
    expect(prepDayFor('2026-11-17', [0, 3])).toBe('2026-11-15');
    expect(prepDayFor('2026-11-18', [0, 3])).toBe('2026-11-18');
    for (let i = 0; i < 7; i++) ensureDay(p, day(i)).meals.dinner.push(entry('r:pot', 1));
    const b = planBatches(p, MON, day(6));
    // Sun 15 covers Mon–Tue (2 servings, 1 batch); Wed 18 covers Wed–Sat (4 = 2 batches); Sun 22 covers Sun.
    expect(b.map((x) => [x.cookDate, x.batches, x.uses.length])).toEqual([
      ['2026-11-15', 1, 2],
      ['2026-11-18', 2, 4],
      ['2026-11-22', 1, 1],
    ]);
    expect(b[1].late.map((u) => u.date)).toEqual([]); // Saturday is 3 days after Wednesday: still fine
    p.settings.fridgeDays = 2;
    expect(planBatches(p, MON, day(6))[1].late.map((u) => u.date)).toEqual(['2026-11-21']);
  });

  it('leaves out swapped meals and unplanned extras', () => {
    const p = setup();
    ensureDay(p, MON).meals.dinner.push(entry('r:pot', 1, { skipped: true }), entry('r:pot', 1, { extra: true, eaten: true }));
    expect(planBatches(p, MON, MON)).toEqual([]);
  });
});

describe('shopping list', () => {
  it('buys whole batches, counted foods in pieces, and whole packs', () => {
    const p = setup();
    for (let i = 0; i < 3; i++) ensureDay(p, day(i)).meals.dinner.push(entry('r:pot', 1)); // 2 pots (4 servings) for 3 dinners
    ensureDay(p, MON).meals.breakfast.push(entry('f:egg', 3, { measure: 'm-egg' }), entry('f:oats', 90));
    ensureDay(p, MON).supps.push('d3');
    const { items, batches } = shoppingList(p, MON, day(6));
    expect(batches.map((b) => b.batches)).toEqual([1, 1]);
    const by = Object.fromEntries(items.map((i) => [i.food.id, i]));
    expect(Object.keys(by).sort()).toEqual(['beef', 'egg', 'oats', 'rice']); // no supplements
    expect(by.beef).toMatchObject({ base: 1400, aisle: 'meat', packs: 3, cost: 60 });
    expect(by.rice).toMatchObject({ base: 600, packs: 1, cost: 8 });
    expect(amountText(by.egg.food, by.egg.base / 60, 'm-egg', 'metric')).toBe('3 eggs');
    expect(by.egg).toMatchObject({ packs: 1, cost: 9 });
    expect(by.oats).toMatchObject({ base: 90, aisle: 'other', packs: null, cost: null });
  });

  it('only buys for batches cooked inside the dates', () => {
    const p = setup();
    ensureDay(p, day(-1)).meals.dinner.push(entry('r:pot', 1));
    ensureDay(p, MON).meals.dinner.push(entry('r:pot', 1)); // leftover from Sunday's pot
    expect(shoppingList(p, MON, day(6)).items).toEqual([]);
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

describe('aisles', () => {
  it('guesses from USDA food groups, minding canned and frozen', () => {
    expect(aisleFromUsda('Dairy and Egg Products')).toBe('dairy');
    expect(aisleFromUsda('Vegetables and Vegetable Products', 'Tomatoes, red, ripe, canned')).toBe('tins');
    expect(aisleFromUsda('Vegetables and Vegetable Products', 'Peas, green, frozen')).toBe('frozen');
    expect(aisleFromUsda('Nonsense')).toBe('other');
  });
  it('guesses from Open Food Facts categories, most telling first', () => {
    expect(aisleFromOff(['en:plant-based-foods', 'en:vegetables', 'en:canned-foods', 'en:canned-vegetables'])).toBe('tins');
    expect(aisleFromOff(['en:dairies', 'en:fermented-milk-products', 'en:cheeses'])).toBe('dairy');
    expect(aisleFromOff(['en:frozen-foods', 'en:vegetables'])).toBe('frozen');
    expect(aisleFromOff(['en:snacks', 'en:sweet-snacks', 'en:chocolates'])).toBe('snacks');
    expect(aisleFromOff(undefined)).toBe('other');
  });
});
