// Reading ingredient lines from recipe pages ("1 ½ tbsp olive oil", "2 łyżki oliwy") and matching them to foods.

import type { Food } from './types';
import { fold } from './num';
import { measuresOf } from './units';
import { searchBasic, type BasicFood } from './basicFoods';

export type UnitKind = 'g' | 'ml' | 'tsp' | 'tbsp' | 'cup' | 'piece' | 'pinch';

export interface ParsedLine {
  /** The line as the page wrote it. */
  text: string;
  amount: number | null;
  unit: UnitKind | null;
  /** For pieces: the word used, like "clove" or "can", if any. */
  word: string | null;
  /** What the ingredient is, without the amount or notes: "olive oil". */
  name: string;
}

const UNICODE_FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅛': 0.125, '⅙': 1 / 6 };
const WORD_AMOUNTS: Record<string, number> = { pół: 0.5, pol: 0.5, half: 0.5, ćwierć: 0.25, quarter: 0.25, a: 1, an: 1, one: 1, two: 2, three: 3, jedna: 1, jeden: 1, dwie: 2, dwa: 2, trzy: 3 };

/** Unit words in English and Polish (any case), each with what it means in grams, millilitres or a measure. */
const UNITS: [RegExp, UnitKind, number][] = [
  [/^(kg|kilograms?|kilo)$/, 'g', 1000],
  [/^(dag|dkg)$/, 'g', 10],
  [/^(g|gr|grams?|gramy|gramów|gram)$/, 'g', 1],
  [/^(mg)$/, 'g', 0.001],
  [/^(lb|lbs|pounds?)$/, 'g', 453.59237],
  [/^(oz|ounces?)$/, 'g', 28.349523125],
  [/^(l|litres?|liters?|litry|litrów|litr)$/, 'ml', 1000],
  [/^(dl)$/, 'ml', 100],
  [/^(ml|millilitres?|milliliters?|mililitrów)$/, 'ml', 1],
  [/^(fl\.? ?oz)$/, 'ml', 29.5735295625],
  [/^(tsp|tsps|teaspoons?|łyżeczk[aiek]|łyżeczek|lyzeczk[aiek])$/, 'tsp', 1],
  [/^(tbsp|tbsps|tbs|tablespoons?|łyżk[aiey]|łyżek|lyzk[aiey]|lyzek)$/, 'tbsp', 1],
  [/^(cups?|szklank[aiey]|szklanek)$/, 'cup', 1],
  [/^(pinch(es)?|szczypt[aiey]|szczypt|dash)$/, 'pinch', 1],
  [/^(cloves?|ząb(ek|ki|ków)?|zabk[ai]|ząbki)$/, 'piece', 1],
  [/^(cans?|tins?|puszk[aiey]|puszek)$/, 'piece', 1],
  [/^(slices?|plastr(y|ów)?|kromk[aiey]|kromek)$/, 'piece', 1],
  [/^(pieces?|pcs?|szt\.?|sztuk[aiy]?)$/, 'piece', 1],
  [/^(packs?|packets?|opakowani[ae]|opak\.?)$/, 'piece', 1],
  [/^(handfuls?|bunch(es)?|sprigs?|stalks?|knobs?|garść|garści|garscie?|pęcz(ek|ki|ka)|gałąz(ka|ki)|galaz(ka|ki))$/, 'piece', 1],
];

/** A number at the start: 2, 1.5, 1,5, 1/2, 1 1/2, ½, 1½, 2-3 (the first of a range), "pół". */
function readAmount(s: string): { amount: number; rest: string } | null {
  // (\b doesn't see Polish letters as part of a word, so the end of the word is spelled out.)
  const w = s.match(/^(pół|pol|half|ćwierć|quarter|an?|one|two|three|jedna|jeden|dwie|dwa|trzy)(?=\s|$)\s*/i);
  if (w) return { amount: WORD_AMOUNTS[w[1].toLowerCase()], rest: s.slice(w[0].length) };
  let amount = 0;
  let used = 0;
  let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (m && Number(m[3])) {
    amount = Number(m[1]) + Number(m[2]) / Number(m[3]);
    used = m[0].length;
  } else if ((m = s.match(/^(\d+)\s*\/\s*(\d+)/)) && Number(m[2])) {
    amount = Number(m[1]) / Number(m[2]);
    used = m[0].length;
  } else if ((m = s.match(/^(\d+(?:[.,]\d+)?)?\s*([½⅓⅔¼¾⅕⅛⅙])?/)) && m[0].trim()) {
    amount = (m[1] ? Number(m[1].replace(',', '.')) : 0) + (m[2] ? UNICODE_FRACTIONS[m[2]] : 0);
    used = m[0].length;
  }
  if (!(amount > 0)) return null;
  // "2-3 carrots": the first number of a range.
  const rest = s.slice(used).replace(/^\s*[-–]\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?/, '');
  return { amount, rest };
}

