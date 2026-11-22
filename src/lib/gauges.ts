// The gauges at the top of the day screen: which nutrients, and what each is judged against.
// The meal cards show the same nutrients.

import type { Plan } from './types';
import { referencePerson, targetsInUse } from './targets';
import { dailyCaps, dailyGoals } from './references';
import { cleanGauges, GAUGE_NAMES, type GaugeKey } from './look';

export { cleanGauges, gaugeShort, GAUGE_KEYS, GAUGE_NAMES, DEFAULT_GAUGES, MAX_GAUGES, type GaugeKey } from './look';

/**
 * range: a band to land in (calories, macros). min: a goal to reach, more is fine (fibre).
 * max: a limit to stay under (sugars, salt, saturated fat).
 */
export type GaugeKind = 'range' | 'min' | 'max';

export interface GaugeSpec {
  key: GaugeKey;
  name: string;
  kind: GaugeKind;
  low: number;
  high: number;
  /** Over the top of a range isn't a warning (protein). */
  overOk: boolean;
}

/** Each chosen gauge with its target, from the same sources as the Nutrients tab. */
export function gaugeSpecs(plan: Plan, now = new Date()): GaugeSpec[] {
  const { targets: t } = targetsInUse(plan, now);
  const person = referencePerson(plan, now).person;
  const goals = dailyGoals(plan.profile.standard, person);
  const caps = dailyCaps(person);
  return cleanGauges(plan.settings.gauges).map((key) => {
    const name = GAUGE_NAMES[key];
    if (key === 'kcal' || key === 'protein' || key === 'carbs' || key === 'fat') {
      return { key, name, kind: 'range', low: t[key].low, high: t[key].high, overOk: key === 'protein' };
    }
    if (key === 'fibre') return { key, name, kind: 'min', low: goals.fibre, high: goals.fibre, overOk: true };
    return { key, name, kind: 'max', low: 0, high: caps[key], overOk: false };
  });
}
