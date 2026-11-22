// Batch cooking worked out from the plan: which recipes to cook on which day, how many batches, and which meals
// each batch covers. Nothing here is stored; it follows the plan as it changes.

import type { Plan, Recipe } from './types';
import { recipeById, servingsOf } from './calc';
import { addDays, daysBetween, weekday } from './dates';
import { num } from './num';

/** One planned meal of a recipe. */
export interface Use {
  date: string;
  slotId: string;
  entryId: string;
  /** Servings this batch gives that meal (a meal can be split across two batches). */
  servings: number;
}

export interface Batch {
  recipe: Recipe;
  cookDate: string;
  /** How many times the recipe is made. */
  batches: number;
  /** Servings made: batches × the recipe's servings. */
  made: number;
  uses: Use[];
  /** Servings made but not planned. */
  spare: number;
  /** Meals planned more days after cooking than leftovers keep (only possible with fixed prep days). */
  late: Use[];
}

const EPS = 1e-9;

/** Every planned recipe meal from `from` to `to`, in eating order: by date, then by meal slot. */
export function recipeUses(plan: Plan, from: string, to: string): { recipeId: string; use: Use }[] {
  const out: { recipeId: string; use: Use }[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = plan.days[date];
    if (!day) continue;
    for (const s of plan.slots) {
      for (const e of day.meals[s.id] ?? []) {
        if (!e.ref.startsWith('r:') || e.extra || e.skipped || !(num(e.amount) > 0)) continue;
        out.push({ recipeId: e.ref.slice(2), use: { date, slotId: s.id, entryId: e.id, servings: num(e.amount) } });
      }
    }
  }
  return out;
}

/** The latest prep day on or before `date`. */
export function prepDayFor(date: string, prepDays: number[]): string {
  for (let back = 0; back < 7; back++) {
    const d = addDays(date, -back);
    if (prepDays.includes(weekday(d))) return d;
  }
  return date;
}

const newBatch = (recipe: Recipe, cookDate: string, need: number): Batch => {
  const per = servingsOf(recipe);
  const batches = Math.max(1, Math.ceil(need / per - EPS));
  return { recipe, cookDate, batches, made: batches * per, uses: [], spare: 0, late: [] };
};

/**
 * Batches covering the meals from `from` to `to`. Cooking can start before `from`: leftovers from a pot made a
 * day or two earlier still feed this week, so the look-back is as long as leftovers keep.
 *
 * Without prep days, a batch is cooked the day it's first eaten and its leftovers fill the next meals of that
 * recipe while they keep. With prep days, each meal is cooked on the latest prep day before it.
 */
export function planBatches(plan: Plan, from: string, to: string): Batch[] {
  const { prepDays, fridgeDays } = plan.settings;
  const lookBack = prepDays.length ? 6 : fridgeDays;
  const uses = recipeUses(plan, addDays(from, -lookBack), to);
  const batches: Batch[] = [];

  if (!prepDays.length) {
    const open = new Map<string, { batch: Batch; left: number }>();
    for (const { recipeId, use } of uses) {
      const recipe = recipeById(plan, recipeId);
      if (!recipe) continue;
      let need = use.servings;
      const o = open.get(recipeId);
      if (o && o.left > EPS && daysBetween(o.batch.cookDate, use.date) <= fridgeDays) {
        const take = Math.min(need, o.left);
        o.batch.uses.push({ ...use, servings: take });
        o.left -= take;
        need -= take;
      }
      if (need > EPS) {
        const batch = newBatch(recipe, use.date, need);
        batch.uses.push({ ...use, servings: need });
        batches.push(batch);
        open.set(recipeId, { batch, left: batch.made - need });
      }
    }
  } else {
    const groups = new Map<string, { recipe: Recipe; cookDate: string; uses: Use[] }>();
    for (const { recipeId, use } of uses) {
      const recipe = recipeById(plan, recipeId);
      if (!recipe) continue;
      const cookDate = prepDayFor(use.date, prepDays);
      const key = `${recipeId}|${cookDate}`;
      if (!groups.has(key)) groups.set(key, { recipe, cookDate, uses: [] });
      groups.get(key)!.uses.push(use);
    }
    for (const g of groups.values()) {
      const need = g.uses.reduce((t, u) => t + u.servings, 0);
      const batch = newBatch(g.recipe, g.cookDate, need);
      batch.uses = g.uses;
      batch.late = g.uses.filter((u) => daysBetween(g.cookDate, u.date) > fridgeDays);
      batches.push(batch);
    }
  }

  for (const b of batches) b.spare = Math.max(0, b.made - b.uses.reduce((t, u) => t + u.servings, 0));
  // Only batches that feed a meal in the range matter here.
  return batches
    .filter((b) => b.uses.some((u) => u.date >= from && u.date <= to))
    .sort((a, b) => a.cookDate.localeCompare(b.cookDate) || a.recipe.name.localeCompare(b.recipe.name));
}
