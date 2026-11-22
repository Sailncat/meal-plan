// The shopping list and food costs.

import type { AisleId, Day, Entry, Food, Plan } from './types';
import { entryTarget, foodById, servingsOf } from './calc';
import { aisleOf } from './aisles';
import { planBatches, type Batch } from './batches';
import { addDays } from './dates';
import { baseAmount } from './units';
import { num } from './num';

export interface ShopItem {
  food: Food;
  /** How much is needed, in the food's base unit. */
  base: number;
  aisle: AisleId;
  /** Whole packs to buy, when the pack size is known. */
  packs: number | null;
  /** packs × pack price, when both are known. */
  cost: number | null;
}

export interface ShopList {
  items: ShopItem[];
  /** The batches the list buys for: those cooked within the dates. */
  batches: Batch[];
}

const EPS = 1e-9;

/**
 * Everything to buy for the meals from `from` to `to`. Recipes count whole batches cooked in those dates (you
 * can't cook two-thirds of a pot); foods added straight to meals count as planned. Supplements are left out,
 * since they aren't bought week by week.
 */
export function shoppingList(plan: Plan, from: string, to: string): ShopList {
  const need = new Map<string, number>();
  const add = (food: Food | undefined, base: number) => {
    if (!food || food.supplement || !(base > 0)) return;
    need.set(food.id, (need.get(food.id) ?? 0) + base);
  };

  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = plan.days[date];
    if (!day) continue;
    for (const s of plan.slots) {
      for (const e of day.meals[s.id] ?? []) {
        if (e.extra || e.skipped || !e.ref.startsWith('f:')) continue;
        const food = foodById(plan, e.ref.slice(2));
        add(food, num(baseAmount(food, e.amount, e.measure)));
      }
    }
  }

  const batches = planBatches(plan, from, to).filter((b) => b.cookDate >= from && b.cookDate <= to);
  for (const b of batches) {
    for (const l of b.recipe.lines) {
      const food = foodById(plan, l.food);
      add(food, num(baseAmount(food, l.amount, l.measure)) * b.batches);
    }
  }

  const items: ShopItem[] = [];
  for (const [id, base] of need) {
    const food = foodById(plan, id)!;
    const packs = food.pack ? Math.max(1, Math.ceil(base / food.pack.size - EPS)) : null;
    const cost = packs != null && food.pack?.price != null ? packs * food.pack.price : null;
    items.push({ food, base, aisle: aisleOf(food), packs, cost });
  }
  items.sort((a, b) => a.food.name.localeCompare(b.food.name, 'en', { sensitivity: 'base' }));
  return { items, batches };
}

// ---------- costs ----------

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
