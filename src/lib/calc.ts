import type { Day, Entry, Food, Plan, Recipe, RecipeLine } from './types';
import { num } from './num';
import { baseAmount } from './units';

export const foodById = (plan: Plan, id: string): Food | undefined => plan.foods.find((f) => f.id === id);
export const recipeById = (plan: Plan, id: string): Recipe | undefined => plan.recipes.find((r) => r.id === id);

/** Nutrient `key` in an amount of a food given in its base unit (g, ml or its counting word). */
export function foodNut(food: Food | undefined, base: number | null, key: string): number {
  if (!food || !num(food.per)) return 0;
  const v = food.nut[key];
  if (v == null) return 0;
  return (num(base) / num(food.per)) * num(v);
}

export function lineNut(plan: Plan, line: RecipeLine, key: string): number {
  const food = foodById(plan, line.food);
  return foodNut(food, baseAmount(food, line.amount, line.measure), key);
}

export const recipeTotal = (plan: Plan, r: Recipe, key: string) => r.lines.reduce((t, l) => t + lineNut(plan, l, key), 0);

export const servingsOf = (r: Recipe) => num(r.servings) || 1;

export const perServing = (plan: Plan, r: Recipe, key: string) => recipeTotal(plan, r, key) / servingsOf(r);

/** What an entry points at, or undefined if it was deleted. */
export function entryTarget(plan: Plan, e: Entry): { kind: 'recipe'; recipe: Recipe } | { kind: 'food'; food: Food } | undefined {
  const id = e.ref.slice(2);
  if (e.ref.startsWith('r:')) {
    const recipe = recipeById(plan, id);
    return recipe ? { kind: 'recipe', recipe } : undefined;
  }
  const food = foodById(plan, id);
  return food ? { kind: 'food', food } : undefined;
}

export function entryNut(plan: Plan, e: Entry, key: string): number {
  const t = entryTarget(plan, e);
  if (!t) return 0;
  if (t.kind === 'recipe') return perServing(plan, t.recipe, key) * num(e.amount);
  return foodNut(t.food, baseAmount(t.food, e.amount, e.measure), key);
}

/**
 * Which entries count. "plan": everything planned, including meals later swapped for something else (the plan
 * was the plan). "eaten": what was ticked off, plus what meals were swapped for.
 */
export type Count = 'plan' | 'eaten';
export const counts = (e: Entry, mode: Count) => (mode === 'plan' ? !e.extra : !!e.eaten);

export const entriesNut = (plan: Plan, entries: Entry[] | undefined, key: string, mode: Count = 'plan') =>
  (entries ?? []).reduce((t, e) => (counts(e, mode) ? t + entryNut(plan, e, key) : t), 0);

export const slotNut = (plan: Plan, day: Day, slotId: string, key: string, mode: Count = 'plan') => entriesNut(plan, day.meals[slotId], key, mode);

/** Each supplement counts one label serving (its `per` amount): planned ones for the plan, ticked ones for eaten. */
export function suppsNut(plan: Plan, day: Day, key: string, mode: Count = 'plan'): number {
  return (mode === 'plan' ? day.supps : day.suppsTaken).reduce((t, id) => {
    const f = foodById(plan, id);
    return f ? t + foodNut(f, f.per, key) : t;
  }, 0);
}

/** A day's total; only meals that still exist in the plan count. A day that isn't stored is empty. */
export function dayNut(plan: Plan, day: Day | undefined, key: string, mode: Count = 'plan'): number {
  if (!day) return 0;
  let t = suppsNut(plan, day, key, mode);
  for (const s of plan.slots) t += slotNut(plan, day, s.id, key, mode);
  return t;
}

export const weekNut = (plan: Plan, dates: string[], key: string) => dates.reduce((t, d) => t + dayNut(plan, plan.days[d], key), 0);

/** Has anything been ticked off as eaten that day? */
export const anyEaten = (day: Day | undefined) => !!day && (day.suppsTaken.length > 0 || Object.values(day.meals).some((es) => es.some((e) => e.eaten)));

/** Every food that these days' plan uses, through recipes, foods and supplements. */
export function weekFoodIds(plan: Plan, dates: string[]): Set<string> {
  const ids = new Set<string>();
  const addRecipe = (r: Recipe | undefined) => r?.lines.forEach((l) => l.food && ids.add(l.food));
  for (const date of dates) {
    const d = plan.days[date];
    if (!d) continue;
    d.supps.forEach((id) => ids.add(id));
    for (const s of plan.slots) {
      for (const e of d.meals[s.id] ?? []) {
        if (e.extra) continue;
        const t = entryTarget(plan, e);
        if (t?.kind === 'recipe') addRecipe(t.recipe);
        else if (t?.kind === 'food') ids.add(t.food.id);
      }
    }
  }
  return ids;
}

/** On how many days an entry matches. */
function daysWith(plan: Plan, match: (d: Day) => boolean) {
  return Object.values(plan.days).filter(match).length;
}

/** Where a food is used, for the Foods screen. */
export function foodUsedIn(plan: Plan, foodId: string): string[] {
  const where = plan.recipes.filter((r) => r.lines.some((l) => l.food === foodId)).map((r) => r.name || 'Unnamed recipe');
  const ref = 'f:' + foodId;
  const meals = daysWith(plan, (d) => Object.values(d.meals).some((es) => es.some((e) => e.ref === ref)));
  if (meals) where.push(`Meals on ${meals} day${meals === 1 ? '' : 's'}`);
  const supps = daysWith(plan, (d) => d.supps.includes(foodId));
  if (supps) where.push(`Supplements on ${supps} day${supps === 1 ? '' : 's'}`);
  if (plan.templates.some((t) => t.days.some((d) => d.supps.includes(foodId) || Object.values(d.meals).some((es) => es.some((e) => e.ref === ref))))) {
    where.push('Saved weeks');
  }
  return where;
}

/** How many meals on any day (and in saved weeks) point at a recipe. */
export function recipeUseCount(plan: Plan, recipeId: string): number {
  const ref = 'r:' + recipeId;
  let n = 0;
  for (const d of [...Object.values(plan.days), ...plan.templates.flatMap((t) => t.days)]) {
    for (const es of Object.values(d.meals)) n += es.filter((e) => e.ref === ref).length;
  }
  return n;
}

/** Every day, stored and saved-week, for removing something everywhere. */
export const allDays = (plan: Plan): Day[] => [...Object.values(plan.days), ...plan.templates.flatMap((t) => t.days)];

export type Status = 'ok' | 'under' | 'over';
export function bandStatus(value: number, low: number, high: number): Status {
  if (value > high) return 'over';
  if (value < low) return 'under';
  return 'ok';
}

/** A day's total counting only foods that match `keep` (for upper limits that only cover supplements). */
export function dayNutWhere(plan: Plan, day: Day | undefined, key: string, keep: (f: Food) => boolean): number {
  if (!day) return 0;
  let t = 0;
  for (const id of day.supps) {
    const f = foodById(plan, id);
    if (f && keep(f)) t += foodNut(f, f.per, key);
  }
  for (const s of plan.slots) {
    for (const e of day.meals[s.id] ?? []) {
      if (e.extra) continue;
      const target = entryTarget(plan, e);
      if (target?.kind === 'food') {
        if (keep(target.food)) t += entryNut(plan, e, key);
      } else if (target?.kind === 'recipe') {
        const share = num(e.amount) / servingsOf(target.recipe);
        for (const l of target.recipe.lines) {
          const f = foodById(plan, l.food);
          if (f && keep(f)) t += lineNut(plan, l, key) * share;
        }
      }
    }
  }
  return t;
}
