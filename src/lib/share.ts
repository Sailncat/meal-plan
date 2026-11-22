// Sharing a recipe: readable text for anyone, plus a link that carries the recipe and its foods
// (nutrients included) so another copy of the app can add it. Everything travels inside the link
// itself; no server keeps it. Photos and pack prices stay behind.

import type { Food, Plan, Recipe } from './types';
import { foodById, perServing } from './calc';
import { amountText, baseAmount, energyUnit, measureOf, toEnergy } from './units';
import { libraryMatch } from './foods';
import { normalize } from './migrate';
import { minutesText } from './recipes';
import { fmt0, uid } from './num';

const VERSION = 1;
export const SHARE_PREFIX = '#add=';

export interface SharedRecipe {
  recipe: Recipe;
  foods: Food[];
}

/** The recipe and only the foods it uses, without photo or prices. */
export function shareData(plan: Plan, r: Recipe): SharedRecipe {
  // A plain copy: plan objects are Svelte state, which can't be cloned directly.
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const used = [...new Set(r.lines.map((l) => l.food).filter(Boolean))];
  const foods = used
    .map((id) => foodById(plan, id))
    .filter((f): f is Food => !!f)
    .map((f) => {
      const { pack: _pack, ...rest } = copy(f);
      return rest as Food;
    });
  const { photo: _photo, ...recipe } = copy(r);
  recipe.lines = recipe.lines.filter((l) => foods.some((f) => f.id === l.food));
  return { recipe: recipe as Recipe, foods };
}

// ---------- link ----------

const toB64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function squeeze(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unsqueeze(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

export async function encodeShare(data: SharedRecipe): Promise<string> {
  return toB64url(await squeeze(JSON.stringify({ v: VERSION, ...data })));
}

/** Reads a shared recipe back, cleaned the same way a backup is. Throws if the link is damaged. */
export async function decodeShare(code: string): Promise<SharedRecipe> {
  let raw: unknown;
  try {
    raw = JSON.parse(await unsqueeze(fromB64url(code)));
  } catch {
    throw new Error('This recipe link is incomplete or damaged. Ask for it to be sent again.');
  }
  const d = raw as { v?: number; recipe?: unknown; foods?: unknown };
  if (!d || typeof d !== 'object' || typeof d.recipe !== 'object' || !Array.isArray(d.foods)) {
    throw new Error('This link doesn’t hold a recipe.');
  }
  if ((d.v ?? 0) > VERSION) throw new Error('This recipe was shared from a newer version of the app. Reload the app and try the link again.');
  const clean = normalize({ version: 3, foods: d.foods, recipes: [d.recipe] });
  const recipe = clean.recipes[0];
  if (!recipe) throw new Error('This link doesn’t hold a recipe.');
  return { recipe, foods: clean.foods };
}

export const shareLink = (code: string, base = location.origin + location.pathname) => base + SHARE_PREFIX + code;

// ---------- text ----------

export function recipeText(plan: Plan, r: Recipe): string {
  const st = plan.settings;
  const time = [r.prepMin ? `prep ${minutesText(r.prepMin)}` : '', r.cookMin ? `cook ${minutesText(r.cookMin)}` : ''].filter(Boolean);
  const out: string[] = [r.name || 'Recipe', [`Makes ${r.servings} serving${r.servings === 1 ? '' : 's'}`, ...time].join(' · '), ''];
  const lines = r.lines.filter((l) => l.food && foodById(plan, l.food));
  if (lines.length) {
    out.push('Ingredients');
    for (const l of lines) {
      const f = foodById(plan, l.food)!;
      const amt = amountText(f, l.amount, l.measure, st.system);
      out.push(`• ${f.name}${amt ? `: ${amt}` : ''}`);
    }
    out.push('');
  }
  const steps = r.steps.filter((s) => s.trim());
  if (steps.length) {
    out.push('Method', ...steps.map((s, i) => `${i + 1}. ${s}`), '');
  }
  const per = (k: string) => perServing(plan, r, k);
  out.push(
    `Per serving: ${fmt0(toEnergy(per('kcal'), st))} ${energyUnit(st)} · ${fmt0(per('protein'))} g protein · ${fmt0(per('carbs'))} g carbs · ${fmt0(per('fat'))} g fat`,
  );
  if (r.notes.trim()) out.push('', 'Notes', r.notes.trim());
  if (r.source) out.push('', `Original: ${r.source}`);
  return out.join('\n');
}

// ---------- adding a shared recipe ----------

/** One of your foods that is the shared food: the same database entry, or the same name and unit. */
export function sameFood(plan: Plan, f: Food): Food | undefined {
  if (f.source) {
    const hit = libraryMatch(plan, f.source);
    if (hit) return hit;
  }
  const name = f.name.trim().toLowerCase();
  return plan.foods.find((x) => x.name.trim().toLowerCase() === name && x.unit === f.unit && !!x.supplement === !!f.supplement);
}

/** Adds the recipe, reusing your matching foods and adding the rest. Returns the new recipe. */
export function addShared(plan: Plan, s: SharedRecipe): Recipe {
  const mine = new Map<string, Food>();
  const reused = new Set<string>();
  for (const f of s.foods) {
    const have = sameFood(plan, f);
    if (have) {
      mine.set(f.id, have);
      reused.add(f.id);
      continue;
    }
    const added: Food = { ...JSON.parse(JSON.stringify(f)), id: uid() };
    plan.foods.push(added);
    mine.set(f.id, added);
  }
  const lines = s.recipe.lines
    .filter((l) => mine.has(l.food))
    .map((l) => {
      const food = mine.get(l.food)!;
      if (!reused.has(l.food)) return { food: food.id, amount: l.amount, measure: l.measure };
      // One of your foods: carry the amount over in a unit your food knows.
      const theirs = s.foods.find((f) => f.id === l.food)!;
      return { food: food.id, ...amountFor(theirs, food, l.amount, l.measure) };
    });
  const recipe: Recipe = { ...JSON.parse(JSON.stringify(s.recipe)), id: uid(), lines };
  plan.recipes.unshift(recipe);
  return recipe;
}

/** The same amount in your food's units: the same-named measure if it has one, otherwise grams or ml. */
function amountFor(theirs: Food, yours: Food, amount: number | null, measure: string | null): { amount: number | null; measure: string | null } {
  if (amount == null || measure == null) return { amount, measure: null };
  const m = measureOf(theirs, measure);
  if (!m) return { amount, measure: null };
  const sameId = measureOf(yours, measure);
  if (sameId && sameId.name === m.name) return { amount, measure };
  const named = yours.measures.find((x) => x.name.trim().toLowerCase() === m.name.trim().toLowerCase());
  const base = baseAmount(theirs, amount, measure);
  if (named) return { amount: Math.round((base / named.size) * 100) / 100, measure: named.id };
  return { amount: Math.round(base * 10) / 10, measure: null };
}
