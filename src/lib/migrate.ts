// Turns anything that looks like a plan into a clean, current Plan:
// the old Claude artifact's format (v1), this app's own backups (v2), or a fresh start.

import type { Day, Entry, Food, Plan, Recipe, Slot, Targets } from './types';
import { DAYS } from './types';
import { num, uid } from './num';

export const DEFAULT_TARGETS: Targets = { kcalLow: 2200, kcalHigh: 2300, proteinLow: 160, proteinHigh: 180 };

export const DEFAULT_SLOTS: Slot[] = [
  { id: 'breakfast', name: 'Breakfast' },
  { id: 'lunch', name: 'Lunch' },
  { id: 'dinner', name: 'Dinner' },
  { id: 'snacks', name: 'Snacks' },
];

const emptyDay = (slots: Slot[]): Day => ({ meals: Object.fromEntries(slots.map((s) => [s.id, []])), supps: [] });

export function emptyPlan(): Plan {
  const slots = DEFAULT_SLOTS.map((s) => ({ ...s }));
  return {
    app: 'meal-plan',
    version: 2,
    foods: [],
    recipes: [],
    slots,
    week: DAYS.map(() => emptyDay(slots)),
    targets: { ...DEFAULT_TARGETS },
    meta: { lastBackup: null, backupSnoozedUntil: null },
  };
}

export class PlanFormatError extends Error {}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const amountOf = (v: unknown): number | null => (v === '' || v == null ? null : Number.isFinite(parseFloat(String(v))) ? num(v) : null);

/** Accepts parsed JSON from a backup file or storage and returns a clean Plan. Throws PlanFormatError if it isn't one. */
export function toPlan(data: unknown): Plan {
  if (!isObj(data)) throw new PlanFormatError('This file doesn’t contain a meal plan.');
  if (Array.isArray(data.ingredients) && Array.isArray(data.week)) return normalize(fromV1(data));
  if (data.app === 'meal-plan' || (Array.isArray(data.foods) && Array.isArray(data.slots))) return normalize(data);
  throw new PlanFormatError('This file doesn’t contain a meal plan.');
}

/** Fills gaps and drops broken bits so the app can always render what it loaded. */
export function normalize(p: Record<string, any>): Plan {
  const foods: Food[] = (Array.isArray(p.foods) ? p.foods : []).filter(isObj).map((f: any) => ({
    id: str(f.id) || uid(),
    name: str(f.name),
    unit: str(f.unit, 'g') || 'g',
    per: num(f.per) || 100,
    nut: isObj(f.nut)
      ? Object.fromEntries(Object.entries(f.nut).filter(([, v]) => v !== '' && v != null && Number.isFinite(parseFloat(String(v)))).map(([k, v]) => [k, num(v)]))
      : {},
    note: str(f.note),
    supplement: !!f.supplement,
  }));
  const recipes: Recipe[] = (Array.isArray(p.recipes) ? p.recipes : []).filter(isObj).map((r: any) => ({
    id: str(r.id) || uid(),
    name: str(r.name),
    servings: num(r.servings) > 0 ? num(r.servings) : 1,
    lines: (Array.isArray(r.lines) ? r.lines : []).filter(isObj).map((l: any) => ({ food: str(l.food), amount: amountOf(l.amount) })),
    notes: str(r.notes),
  }));
  let slots: Slot[] = (Array.isArray(p.slots) ? p.slots : []).filter(isObj).map((s: any) => ({ id: str(s.id) || uid(), name: str(s.name) }));
  if (!slots.length) slots = DEFAULT_SLOTS.map((s) => ({ ...s }));
  // Entries and supplements that point at something deleted are dropped.
  const foodIds = new Set(foods.map((f) => f.id));
  const recipeIds = new Set(recipes.map((r) => r.id));
  const exists = (ref: string) => (ref.startsWith('r:') ? recipeIds : foodIds).has(ref.slice(2));
  const rawWeek = Array.isArray(p.week) ? p.week : [];
  const week: Day[] = DAYS.map((_, k) => {
    const d = isObj(rawWeek[k]) ? rawWeek[k] : {};
    const rawMeals = isObj(d.meals) ? d.meals : {};
    const meals: Record<string, Entry[]> = {};
    for (const s of slots) {
      meals[s.id] = (Array.isArray(rawMeals[s.id]) ? rawMeals[s.id] : [])
        .filter((e: any) => isObj(e) && typeof e.ref === 'string' && /^[rf]:/.test(e.ref) && exists(e.ref))
        .map((e: any) => ({ id: str(e.id) || uid(), ref: e.ref, amount: amountOf(e.amount) }));
    }
    const supps = Array.isArray(d.supps) ? [...new Set<string>(d.supps.filter((x: unknown) => typeof x === 'string' && foodIds.has(x)))] : [];
    return { meals, supps };
  });
  const t = isObj(p.targets) ? p.targets : {};
  const targets: Targets = {
    kcalLow: t.kcalLow != null ? num(t.kcalLow) : DEFAULT_TARGETS.kcalLow,
    kcalHigh: t.kcalHigh != null ? num(t.kcalHigh) : DEFAULT_TARGETS.kcalHigh,
    proteinLow: t.proteinLow != null ? num(t.proteinLow) : DEFAULT_TARGETS.proteinLow,
    proteinHigh: t.proteinHigh != null ? num(t.proteinHigh) : DEFAULT_TARGETS.proteinHigh,
  };
  const m = isObj(p.meta) ? p.meta : {};
  return {
    app: 'meal-plan',
    version: 2,
    foods,
    recipes,
    slots,
    week,
    targets,
    meta: { lastBackup: typeof m.lastBackup === 'string' ? m.lastBackup : null, backupSnoozedUntil: typeof m.backupSnoozedUntil === 'string' ? m.backupSnoozedUntil : null },
  };
}

