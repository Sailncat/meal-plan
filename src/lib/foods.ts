// Building foods for the library: blank ones, ones picked from a database, and filling gaps from a database.

import type { AisleId, Food, FoodSource, Measure, Nutrients, Pack, Plan } from './types';
import { uid } from './num';

export const RECENT_MAX = 15;

export function blankFood(over: Partial<Food> = {}): Food {
  return { id: uid(), name: '', unit: 'g', per: 100, nut: {}, note: '', supplement: false, measures: [], countBy: null, ...over };
}

/** A food picked from a database, before it's checked and saved. Values are always per 100 g or 100 ml. */
export interface FoodDraft {
  name: string;
  /** Brand, for packaged foods. */
  brand: string;
  unit: 'g' | 'ml';
  nut: Nutrients;
  /** Ways to count it the database knows about, like a large egg or a serving. */
  portions: { name: string; size: number }[];
  /** Index into portions that new amounts should start in, or null for weight. */
  countBy: number | null;
  /** Null when typed in by hand, like a barcode that isn't in any database yet. */
  source: FoodSource | null;
  /** Link to the product page, for checking and credit. */
  url: string;
  /** Barcode, kept in the note when the product wasn't found. */
  barcode?: string;
  /** Pack size as printed, like "500 g". */
  quantity: string;
  /** Shop aisle guessed from the database's category. */
  aisle: AisleId;
  /** Pack size from the label, price unknown. */
  pack: Pack | null;
}

/** Size words the databases use on their own for a portion ("large", "medium"); they need the food's name to read right. */
const SIZE_WORDS = /^(extra small|small|medium|large|extra large|jumbo|very large)$/i;

/** "Bananas, raw" → "banana"; "Egg, whole, raw" → "egg". Good enough for the common English plurals. */
export function nounOf(foodName: string): string {
  const head = foodName.split(',')[0].trim().toLowerCase();
  const words = head.split(/\s+/);
  const last = words.pop() ?? '';
  const one = last.endsWith('ies')
    ? last.slice(0, -3) + 'y'
    : /(ch|sh|x|ss|o)es$/.test(last)
      ? last.slice(0, -2)
      : last.endsWith('s') && !last.endsWith('ss')
        ? last.slice(0, -1)
        : last;
  return [...words, one].join(' ');
}

/** "large" for an egg becomes "large egg", so 3 of them read as "3 large eggs". Other portion names stay as they are. */
export function portionName(foodName: string, portion: string): string {
  return SIZE_WORDS.test(portion.trim()) ? `${portion.trim().toLowerCase()} ${nounOf(foodName)}` : portion.trim();
}

/** Turns a checked draft into a food for the library. */
export function foodFromDraft(d: FoodDraft, name: string): Food {
  const measures: Measure[] = d.portions.map((p) => ({ id: uid(), name: p.name, size: p.size }));
  const nut: Nutrients = {};
  for (const [k, v] of Object.entries(d.nut)) if (v != null && Number.isFinite(v)) nut[k] = v;
  const quantity = d.quantity ? ` (${d.quantity})` : '';
  const note = !d.source
    ? d.barcode
      ? `Barcode ${d.barcode}, typed in from the label.`
      : ''
    : d.source.db === 'off'
      ? `Values from Open Food Facts, barcode ${d.source.id}${quantity}.`
      : `Values from USDA FoodData Central, FDC ${d.source.id}.`;
  return blankFood({
    name: name.trim() || d.name,
    unit: d.unit,
    per: 100,
    nut,
    note,
    measures,
    countBy: d.countBy != null && measures[d.countBy] ? measures[d.countBy].id : null,
    ...(d.source ? { source: { ...d.source } } : {}),
    ...(d.aisle !== 'other' ? { aisle: d.aisle } : {}),
    ...(d.pack ? { pack: { ...d.pack } } : {}),
  });
}

/** A draft for a product no database knows: values come from the label. */
export function labelDraft(barcode = ''): FoodDraft {
  return { name: '', brand: '', unit: 'g', nut: {}, portions: [], countBy: null, source: null, url: '', quantity: '', barcode, aisle: 'other', pack: null };
}

/** The food already in the library that came from this database entry, so picking it twice doesn't make a copy. */
export function libraryMatch(plan: Plan, source: FoodSource): Food | undefined {
  return plan.foods.find((f) => f.source?.db === source.db && f.source.id === source.id);
}

/**
 * Fills only the nutrients a food is missing, from a database entry. Database values are per 100 g/ml and get
 * scaled to the food's own label amount. Returns the keys it filled. Only works for foods measured in g or ml.
 */
export function fillBlanks(food: Food, from: Nutrients): string[] {
  if (food.unit !== 'g' && food.unit !== 'ml') return [];
  const filled: string[] = [];
  for (const [k, v] of Object.entries(from)) {
    if (food.nut[k] != null || v == null || !Number.isFinite(v)) continue;
    food.nut[k] = Math.round(((v * food.per) / 100) * 1000) / 1000;
    filled.push(k);
  }
  return filled;
}

/** Which of a draft's nutrients a food is missing, so the user can see what "Find values" would add. */
export function blanksFilledBy(food: Food, from: Nutrients): string[] {
  return Object.keys(from).filter((k) => food.nut[k] == null && from[k] != null && Number.isFinite(from[k]));
}

export function pushRecent(plan: Plan, ref: string) {
  plan.recent = [ref, ...plan.recent.filter((r) => r !== ref)].slice(0, RECENT_MAX);
}

export function toggleFavourite(plan: Plan, ref: string) {
  plan.favourites = plan.favourites.includes(ref) ? plan.favourites.filter((r) => r !== ref) : [...plan.favourites, ref];
}
