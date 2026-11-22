import { describe, expect, it } from 'vitest';
import { emptyPlan, normalize } from '../src/lib/migrate';
import { cleanGauges, cleanLook, DEFAULT_GAUGES, DEFAULT_LOOK, isDark, PALETTES } from '../src/lib/look';
import { gaugeSpecs } from '../src/lib/gauges';
import { readFileSync } from 'node:fs';

describe('look settings', () => {
  it('start as Crimson, following the device, normal text, roomy', () => {
    expect(emptyPlan().settings).toMatchObject({ theme: 'auto', palette: 'crimson', textSize: 'normal', density: 'roomy', gauges: DEFAULT_GAUGES });
  });

  it('fill in for plans saved before Phase 7, and reject unknown values', () => {
    const old = JSON.parse(JSON.stringify(emptyPlan()));
    delete old.settings.theme;
    delete old.settings.palette;
    delete old.settings.gauges;
    expect(normalize(old).settings).toMatchObject({ ...DEFAULT_LOOK, gauges: DEFAULT_GAUGES });
    expect(cleanLook({ theme: 'neon', palette: 'teal', textSize: 'huge', density: 'tight' })).toEqual(DEFAULT_LOOK);
    expect(cleanLook({ theme: 'dark', palette: 'plum', textSize: 'larger', density: 'compact' })).toEqual({
      theme: 'dark',
      palette: 'plum',
      textSize: 'larger',
      density: 'compact',
    });
  });

  it('works out dark mode from the theme and the device', () => {
    expect([isDark('auto', true), isDark('auto', false), isDark('light', true), isDark('dark', false)]).toEqual([true, false, false, true]);
  });

  it('has a light and a dark block in app.css for every colour set, matching the swatches', () => {
    const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
    const barOf = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return css.slice(at).match(/--bar: (#[0-9a-f]{6});/)![1];
    };
    for (const p of PALETTES) {
      const light = p.id === 'crimson' ? ':root' : `:root[data-palette='${p.id}']`;
      const dark = p.id === 'crimson' ? ":root[data-mode='dark']" : `:root[data-palette='${p.id}'][data-mode='dark']`;
      expect(barOf(light), p.id).toBe(p.light[0]);
      expect(barOf(dark), p.id).toBe(p.dark[0]);
    }
  });
});

describe('gauges', () => {
  it('keep 1 to 4 known nutrients in the list order', () => {
    expect(cleanGauges(['salt', 'kcal', 'kcal', 'vitC'])).toEqual(['kcal', 'salt']);
    expect(cleanGauges(['satfat', 'salt', 'sugar', 'fibre', 'fat'])).toEqual(['fat', 'fibre', 'sugar', 'salt']);
    expect(cleanGauges([])).toEqual(DEFAULT_GAUGES);
    expect(cleanGauges('kcal')).toEqual(DEFAULT_GAUGES);
  });

  it('judge macros by range, fibre by a goal and the rest by a limit', () => {
    const plan = emptyPlan();
    plan.settings.gauges = ['protein', 'fibre', 'sugar', 'salt'];
    const specs = gaugeSpecs(plan, new Date('2026-11-22'));
    expect(specs.map((s) => [s.key, s.kind])).toEqual([
      ['protein', 'range'],
      ['fibre', 'min'],
      ['sugar', 'max'],
      ['salt', 'max'],
    ]);
    expect(specs[0].overOk).toBe(true);
    // No profile yet: goals for a man of 25 under EU tables, sugars under 10% of the calorie target.
    expect(specs[1].low).toBe(25);
    expect(specs[3].high).toBe(5);
    const kcalMid = (plan.targets.kcal.low + plan.targets.kcal.high) / 2;
    expect(specs[2].high).toBeCloseTo((kcalMid * 0.1) / 4, 6);
  });
});
