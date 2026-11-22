// What meals and days cost, from each food's pack price.

import type { Day, Entry, Food, Plan } from './types';
import { entryTarget, foodById, servingsOf } from './calc';
import { baseAmount } from './units';
import { num } from './num';

/** What an amount of a food costs at its pack price, or null when the price isn't known. */
export function foodCost(food: Food | undefined, base: number): number | null {
  if (!food?.pack || food.pack.price == null || !(food.pack.size > 0)) return null;
  return (base / food.pack.size) * food.pack.price;
}

/** A cost added up from parts, some of which may have no price. */
export interface Cost {
  total: number;
  /** Some ingredients had no price, so the total is too low. */
  partial: boolean;
  /** At least one part had a price. */
  known: boolean;
}

const zero = (): Cost => ({ total: 0, partial: false, known: false });
function addCost(c: Cost, part: number | null) {
  if (part == null) c.partial = true;
  else {
    c.total += part;
    c.known = true;
  }
}

export function entryCost(plan: Plan, e: Entry): Cost {
  const c = zero();
  const t = entryTarget(plan, e);
  if (!t) return c;
  if (t.kind === 'food') {
    if (!t.food.supplement) addCost(c, foodCost(t.food, num(baseAmount(t.food, e.amount, e.measure))));
    return c;
  }
  const share = num(e.amount) / servingsOf(t.recipe);
  for (const l of t.recipe.lines) {
    const food = foodById(plan, l.food);
    if (!food) continue;
    const part = foodCost(food, num(baseAmount(food, l.amount, l.measure)));
    addCost(c, part == null ? null : part * share);
  }
  return c;
}

/** A day's planned food cost (supplements left out). */
export function dayCost(plan: Plan, day: Day | undefined): Cost {
  const c = zero();
  if (!day) return c;
  for (const s of plan.slots) {
    for (const e of day.meals[s.id] ?? []) {
      if (e.extra) continue;
      const part = entryCost(plan, e);
      if (part.known) addCost(c, part.total);
      if (part.partial) c.partial = true;
    }
  }
  return c;
}
