// Recipes: new, copied, scaled, tagged and found.

import type { Plan, Recipe } from './types';
import { foodById } from './calc';
import { fold, uid } from './num';
import { cleanTag } from './migrate';

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
    tags: [],
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

export const TAG_SUGGESTIONS = ['breakfast', 'lunch', 'dinner', 'snack', 'high-protein', 'quick', 'batch', 'cheap', 'vegetarian', 'shake'];

/** Every tag in use, most used first, then the suggestions nobody has used yet. */
export function tagOptions(plan: Plan): string[] {
  const count = new Map<string, number>();
  for (const r of plan.recipes) for (const t of r.tags) count.set(t, (count.get(t) ?? 0) + 1);
  const used = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  return [...used, ...TAG_SUGGESTIONS.filter((t) => !count.has(t))];
}

export function addTag(r: Recipe, raw: string) {
  const t = cleanTag(raw);
  if (t && !r.tags.includes(t)) r.tags.push(t);
}

/** Matches the name, a tag or an ingredient; every chosen tag has to be on the recipe. */
export function findRecipes(plan: Plan, query: string, tags: string[]): Recipe[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return plan.recipes.filter((r) => {
    if (!tags.every((t) => r.tags.includes(t))) return false;
    if (!words.length) return true;
    const hay = fold([r.name, ...r.tags, ...r.lines.map((l) => foodById(plan, l.food)?.name ?? '')].join(' '));
    return words.every((w) => hay.includes(w));
  });
}
