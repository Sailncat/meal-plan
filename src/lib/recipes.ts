// Recipes: new, copied, scaled and found.

import type { Plan, Recipe } from './types';
import { foodById } from './calc';
import { fold, uid } from './num';

export function blankRecipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: uid(),
    name: '',
    servings: 1,
    lines: [{ food: '', amount: null, measure: null }],
    notes: '',
    steps: [],
    prepMin: null,
    cookMin: null,
    ...over,
  };
}

/** A copy to make a variation of: same everything, new id, "(copy)" on the name. Goes right after the original. */
export function duplicateRecipe(plan: Plan, r: Recipe): Recipe {
  // A JSON round trip gives plain data even from Svelte's reactive objects, which structuredClone can't copy.
  const copy: Recipe = { ...JSON.parse(JSON.stringify(r)), id: uid(), name: `${r.name || 'Unnamed recipe'} (copy)` };
  const i = plan.recipes.findIndex((x) => x.id === r.id);
  plan.recipes.splice(i + 1, 0, copy);
  return copy;
}

/**
 * Scaling multiplies every amount and the servings together, so each serving stays the same size: a 2-dinner pot
 * ×2 becomes a 4-dinner pot. Meals planned with it don't change, since they count servings.
 */
export function scaleRecipe(r: Recipe, factor: number) {
  if (!(factor > 0)) return;
  for (const l of r.lines) {
    if (l.amount == null) continue;
    const v = l.amount * factor;
    l.amount = l.measure ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
  }
  r.servings = Math.round(r.servings * factor * 100) / 100;
}

export const totalMinutes = (r: Recipe) => (r.prepMin ?? 0) + (r.cookMin ?? 0);

/** "45 min", "1 h 20 min". */
export function minutesText(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Recipes whose name or ingredients have every word searched for. */
export function findRecipes(plan: Plan, query: string): Recipe[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return plan.recipes;
  return plan.recipes.filter((r) => {
    const hay = fold([r.name, ...r.lines.map((l) => foodById(plan, l.food)?.name ?? '')].join(' '));
    return words.every((w) => hay.includes(w));
  });
}
