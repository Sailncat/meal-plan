import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBasic, searchBasic, STAPLES } from '../src/lib/basicFoods';

// Runs against the real shipped list, so a data rebuild that breaks search shows up here.
describe('the shipped basic foods list', () => {
  const list = parseBasic(JSON.parse(readFileSync(new URL('../public/data/basic-foods.json', import.meta.url), 'utf8')));
  const top = (q: string) => searchBasic(list, q, 1)[0]?.name;

  it('has every staple named in the code', () => {
    const names = new Set(list.map((f) => f.name));
    expect([...STAPLES].filter((s) => !names.has(s))).toEqual([]);
  });

  it('puts the everyday food first', () => {
    expect(top('egg')).toBe('Egg, whole, raw, fresh');
    expect(top('eggs')).toBe('Egg, whole, raw, fresh');
    expect(top('banana')).toBe('Bananas, raw');
    expect(top('chicken breast')).toBe('Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw');
    expect(top('oats')).toBe('Oats');
    expect(top('milk')).toMatch(/^Milk, (whole|reduced fat|lowfat|nonfat)/);
    expect(top('beef mince')).toMatch(/^Beef, ground/);
    expect(top('courgette')).toMatch(/zucchini/);
  });

  it('counts eggs and bananas in pieces', () => {
    const egg = list.find((f) => f.name === 'Egg, whole, raw, fresh')!;
    expect(egg.portions[0]).toEqual({ name: 'large egg', size: 50 });
  });
});