function readUnit(s: string): { kind: UnitKind; factor: number; word: string | null; rest: string } | null {
  const m = s.match(/^\s*([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ.]+(?:\s?oz)?)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])\.?\s*/);
  if (!m) return null;
  const word = m[1].toLowerCase().replace(/\.$/, '');
  for (const [re, kind, factor] of UNITS) {
    if (re.test(word)) return { kind, factor, word: kind === 'piece' ? word : null, rest: s.slice(m[0].length) };
  }
  return null;
}

/** "of", "z", "a" and similar left between the amount and the name. */
const cleanName = (s: string) =>
  s
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;]| - | – /)[0]
    .replace(/^\s*(of|z|ze)\s+/i, '')
    // "400 g can of tomatoes": the container isn't the food.
    .replace(/^\s*(cans?|tins?|jars?|packs?|packets?|bags?|box(es)?|bottles?|cartons?|puszk\S*|słoik\S*|opakowani\S*)\s+((of|z)\s+)?/i, '')
    .replace(/\s+/g, ' ')
    .trim();

export function parseIngredient(text: string): ParsedLine {
  const t = text.replace(/\s+/g, ' ').trim();
  // "1 (400 g) can of tomatoes": the weight in brackets is the useful amount.
  const inBrackets = t.match(/\((\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|oz|lb)\)/i);
  const lead = readAmount(t);
  if (lead && inBrackets) {
    const unit = readUnit(inBrackets[2])!;
    const rest = t.slice(t.indexOf(')') + 1);
    const after = readUnit(rest);
    return {
      text,
      amount: lead.amount * Number(inBrackets[1].replace(',', '.')) * unit.factor,
      unit: unit.kind,
      word: null,
      name: cleanName(after ? after.rest : rest),
    };
  }
  if (!lead) {
    // "szczypta soli", "salt to taste", "pinch of salt"
    const u = readUnit(t);
    if (u?.kind === 'pinch') return { text, amount: null, unit: 'pinch', word: null, name: cleanName(u.rest) };
    return { text, amount: null, unit: null, word: null, name: cleanName(t.replace(/\b(to taste|do smaku|optional|opcjonalnie)\b/gi, '')) };
  }
  const unit = readUnit(lead.rest);
  if (!unit) return { text, amount: lead.amount, unit: 'piece', word: null, name: cleanName(lead.rest) };
  if (unit.kind === 'pinch') return { text, amount: null, unit: 'pinch', word: null, name: cleanName(unit.rest) };
  const amount = unit.kind === 'g' || unit.kind === 'ml' ? lead.amount * unit.factor : lead.amount;
  return { text, amount: Math.round(amount * 100) / 100, unit: unit.kind, word: unit.word, name: cleanName(unit.rest) };
}

// ---------- matching ----------

const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

/** Same word give or take an ending: "mleka"/"mleko", "eggs"/"egg", "piersi"/"pierś". */
function sameWord(a: string, b: string): boolean {
  if (a === b || a === b + 's' || b === a + 's' || a === b + 'es' || b === a + 'es') return true;
  const short = Math.min(a.length, b.length);
  if (short <= 3) return false;
  const need = Math.min(4, short);
  let k = 0;
  while (k < short && a[k] === b[k]) k++;
  return k >= need && k >= short - 2;
}

/**
 * How well a food name fits an ingredient name: the share of the ingredient's words it has.
 * The last word counts double, as in English it's usually the food itself:
 * "chicken stock" isn't "Chicken breast", but "red onion" is "Onion".
 */
export function nameScore(ingredient: string, foodName: string): number {
  const want = words(ingredient);
  if (!want.length) return 0;
  const have = words(foodName);
  let hit = 0;
  let total = 0;
  want.forEach((w, i) => {
    const weight = i === want.length - 1 && want.length > 1 ? 2 : 1;
    total += weight;
    if (have.some((h) => sameWord(w, h))) hit += weight;
  });
  return hit / total;
}

/** The best of your own foods for an ingredient, and how well it fits, if it fits well enough. */
export function matchOwnScored(foods: Food[], name: string): { food: Food; score: number } | null {
  let best: Food | null = null;
  let bestScore = 0;
  for (const f of foods) {
    if (f.supplement || !f.name) continue;
    const s = nameScore(name, f.name);
    if (s > bestScore + 1e-9 || (Math.abs(s - bestScore) < 1e-9 && best && f.name.length < best.name.length)) {
      best = f;
      bestScore = s;
    }
  }
  return best && bestScore >= 0.5 ? { food: best, score: bestScore } : null;
}