/**
 * The old Claude artifact kept Breakfast and Dinner as fixed meals, a single shake with a 0–2 count,
 * four snack slots, and supplements found by a "Supplement" name prefix. This maps all of that across.
 */
export function fromV1(p: Record<string, any>): Record<string, any> {
  const foods = (p.ingredients as any[]).filter(isObj).map((i) => {
    const rawName = str(i.name).trim();
    const supplement = /^supplement/i.test(rawName);
    const name = supplement ? rawName.replace(/^supplement\s*:?\s*/i, '') || rawName : rawName;
    const nut: Record<string, number> = { kcal: num(i.kcal), protein: num(i.protein) };
    if (isObj(i.n)) for (const [k, v] of Object.entries(i.n)) if (v !== '' && v != null) nut[k] = num(v);
    return { id: str(i.id) || uid(), name, unit: str(i.unit, 'g'), per: num(i.per) || 100, nut, note: str(i.note), supplement };
  });
  const recipes: any[] = (Array.isArray(p.recipes) ? p.recipes : []).filter(isObj).map((r: any) => ({
    id: str(r.id) || uid(),
    name: str(r.name),
    servings: num(r.servings) || 1,
    lines: (Array.isArray(r.lines) ? r.lines : []).map((l: any) => ({ food: str(l.ing), amount: amountOf(l.amount) })),
    notes: str(r.notes),
  }));

  const week = DAYS.map((d, k) => (p.week as any[]).find((x) => x && x.day === d) || p.week[k] || {});
  const shakesOf = (w: any) => {
    // older plans stored a shake flag on each meal instead of a count
    const legacy = (w.breakfast?.shake ? 1 : 0) + (w.dinner?.shake ? 1 : 0);
    return w.shakes == null ? legacy : Math.max(0, Math.round(num(w.shakes)));
  };
  const shakeLines = Array.isArray(p.shake?.lines) ? p.shake.lines : [];
  const usesShakes = week.some((w) => shakesOf(w) > 0);
  let shakeId = '';
  if (shakeLines.length || usesShakes) {
    shakeId = recipes.some((r) => r.id === 'shake') ? 'shake-' + uid() : 'shake';
    recipes.push({
      id: shakeId,
      name: 'Shake',
      servings: 1,
      lines: shakeLines.map((l: any) => ({ food: str(l.ing), amount: amountOf(l.amount) })),
      notes: '',
    });
  }

  const slots = [{ id: 'breakfast', name: 'Breakfast' }, { id: 'dinner', name: 'Dinner' }];
  if (shakeId) slots.push({ id: 'shakes', name: 'Shakes' });
  slots.push({ id: 'snacks', name: 'Snacks' });

  const recipeEntry = (slot: any) => (slot?.recipe ? [{ id: uid(), ref: 'r:' + slot.recipe, amount: 1 }] : []);
  const newWeek = week.map((w: any) => {
    const meals: Record<string, any[]> = {
      breakfast: recipeEntry(w.breakfast),
      dinner: recipeEntry(w.dinner),
      snacks: (Array.isArray(w.snacks) ? w.snacks : [])
        .filter((s: any) => s && typeof s.ref === 'string' && s.ref.length > 2)
        .map((s: any) => ({ id: uid(), ref: (s.ref[0] === 'r' ? 'r:' : 'f:') + s.ref.slice(2), amount: amountOf(s.amount) })),
    };
    if (shakeId) {
      const n = shakesOf(w);
      meals.shakes = n > 0 ? [{ id: uid(), ref: 'r:' + shakeId, amount: n }] : [];
    }
    return { meals, supps: Array.isArray(w.supps) ? w.supps.filter((x: unknown) => typeof x === 'string') : [] };
  });

  return { app: 'meal-plan', version: 2, foods, recipes, slots, week: newWeek, targets: p.targets, meta: {} };
}
