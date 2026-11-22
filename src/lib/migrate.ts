// Turns anything that looks like a plan into a clean, current Plan: the old Claude artifact's format (v1), this
// app's backups from before real dates (v2, one undated week), current backups (v3), or a fresh start.

import type { Activity, Aim, Day, Entry, Food, MacroKey, Pack, Plan, Profile, Range, Recipe, Slot, Stage, Targets, Template, WeightEntry } from './types';
import { num, uid } from './num';
import { DEFAULT_SETTINGS, measureOf } from './units';
import { RECENT_MAX } from './foods';
import { isCurrency } from './money';
import { isDate, mondayIndex, today, weekDates } from './dates';

/** The old undated week ran Monday to Sunday. */
const OLD_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const noCustom = (): Record<MacroKey, boolean> => ({ kcal: false, protein: false, carbs: false, fat: false });

export const defaultTargets = (): Targets => ({
  kcal: { low: 2200, high: 2300 },
  protein: { low: 160, high: 180 },
  carbs: { low: 250, high: 350 },
  fat: { low: 55, high: 90 },
  custom: noCustom(),
});

export const defaultProfile = (): Profile => ({
  sex: null,
  birthYear: null,
  heightCm: null,
  activity: 'moderate',
  aim: 'maintain',
  pace: 0.25,
  stage: 'none',
  standard: 'eu',
});

const ACTIVITIES: Activity[] = ['sedentary', 'light', 'moderate', 'active', 'very'];
const AIMS: Aim[] = ['lose', 'maintain', 'gain'];
const STAGES: Stage[] = ['none', 'pregnant1', 'pregnant2', 'pregnant3', 'breastfeeding'];
const pick = <T extends string>(v: unknown, from: readonly T[], fallback: T): T => (from.includes(v as T) ? (v as T) : fallback);
const posOrNull = (v: unknown) => (v != null && num(v) > 0 ? num(v) : null);

