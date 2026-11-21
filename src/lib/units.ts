// Ways to count foods, metric/imperial display, and kcal/kJ.
// Everything is stored in metric (grams, millilitres, kcal); imperial and kJ are only how numbers are shown.

import type { Food, Measure, Settings } from './types';
import { num } from './num';

export const G_PER_OZ = 28.349523125;
/** US fluid ounce. */
export const ML_PER_FL_OZ = 29.5735295625;
export const KJ_PER_KCAL = 4.184;
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

// Kitchen measures every liquid gets for free: spoons, plus the cup of the chosen system
// (the 250 ml metric cup, or the 8 fl oz US cup in US mode).
const SPOONS: readonly Measure[] = [
  { id: '@tsp', name: 'tsp', size: 5 },
  { id: '@tbsp', name: 'tbsp', size: 15 },
];
const METRIC_CUP: Measure = { id: '@cup', name: 'cup', size: 250 };
const US_CUP: Measure = { id: '@uscup', name: 'cup', size: 8 * 29.5735295625 };
/** Cups by the name they go by outside their own system, so an amount saved in the other cup stays clear. */
const OTHER_CUP_NAMES: Record<string, string> = { '@cup': 'metric cup', '@uscup': 'US cup' };

function builtinsFor(system: Settings['system']): Measure[] {
  return [...SPOONS, system === 'imperial' ? US_CUP : METRIC_CUP];
}

export const DEFAULT_SETTINGS: Settings = { system: 'metric', energy: 'kcal' };

/** The food's own measures, plus tsp, tbsp and the system's cup for anything measured in ml. */
export function measuresOf(food: Food, system: Settings['system'] = 'metric'): Measure[] {
  if (food.unit !== 'ml') return food.measures;
  const taken = new Set(food.measures.map((m) => m.name.trim().toLowerCase()));
  return [...food.measures, ...builtinsFor(system).filter((b) => !taken.has(b.name))];
}

/** Finds a measure by id. Either cup is found whichever system is on, so saved amounts never change size. */
export function measureOf(food: Food | undefined, id: string | null | undefined, system: Settings['system'] = 'metric'): Measure | undefined {
  if (!food || !id) return undefined;
  const own = measuresOf(food, system).find((m) => m.id === id);
  if (own || food.unit !== 'ml') return own;
  const cup = [METRIC_CUP, US_CUP].find((c) => c.id === id);
  return cup ? { ...cup, name: OTHER_CUP_NAMES[cup.id] } : undefined;
}

/** An amount in the food's base unit (g, ml or its counting word). */
export function baseAmount(food: Food | undefined, amount: number | null, measureId: string | null): number {
  if (!food) return 0;
  const m = measureOf(food, measureId);
  return m ? num(amount) * num(m.size) : num(amount);
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

/** Re-expresses an amount in another unit of the same food: 4 eggs → 240 g. */
export function convertAmount(food: Food, amount: number | null, from: string | null, to: string | null): number | null {
  if (amount == null) return null;
  const base = baseAmount(food, amount, from);
  const m = measureOf(food, to);
  return m ? round(base / m.size, 2) : round(base, 1);
}

// ---------- words ----------

const NO_PLURAL = new Set(['g', 'kg', 'mg', 'µg', 'ml', 'l', 'oz', 'lb', 'fl oz', 'pt', 'tsp', 'tbsp', 'kcal', 'kj']);

/** "egg" → "eggs", "medium onion" → "medium onions", "tbsp" stays "tbsp". Singular only for exactly 1. */
export function plural(word: string, n: number | null): string {
  const w = word.trim();
  if (!w || n === 1 || NO_PLURAL.has(w.toLowerCase())) return w;
  const split = w.match(/^(.*?)(\S+)$/);
  if (!split) return w;
  const [, head, last] = split;
  let p: string;
  if (/(s|x|z|ch|sh)$/i.test(last)) p = last + 'es';
  else if (/[^aeiou]y$/i.test(last)) p = last.slice(0, -1) + 'ies';
  else p = last + 's';
  return head + p;
}

// ---------- metric / imperial ----------

/** How the base unit is shown: grams become ounces and millilitres fluid ounces in imperial. */
export function baseUnitLabel(unit: string, system: Settings['system'], n: number | null = 2): string {
  if (system === 'imperial') {
    if (unit === 'g') return 'oz';
    if (unit === 'ml') return 'fl oz';
  }
  return plural(unit, n);
}

/** A base amount as shown on screen. */
export function toShown(unit: string, base: number, system: Settings['system']): number {
  if (system === 'imperial') {
    if (unit === 'g') return base / G_PER_OZ;
    if (unit === 'ml') return base / ML_PER_FL_OZ;
  }
  return base;
}

/** What was typed on screen, back to a base amount. */
export function fromShown(unit: string, shown: number, system: Settings['system']): number {
  if (system === 'imperial') {
    if (unit === 'g') return shown * G_PER_OZ;
    if (unit === 'ml') return shown * ML_PER_FL_OZ;
  }
  return shown;
}

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

/** 1.5 → "1½", 0.25 → "¼", 2.37 → "2.37". */
export function fmtQty(n: number): string {
  const whole = Math.floor(n);
  const frac = FRACTIONS[String(round(n - whole, 2))];
  if (frac) return (whole ? String(whole) : '') + frac;
  return String(round(n, 2));
}

/** "3 eggs", "250 g", "8.8 oz", "1½ slices". */
export function amountText(food: Food, amount: number | null, measureId: string | null, system: Settings['system']): string {
  if (amount == null) return '';
  const m = measureOf(food, measureId, system);
  if (m) return `${fmtQty(amount)} ${plural(m.name, amount)}`;
  const shown = toShown(food.unit, amount, system);
  const imperialMass = system === 'imperial' && (food.unit === 'g' || food.unit === 'ml');
  return `${imperialMass ? String(round(shown, 1)) : fmtQty(shown)} ${baseUnitLabel(food.unit, system, shown)}`;
}

// ---------- energy ----------

export const energyUnit = (s: Settings) => (s.energy === 'kJ' ? 'kJ' : 'kcal');
export const toEnergy = (kcal: number, s: Settings) => (s.energy === 'kJ' ? kcal * KJ_PER_KCAL : kcal);
export const fromEnergy = (v: number, s: Settings) => (s.energy === 'kJ' ? v / KJ_PER_KCAL : v);

// ---------- body weight and height ----------

/** Body weight as typed and shown: kg, or lb in imperial. */
export const weightUnit = (system: Settings['system']) => (system === 'imperial' ? 'lb' : 'kg');
export const kgToShown = (kg: number, system: Settings['system']) => (system === 'imperial' ? kg / KG_PER_LB : kg);
export const shownToKg = (v: number, system: Settings['system']) => (system === 'imperial' ? v * KG_PER_LB : v);

/** "80.0 kg", or "176.4 lb" in US units. */
export function weightText(kg: number, system: Settings['system']): string {
  return system === 'imperial' ? `${(kg / KG_PER_LB).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
}

/** 183 cm → 6 ft 0 in. */
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const total = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * CM_PER_IN;
