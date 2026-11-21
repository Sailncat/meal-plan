import type { Day, Entry, Food, Plan, Recipe, RecipeLine } from './types';
import { num } from './num';

export const foodById = (plan: Plan, id: string): Food | undefined => plan.foods.find((f) => f.id === id);
export const recipeById = (plan: Plan, id: string): Recipe | undefined => plan.recipes.find((r) => r.id === id);

/** Nutrient `key` in `amount` units of a food. */
export function foodNut(food: Food | undefined, amount: number | null, key: string): number {
  if (!food || !num(food.per)) return 0;
  const v = food.nut[key];
  if (v == null) return 0;
  return (num(amount) / num(food.per)) * num(v);
}

export const lineNut = (plan: Plan, line: RecipeLine, key: string) => foodNut(foodById(plan, line.food), line.amount, key);

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
  return foodNut(t.food, e.amount, key);
}

export const entriesNut = (plan: Plan, entries: Entry[] | undefined, key: string) =>
  (entries ?? []).reduce((t, e) => t + entryNut(plan, e, key), 0);

export const slotNut = (plan: Plan, day: Day, slotId: string, key: string) => entriesNut(plan, day.meals[slotId], key);

/** Each ticked supplement counts one label serving (its `per` amount). */
export function suppsNut(plan: Plan, day: Day, key: string): number {
  return day.supps.reduce((t, id) => {
    const f = foodById(plan, id);
    return f ? t + foodNut(f, f.per, key) : t;
  }, 0);
}

/** A day's total; only meals that still exist in the plan count. */
export function dayNut(plan: Plan, day: Day, key: string): number {
  let t = suppsNut(plan, day, key);
  for (const s of plan.slots) t += slotNut(plan, day, s.id, key);
  return t;
}

export const weekNut = (plan: Plan, key: string) => plan.week.reduce((t, d) => t + dayNut(plan, d, key), 0);

/** Every food that this week's plan uses, through recipes, foods and supplements. */
export function weekFoodIds(plan: Plan): Set<string> {
  const ids = new Set<string>();
  const addRecipe = (r: Recipe | undefined) => r?.lines.forEach((l) => l.food && ids.add(l.food));
  for (const d of plan.week) {
    d.supps.forEach((id) => ids.add(id));
    for (const s of plan.slots) {
      for (const e of d.meals[s.id] ?? []) {
        const t = entryTarget(plan, e);
        if (t?.kind === 'recipe') addRecipe(t.recipe);
        else if (t?.kind === 'food') ids.add(t.food.id);
      }
    }
  }
  return ids;
}

/** Where a food is used, for the Foods screen. */
export function foodUsedIn(plan: Plan, foodId: string): string[] {
  const where = plan.recipes.filter((r) => r.lines.some((l) => l.food === foodId)).map((r) => r.name || 'Unnamed recipe');
  const ref = 'f:' + foodId;
  if (plan.week.some((d) => Object.values(d.meals).some((es) => es.some((e) => e.ref === ref)))) where.push('This week’s meals');
  if (plan.week.some((d) => d.supps.includes(foodId))) where.push('This week’s supplements');
  return where;
}

/** How many entries in the week point at a recipe. */
export function recipeUseCount(plan: Plan, recipeId: string): number {
  const ref = 'r:' + recipeId;
  let n = 0;
  for (const d of plan.week) for (const es of Object.values(d.meals)) n += es.filter((e) => e.ref === ref).length;
  return n;
}

/** The unit word shown next to an entry's amount. */
export function entryUnit(plan: Plan, e: Entry): string {
  const t = entryTarget(plan, e);
  if (!t) return '';
  if (t.kind === 'recipe') return num(e.amount) === 1 ? 'serving' : 'servings';
  return t.food.unit;
}

export type Status = 'ok' | 'under' | 'over';
export function bandStatus(value: number, low: number, high: number): Status {
  if (value > high) return 'over';
  if (value < low) return 'under';
  return 'ok';
}
