import { describe, expect, it } from 'vitest';
import type { Food } from '../src/lib/types';
import { emptyPlan, normalize, toPlan } from '../src/lib/migrate';
import { dayNut, lineNut } from '../src/lib/calc';
import {
  amountText,
  baseAmount,
  convertAmount,
  fmtQty,
  fromEnergy,
  fromShown,
  measuresOf,
  plural,
  toEnergy,
  toShown,
} from '../src/lib/units';

const egg: Food = {
  id: 'egg',
  name: 'Egg',
  unit: 'g',
  per: 60,
  nut: { kcal: 86, protein: 7.5 },
  note: '',
  supplement: false,
  measures: [{ id: 'm-egg', name: 'egg', size: 60 }],
  countBy: 'm-egg',
};
const milk: Food = { id: 'milk', name: 'Milk', unit: 'ml', per: 100, nut: { kcal: 50 }, note: '', supplement: false, measures: [], countBy: null };
const tablet: Food = { id: 'd3', name: 'Vitamin D', unit: 'tablet', per: 1, nut: { vitD: 50 }, note: '', supplement: true, measures: [], countBy: null };

describe('counting in pieces', () => {
  it('turns pieces into their weight', () => {
    expect(baseAmount(egg, 3, 'm-egg')).toBe(180);
    expect(baseAmount(egg, 180, null)).toBe(180);
    expect(baseAmount(egg, 0.5, 'm-egg')).toBe(30);
  });

  it('works out nutrition the same whether counted or weighed', () => {
    const p = emptyPlan();
    p.foods.push(egg);
    expect(lineNut(p, { food: 'egg', amount: 3, measure: 'm-egg' }, 'kcal')).toBeCloseTo(258, 6);
    expect(lineNut(p, { food: 'egg', amount: 180, measure: null }, 'kcal')).toBeCloseTo(258, 6);
  });

  it('converts an amount between units without changing how much it is', () => {
    expect(convertAmount(egg, 4, 'm-egg', null)).toBe(240);
    expect(convertAmount(egg, 150, null, 'm-egg')).toBe(2.5);
    expect(convertAmount(egg, null, null, 'm-egg')).toBeNull();
  });

  it('gives liquids tsp, tbsp and cup for free', () => {
    expect(measuresOf(milk).map((m) => m.name)).toEqual(['tsp', 'tbsp', 'cup']);
    expect(baseAmount(milk, 2, '@tbsp')).toBe(30);
    expect(measuresOf(egg).map((m) => m.name)).toEqual(['egg']);
  });

  it('keeps a liquid’s own measure instead of a built-in one with the same name', () => {
    const oil = { ...milk, measures: [{ id: 'own', name: 'tbsp', size: 13.5 }] };
    expect(measuresOf(oil).filter((m) => m.name === 'tbsp')).toHaveLength(1);
  });
});

describe('words', () => {
  it('pluralises sensibly', () => {
    expect(plural('egg', 3)).toBe('eggs');
    expect(plural('egg', 1)).toBe('egg');
    expect(plural('medium onion', 2)).toBe('medium onions');
    expect(plural('peach', 2)).toBe('peaches');
    expect(plural('berry', 2)).toBe('berries');
    expect(plural('tbsp', 3)).toBe('tbsp');
    expect(plural('g', 200)).toBe('g');
  });

  it('shows halves and quarters as fractions', () => {
    expect(fmtQty(1.5)).toBe('1½');
    expect(fmtQty(0.5)).toBe('½');
    expect(fmtQty(2)).toBe('2');
    expect(fmtQty(1.36)).toBe('1.36');
  });

  it('writes amounts the way people say them', () => {
    expect(amountText(egg, 3, 'm-egg', 'metric')).toBe('3 eggs');
    expect(amountText(egg, 200, null, 'metric')).toBe('200 g');
    expect(amountText(egg, 200, null, 'imperial')).toBe('7.1 oz');
    expect(amountText(milk, 250, null, 'imperial')).toBe('8.5 fl oz');
    expect(amountText(tablet, 2, null, 'metric')).toBe('2 tablets');
    expect(amountText(tablet, 1, null, 'imperial')).toBe('1 tablet');
  });
});