export function matchOwn(foods: Food[], name: string): Food | null {
  return matchOwnScored(foods, name)?.food ?? null;
}

/** Words that say how a food is, or how much, not what it is, so they're never searched for alone. */
const NOT_A_FOOD = new Set(
  'fresh freshly smoked dried dry large small medium big red green white black yellow brown chopped sliced diced minced ground grated raw cooked frozen canned tinned whole extra virgin plain natural organic low fat free light lean boneless skinless hot sweet mild leaves leaf sprigs stalks pieces'.split(
    ' ',
  ),
);

/** The words that say what a basic food is: its first three comma parts, minus anything it's "without". */
function headOf(name: string): string[] {
  const parts = fold(name).split(',').slice(0, 3).join(' ');
  return parts.replace(/\b(with|without|no)\b.*$/, '').split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * The top basic food for an ingredient, and how well it fits. Tries the whole name, then shorter
 * runs of its words. Runs ending on the last word go first, since in English that's the food:
 * "boneless skinless chicken thighs" → "chicken thighs", "smoked paprika" → "paprika". The food
 * found has to be that word, not just mention it: "plain flour" isn't plain pretzels made with flour.
 */
export function matchBasicScored(list: BasicFood[], name: string): { food: BasicFood; score: number } | null {
  const ws = name.split(/\s+/).filter(Boolean).slice(-6);
  const ends: string[] = [];
  const rest: string[] = [];
  for (let len = ws.length; len >= 1; len--) {
    for (let start = ws.length - len; start >= 0; start--) {
      const run = ws.slice(start, start + len);
      if (len === 1 && NOT_A_FOOD.has(fold(run[0]))) continue;
      (start + len === ws.length ? ends : rest).push(run.join(' '));
    }
  }
  for (const q of [...ends, ...rest]) {
    const last = words(q).at(-1);
    if (!last) continue;
    for (const hit of searchBasic(list, q, 10)) {
      if (nameScore(q, hit.name) < 0.5) continue;
      if (!headOf(hit.name).some((h) => sameWord(last, h))) continue;
      return { food: hit, score: nameScore(name, hit.name) };
    }
  }
  return null;
}

export function matchBasic(list: BasicFood[], name: string): BasicFood | null {
  return matchBasicScored(list, name)?.food ?? null;
}

/** Which measure of a food means a tsp, tbsp, cup or a piece word, by name. */
const MEASURE_WORDS: Record<string, RegExp> = {
  tsp: /^(tsp|teaspoon|łyżeczka|lyzeczka)$/i,
  tbsp: /^(tbsp|tablespoon|łyżka|lyzka)$/i,
  cup: /^(cup|szklanka|metric cup|us cup)$/i,
};
const SPOON_ML: Record<string, number> = { tsp: 5, tbsp: 15, cup: 250 };

export interface Amount {
  amount: number | null;
  measure: string | null;
  /** The conversion assumed something, like 1 tbsp of a weighed food being 15 g. */
  approx: boolean;
}

/** Puts a parsed amount into a food's own terms: its base unit or one of its measures. */
export function amountFor(food: Food, p: ParsedLine): Amount {
  const none: Amount = { amount: null, measure: null, approx: false };
  if (p.amount == null || !p.unit || p.unit === 'pinch') return none;
  const ms = measuresOf(food);
  const weighed = food.unit === 'g' || food.unit === 'ml';
  if (p.unit === 'g' || p.unit === 'ml') {
    if (weighed) return { amount: Math.round(p.amount * 10) / 10, measure: null, approx: food.unit !== p.unit };
    return none;
  }
  if (p.unit === 'tsp' || p.unit === 'tbsp' || p.unit === 'cup') {
    const m = ms.find((x) => MEASURE_WORDS[p.unit!].test(x.name.trim()));
    if (m) return { amount: p.amount, measure: m.id, approx: false };
    if (weighed) return { amount: Math.round(p.amount * SPOON_ML[p.unit] * 10) / 10, measure: null, approx: true };
    return none;
  }
  // Pieces: a measure named like the word ("clove"), else the food's own counting measure, else a counting unit.
  const one = p.word?.replace(/(es|s|i|y|ek|ki|ka)$/, '') ?? '';
  const named = one.length >= 3 ? ms.find((x) => fold(x.name).includes(fold(one))) : undefined;
  if (named) return { amount: p.amount, measure: named.id, approx: false };
  const counted = food.countBy ? ms.find((x) => x.id === food.countBy) : undefined;
  if (counted) return { amount: p.amount, measure: counted.id, approx: false };
  if (!weighed) return { amount: p.amount, measure: null, approx: false };
  if (ms.length === 1) return { amount: p.amount, measure: ms[0].id, approx: true };
  return none;
}
