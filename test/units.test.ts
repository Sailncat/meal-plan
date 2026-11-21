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
    expect(amountText(milk, 250, null, 'imperial')).toBe('8.8 fl oz');
    expect(amountText(tablet, 2, null, 'metric')).toBe('2 tablets');
    expect(amountText(tablet, 1, null, 'imperial')).toBe('1 tablet');
  });
});

describe('metric and imperial', () => {
  it('converts grams to ounces and back exactly', () => {
    expect(toShown('g', 28.349523125, 'imperial')).toBeCloseTo(1, 10);
    expect(fromShown('g', toShown('g', 700, 'imperial'), 'imperial')).toBeCloseTo(700, 10);
  });
  it('uses UK fluid ounces', () => {
    expect(toShown('ml', 568.26125, 'imperial')).toBeCloseTo(20, 10); // a UK pint is 20 fl oz
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
    expect(p.settings).toEqual({ system: 'metric', energy: 'kcal' });
    expect(p.foods[0].measures).toEqual([]);
    expect(p.foods[0].countBy).toBeNull();
  });

  it('drops a unit that no longer exists, falling back to the base unit', () => {
    const raw: any = emptyPlan();
    raw.foods = [{ ...egg, countBy: 'gone' }];
    raw.recipes = [{ id: 'r', name: 'Eggs', servings: 1, lines: [{ food: 'egg', amount: 2, measure: 'gone' }] }];
    raw.week[0].meals.breakfast = [{ id: 'e', ref: 'f:egg', amount: 2, measure: 'm-egg' }];
    const p = normalize(JSON.parse(JSON.stringify(raw)));
    expect(p.foods[0].countBy).toBeNull();
    expect(p.recipes[0].lines[0].measure).toBeNull();
    expect(p.week[0].meals.breakfast[0].measure).toBe('m-egg');
    expect(dayNut(p, p.week[0], 'kcal')).toBeCloseTo(172, 6);
  });

  it('keeps settings through a save and reload', () => {
    const p = emptyPlan();
    p.settings = { system: 'imperial', energy: 'kJ' };
    expect(toPlan(JSON.parse(JSON.stringify(p))).settings).toEqual({ system: 'imperial', energy: 'kJ' });
  });
});