describe('metric and imperial', () => {
  it('converts grams to ounces and back exactly', () => {
    expect(toShown('g', 28.349523125, 'imperial')).toBeCloseTo(1, 10);
    expect(fromShown('g', toShown('g', 700, 'imperial'), 'imperial')).toBeCloseTo(700, 10);
  });
  it('uses US fluid ounces', () => {
    expect(toShown('ml', 236.5882365, 'imperial')).toBeCloseTo(8, 10); // a US cup is 8 fl oz
  });
  it('offers the US cup in US mode and the metric cup otherwise', () => {
    expect(measuresOf(milk, 'imperial').find((m) => m.name === 'cup')!.size).toBeCloseTo(236.588, 3);
    expect(measuresOf(milk, 'metric').find((m) => m.name === 'cup')!.size).toBe(250);
  });
  it('keeps an amount saved in either cup the same size whichever mode is on', () => {
    expect(baseAmount(milk, 1, '@cup')).toBe(250);
    expect(baseAmount(milk, 1, '@uscup')).toBeCloseTo(236.588, 3);
    expect(amountText(milk, 2, '@cup', 'imperial')).toBe('2 metric cups');
    expect(amountText(milk, 2, '@uscup', 'metric')).toBe('2 US cups');
    expect(amountText(milk, 2, '@uscup', 'imperial')).toBe('2 cups');
  });
  it('leaves metric and counting words alone', () => {
    expect(toShown('g', 100, 'metric')).toBe(100);
    expect(toShown('tablet', 2, 'imperial')).toBe(2);
  });
  it('converts kcal and kJ', () => {
    const kj = { system: 'metric', energy: 'kJ' } as const;
    expect(toEnergy(100, kj)).toBeCloseTo(418.4, 6);
    expect(fromEnergy(418.4, kj)).toBeCloseTo(100, 6);
    expect(toEnergy(100, { system: 'metric', energy: 'kcal' })).toBe(100);
  });
});

describe('loading plans with units', () => {
  it('gives older plans default settings and no measures', () => {
    const p = normalize({ app: 'meal-plan', foods: [{ id: 'a', name: 'Rice' }] });
    expect(p.settings).toEqual({ system: 'metric', energy: 'kcal', country: 'en:poland', weekStart: 1, currency: 'PLN' });
    expect(p.foods[0].measures).toEqual([]);
    expect(p.foods[0].countBy).toBeNull();
  });

  it('drops a unit that no longer exists, falling back to the base unit', () => {
    const raw: any = emptyPlan();
    raw.foods = [{ ...egg, countBy: 'gone' }];
    raw.recipes = [{ id: 'r', name: 'Eggs', servings: 1, lines: [{ food: 'egg', amount: 2, measure: 'gone' }] }];
    raw.days = { '2026-11-16': { meals: { breakfast: [{ id: 'e', ref: 'f:egg', amount: 2, measure: 'm-egg' }] }, supps: [] } };
    const p = normalize(JSON.parse(JSON.stringify(raw)));
    expect(p.foods[0].countBy).toBeNull();
    expect(p.recipes[0].lines[0].measure).toBeNull();
    expect(p.days['2026-11-16'].meals.breakfast[0].measure).toBe('m-egg');
    expect(dayNut(p, p.days['2026-11-16'], 'kcal')).toBeCloseTo(172, 6);
  });

  it('keeps settings through a save and reload', () => {
    const p = emptyPlan();
    p.settings = { system: 'imperial', energy: 'kJ', country: 'en:ireland', weekStart: 0, currency: 'EUR' };
    expect(toPlan(JSON.parse(JSON.stringify(p))).settings).toEqual({ system: 'imperial', energy: 'kJ', country: 'en:ireland', weekStart: 0, currency: 'EUR' });
    const bad = toPlan({ ...JSON.parse(JSON.stringify(p)), settings: { weekStart: 5, prepDays: [2], fridgeDays: 40, currency: 'XYZ' } }).settings;
    expect(bad).toEqual({ system: 'metric', energy: 'kcal', country: 'en:poland', weekStart: 1, currency: 'PLN' }); // old cooking settings are dropped
  });
});

describe('body weight and height', async () => {
  const { weightText, cmToFtIn, ftInToCm, kgToShown, shownToKg } = await import('../src/lib/units');
  it('shows kg, or lb in US units', () => {
    expect(weightText(80, 'metric')).toBe('80.0 kg');
    expect(weightText(80, 'imperial')).toBe('176.4 lb');
    expect(shownToKg(kgToShown(80, 'imperial'), 'imperial')).toBeCloseTo(80, 10);
  });
  it('converts height', () => {
    expect(cmToFtIn(183)).toEqual({ ft: 6, inch: 0 });
    expect(cmToFtIn(170)).toEqual({ ft: 5, inch: 7 });
    expect(ftInToCm(5, 11)).toBeCloseTo(180.34, 2);
  });
});

describe('supplement-only totals', async () => {
  const { dayNutWhere, dayNut } = await import('../src/lib/calc');
  it('counts only supplements when asked, through recipes too', () => {
    const p = emptyPlan();
    p.foods.push(milk, tablet);
    p.recipes.push({ id: 'r', name: 'Drink', servings: 2, notes: '', lines: [{ food: 'd3', amount: 2, measure: null }, { food: 'milk', amount: 200, measure: null }] });
    const day = { meals: { breakfast: [{ id: 'e', ref: 'r:r', amount: 1, measure: null }] }, supps: ['d3'], suppsTaken: [] };
    const supps = dayNutWhere(p, day, 'vitD', (f) => f.supplement);
    expect(supps).toBeCloseTo(50 + 50, 6); // ticked tablet + half of the recipe's 2 tablets
    expect(dayNut(p, day, 'vitD')).toBeCloseTo(100, 6);
  });
});