function rangeOf(r: unknown, fallback: Range): Range {
  if (!isObj(r)) return { ...fallback };
  const low = r.low != null ? num(r.low) : fallback.low;
  const high = r.high != null ? num(r.high) : fallback.high;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function targetsOf(t: Record<string, any>): Targets {
  const d = defaultTargets();
  // Plans from before Phase 3 kept calories and protein as four flat numbers.
  if (t.kcalLow != null || t.proteinLow != null) {
    return {
      ...d,
      kcal: rangeOf({ low: t.kcalLow ?? d.kcal.low, high: t.kcalHigh ?? d.kcal.high }, d.kcal),
      protein: rangeOf({ low: t.proteinLow ?? d.protein.low, high: t.proteinHigh ?? d.protein.high }, d.protein),
    };
  }
  const c = isObj(t.custom) ? t.custom : {};
  return {
    kcal: rangeOf(t.kcal, d.kcal),
    protein: rangeOf(t.protein, d.protein),
    carbs: rangeOf(t.carbs, d.carbs),
    fat: rangeOf(t.fat, d.fat),
    custom: { kcal: !!c.kcal, protein: !!c.protein, carbs: !!c.carbs, fat: !!c.fat },
  };
}

export const DEFAULT_SLOTS: Slot[] = [
  { id: 'breakfast', name: 'Breakfast' },
  { id: 'lunch', name: 'Lunch' },
  { id: 'dinner', name: 'Dinner' },
  { id: 'snacks', name: 'Snacks' },
];

export const emptyDay = (slots: Slot[]): Day => ({ meals: Object.fromEntries(slots.map((s) => [s.id, []])), supps: [], suppsTaken: [] });

/** Nothing planned and nothing eaten. */
export const isEmptyDay = (d: Day | undefined) => !d || (!d.supps.length && Object.values(d.meals).every((es) => !es.length));

export function emptyPlan(): Plan {
  const slots = DEFAULT_SLOTS.map((s) => ({ ...s }));
  return {
    app: 'meal-plan',
    version: 3,
    settings: { ...DEFAULT_SETTINGS },
    foods: [],
    recipes: [],
    slots,
    days: {},
    templates: [],
    targets: defaultTargets(),
    profile: defaultProfile(),
    weights: [],
    favourites: [],
    recent: [],
    meta: { lastBackup: null, backupSnoozedUntil: null },
  };
}

export class PlanFormatError extends Error {}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const amountOf = (v: unknown): number | null => (v === '' || v == null ? null : Number.isFinite(parseFloat(String(v))) ? num(v) : null);

/**
 * Accepts parsed JSON from a backup file or storage and returns a clean Plan. Throws PlanFormatError if it isn't one.
 * `now` decides which dates an old undated week lands on: the current week.
 */
export function toPlan(data: unknown, now = new Date()): Plan {
  if (!isObj(data)) throw new PlanFormatError('This file doesn’t contain a meal plan.');
  if (Array.isArray(data.ingredients) && Array.isArray(data.week)) return normalize(fromV1(data), now);
  if (data.app === 'meal-plan' || (Array.isArray(data.foods) && Array.isArray(data.slots))) return normalize(data, now);
  throw new PlanFormatError('This file doesn’t contain a meal plan.');
}

const packOf = (v: unknown): Pack | null =>
  isObj(v) && num(v.size) > 0 ? { size: num(v.size), price: v.price != null && v.price !== '' && num(v.price) >= 0 && Number.isFinite(parseFloat(String(v.price))) ? num(v.price) : null } : null;

/** Fills gaps and drops broken bits so the app can always render what it loaded. */
export function normalize(p: Record<string, any>, now = new Date()): Plan {
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
    measures: (Array.isArray(f.measures) ? f.measures : [])
      .filter(isObj)
      .map((m: any) => ({ id: str(m.id) || uid(), name: str(m.name), size: num(m.size) }))
      .filter((m: { size: number }) => m.size > 0),
    countBy: typeof f.countBy === 'string' ? f.countBy : null,
    ...(isObj(f.source) && (f.source.db === 'off' || f.source.db === 'usda') && str(f.source.id) ? { source: { db: f.source.db, id: str(f.source.id) } } : {}),
    ...(packOf(f.pack) ? { pack: packOf(f.pack)! } : {}),
  }));
  const foodMap = new Map(foods.map((f) => [f.id, f]));
  // A unit that no longer exists falls back to the base unit.
  const measureFor = (foodId: string, m: unknown) => (typeof m === 'string' && measureOf(foodMap.get(foodId), m) ? m : null);
  for (const f of foods) f.countBy = measureFor(f.id, f.countBy);
  const recipes: Recipe[] = (Array.isArray(p.recipes) ? p.recipes : []).filter(isObj).map((r: any) => ({
    id: str(r.id) || uid(),
    name: str(r.name),
    servings: num(r.servings) > 0 ? num(r.servings) : 1,
    lines: (Array.isArray(r.lines) ? r.lines : [])
      .filter(isObj)
      .map((l: any) => ({ food: str(l.food), amount: amountOf(l.amount), measure: measureFor(str(l.food), l.measure) })),
    notes: str(r.notes),
  }));
  let slots: Slot[] = (Array.isArray(p.slots) ? p.slots : []).filter(isObj).map((s: any) => ({ id: str(s.id) || uid(), name: str(s.name) }));
  if (!slots.length) slots = DEFAULT_SLOTS.map((s) => ({ ...s }));
  // Entries and supplements that point at something deleted are dropped.
  const foodIds = new Set(foods.map((f) => f.id));
  const recipeIds = new Set(recipes.map((r) => r.id));
  const exists = (ref: string) => (ref.startsWith('r:') ? recipeIds : foodIds).has(ref.slice(2));
  const dayOf = (raw: unknown): Day => {
    const d = isObj(raw) ? raw : {};
    const rawMeals = isObj(d.meals) ? d.meals : {};
    const meals: Record<string, Entry[]> = {};
    for (const s of slots) {
      meals[s.id] = (Array.isArray(rawMeals[s.id]) ? rawMeals[s.id] : [])
        .filter((e: any) => isObj(e) && typeof e.ref === 'string' && /^[rf]:/.test(e.ref) && exists(e.ref))
        .map((e: any) => {
          const entry: Entry = {
            id: str(e.id) || uid(),
            ref: e.ref,
            amount: amountOf(e.amount),
            measure: e.ref.startsWith('f:') ? measureFor(e.ref.slice(2), e.measure) : null,
          };
          if (e.extra) {
            entry.extra = true;
            entry.eaten = true;
            if (typeof e.swapOf === 'string') entry.swapOf = e.swapOf;
          } else {
            if (e.eaten) entry.eaten = true;
            if (e.skipped) entry.skipped = true;
          }
          return entry;
        });
    }
    // A planned meal only stays "swapped" while what it was swapped for is still there.
    const swaps = new Set(Object.values(meals).flatMap((es) => es.filter((e) => e.swapOf).map((e) => e.swapOf)));
    for (const es of Object.values(meals)) for (const e of es) if (e.skipped && !swaps.has(e.id)) delete e.skipped;
    const supps = Array.isArray(d.supps) ? [...new Set<string>(d.supps.filter((x: unknown) => typeof x === 'string' && foodIds.has(x)))] : [];
    const suppsTaken = Array.isArray(d.suppsTaken) ? [...new Set<string>(d.suppsTaken.filter((x: unknown) => typeof x === 'string' && supps.includes(x)))] : [];
    return { meals, supps, suppsTaken };
  };

  const st = isObj(p.settings) ? p.settings : {};
  const weekStart: 0 | 1 = st.weekStart === 0 ? 0 : 1;
  const days: Record<string, Day> = {};
  const templates: Template[] = [];
  if (isObj(p.days)) {
    for (const [date, raw] of Object.entries(p.days)) {
      if (!isDate(date)) continue;
      const d = dayOf(raw);
      if (!isEmptyDay(d)) days[date] = d;
    }
  } else if (Array.isArray(p.week)) {
    // Before real dates the plan was one undated Monday–Sunday week. It becomes this week, and is kept as a
    // template too, so next week can start from it.
    const week = OLD_DAYS.map((_, k) => dayOf(p.week[k]));
    for (const date of weekDates(today(now), weekStart)) {
      const d = structuredClone(week[mondayIndex(date)]);
      if (!isEmptyDay(d)) days[date] = d;
    }
    if (week.some((d) => !isEmptyDay(d))) templates.push({ id: uid(), name: 'My usual week', days: week });
  }
  for (const t of Array.isArray(p.templates) ? p.templates : []) {
    if (!isObj(t) || !Array.isArray(t.days)) continue;
    templates.push({ id: str(t.id) || uid(), name: str(t.name) || 'Saved week', days: OLD_DAYS.map((_, k) => dayOf(t.days[k])) });
  }

  const targets = targetsOf(isObj(p.targets) ? p.targets : {});
  const pr = isObj(p.profile) ? p.profile : {};
  const dp = defaultProfile();
  const profile: Profile = {
    sex: pr.sex === 'male' || pr.sex === 'female' ? pr.sex : null,
    birthYear: posOrNull(pr.birthYear),
    heightCm: posOrNull(pr.heightCm),
    activity: pick(pr.activity, ACTIVITIES, dp.activity),
    aim: pick(pr.aim, AIMS, dp.aim),
    pace: posOrNull(pr.pace) ?? dp.pace,
    stage: pick(pr.stage, STAGES, dp.stage),
    standard: pr.standard === 'us' ? 'us' : 'eu',
  };
  // One weight per day, oldest first.
  const byDate = new Map<string, number>();
  for (const w of Array.isArray(p.weights) ? p.weights : []) {
    if (isObj(w) && typeof w.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && num(w.kg) > 0) byDate.set(w.date, num(w.kg));
  }
  const weights: WeightEntry[] = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, kg]) => ({ date, kg }));
  const m = isObj(p.meta) ? p.meta : {};
  const refs = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && /^[rf]:/.test(x) && exists(x)))];
  return {
    app: 'meal-plan',
    version: 3,
    settings: {
      system: st.system === 'imperial' ? 'imperial' : 'metric',
      energy: st.energy === 'kJ' ? 'kJ' : 'kcal',
      country: typeof st.country === 'string' && /^(|[a-z]{2}:[a-z-]+)$/.test(st.country) ? st.country : DEFAULT_SETTINGS.country,
      weekStart,
      currency: isCurrency(st.currency) ? st.currency : DEFAULT_SETTINGS.currency,
    },
    foods,
    recipes,
    slots,
    days,
    templates,
    targets,
    profile,
    weights,
    favourites: refs(p.favourites),
    recent: refs(p.recent).slice(0, RECENT_MAX),
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

  const week = OLD_DAYS.map((d, k) => (p.week as any[]).find((x) => x && x.day === d) || p.week[k] || {});
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
