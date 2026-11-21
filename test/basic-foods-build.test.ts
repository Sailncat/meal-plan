import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain JS build script, no types
import { buildFromCsvDir, parseCsv, NUTRIENTS } from '../scripts/basic-foods/build.mjs';

const dir = fileURLToPath(new URL('./fixtures/sr-mini', import.meta.url));

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });
  it('handles a newline inside quotes and no trailing newline', () => {
    expect(parseCsv('"one\ntwo",3')).toEqual([['one\ntwo', '3']]);
  });
});

describe('basic foods build', () => {
  const data = buildFromCsvDir(dir);
  const byName = (name: string) => data.foods.find((f: unknown[]) => f[1] === name);
  const val = (food: unknown[], key: string) => (food[3] as (number | null)[])[data.keys.indexOf(key)];

  it('lists keys in the declared order', () => {
    expect(data.keys).toEqual(NUTRIENTS.map((n: unknown[]) => n[0]));
    expect(data.license).toMatch(/CC0/);
  });

  it('drops baby foods and foods with no calories, sorts by name', () => {
    expect(data.foods.map((f: unknown[]) => f[1])).toEqual(['Bananas, raw', 'Egg, whole, raw, fresh']);
  });

  it('maps nutrients, converts sodium to salt, leaves gaps as null', () => {
    const egg = byName('Egg, whole, raw, fresh');
    expect(egg[0]).toBe(171287);
    expect(egg[2]).toBe('Dairy and Egg Products');
    expect(val(egg, 'kcal')).toBe(143);
    expect(val(egg, 'protein')).toBe(12.6);
    expect(val(egg, 'satfat')).toBe(3.13);
    expect(val(egg, 'salt')).toBe(0.355); // 142 mg sodium × 2.5
    expect(val(egg, 'vitD')).toBe(2);
    expect(val(egg, 'vitC')).toBeNull();
  });

  it('keeps up to five portions in order, skips weight units, divides by amount', () => {
    const egg = byName('Egg, whole, raw, fresh');
    expect(egg[4]).toEqual([
      ['cup', 243],
      ['large', 50],
      ['extra large', 56],
      ['jumbo', 63],
      ['medium', 44],
    ]);
    const banana = byName('Bananas, raw');
    expect(banana[4]).toEqual([
      ['cup, mashed', 225],
      ['medium', 118],
      ['large', 136],
    ]);
  });

  it('refuses a release whose units have changed', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sr-bad-'));
    cpSync(dir, tmp, { recursive: true });
    const path = join(tmp, 'nutrient.csv');
    writeFileSync(path, readFileSync(path, 'utf8').replace('"Sodium, Na","MG"', '"Sodium, Na","G"'));
    expect(() => buildFromCsvDir(tmp)).toThrow(/307 \(salt\) is in G, expected MG/);
  });
});
