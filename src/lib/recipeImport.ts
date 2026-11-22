// Importing a recipe from a web page, through the app's relay (which reads the page's schema.org Recipe).

import type { Food, Plan, Recipe } from './types';
import { relay } from './off';
import { amountFor, matchBasicScored, matchOwnScored, parseIngredient, type ParsedLine } from './ingredients';
import { basicDraft, type BasicFood } from './basicFoods';
import { foodFromDraft, libraryMatch } from './foods';
import { blankRecipe } from './recipes';
import { cleanTag } from './migrate';

export interface WebRecipe {
  name: string;
  servings: number | null;
  prepMin: number | null;
  cookMin: number | null;
  ingredients: string[];
  steps: string[];
  image: string | null;
  tags: string[];
  url: string;
  site: string;
}

export async function fetchRecipe(pageUrl: string, fetcher: typeof fetch = fetch): Promise<WebRecipe> {
  let res: Response;
  try {
    res = await fetcher(`${relay.url}/recipe?url=${encodeURIComponent(pageUrl.trim())}`, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error(navigator.onLine === false ? 'You’re offline. Importing needs a connection.' : 'Couldn’t reach the page. Try again in a moment.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || 'Couldn’t read that page.');
  return data as WebRecipe;
}

/** The page's photo, fetched through the relay so the app may shrink it. Null if it can't be had. */
export async function fetchPhoto(imageUrl: string, fetcher: typeof fetch = fetch): Promise<Blob | null> {
  try {
    const res = await fetcher(`${relay.url}/image?url=${encodeURIComponent(imageUrl)}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** One ingredient line on its way in: what the page said, and the food and amount it's matched to. */
export interface ImportRow {
  parsed: ParsedLine;
  food: Food | null;
  /** A basic food not in your foods yet; it's added only if the recipe is saved with it. */
  pending: boolean;
  amount: number | null;
  measure: string | null;
  /** The amount assumed something, like a tablespoon of a weighed food being 15 g. */
  approx: boolean;
  /** Left out of the recipe, like "salt to taste". It goes in the notes instead. */
  skip: boolean;
}

const TO_TASTE = /(to taste|as needed|to serve|for serving|for garnish|optional|do smaku|opcjonalnie|według uznania|do podania)/i;

export function rowFor(plan: Plan, parsed: ParsedLine, food: Food | null, pending = false): ImportRow {
  const a = food ? amountFor(food, parsed) : { amount: null, measure: null, approx: false };
  const toTaste = parsed.unit === 'pinch' || (parsed.amount == null && (!food || TO_TASTE.test(parsed.text)));
  return { parsed, food, pending, amount: a.amount, measure: a.measure, approx: a.approx, skip: toTaste };
}

/** Matches each line to your own foods or the basic foods, whichever fits better; yours win a tie. */
export function matchRows(plan: Plan, basic: BasicFood[] | null, lines: string[]): ImportRow[] {
  return lines.map((text) => {
    const parsed = parseIngredient(text);
    if (!parsed.name) return rowFor(plan, parsed, null);
    const own = matchOwnScored(plan.foods, parsed.name);
    const b = basic ? matchBasicScored(basic, parsed.name) : null;
    if (own && (!b || own.score >= b.score)) return rowFor(plan, parsed, own.food);
    if (b) {
      const have = libraryMatch(plan, { db: 'usda', id: String(b.food.id) });
      return have ? rowFor(plan, parsed, have) : rowFor(plan, parsed, foodFromDraft(basicDraft(b.food), b.food.name), true);
    }
    return rowFor(plan, parsed, null);
  });
}

export interface ImportChoices {
  name: string;
  servings: number;
  prepMin: number | null;
  cookMin: number | null;
  tags: string[];
  steps: string[];
  photo: string | null;
}

/** Makes the recipe, adding any basic foods it uses to your foods. Lines left out are kept in the notes. */
export function buildRecipe(plan: Plan, web: WebRecipe, rows: ImportRow[], c: ImportChoices): Recipe {
  const lines: Recipe['lines'] = [];
  const left: string[] = [];
  for (const r of rows) {
    if (r.skip || !r.food) {
      left.push(r.parsed.text);
      continue;
    }
    let food = r.food;
    if (r.pending) {
      // The same basic food may be in two lines; it's added once.
      const have = food.source ? libraryMatch(plan, food.source) : undefined;
      if (have) food = have;
      else plan.foods.push(food);
    }
    lines.push({ food: food.id, amount: r.amount, measure: r.measure });
  }
  const notes = left.length ? `Not added from the original:\n${left.map((t) => `• ${t}`).join('\n')}` : '';
  const recipe = blankRecipe({
    name: c.name.trim() || web.name,
    servings: c.servings > 0 ? c.servings : 1,
    lines: lines.length ? lines : [{ food: '', amount: null, measure: null }],
    notes,
    steps: c.steps.map((s) => s.trim()).filter(Boolean),
    prepMin: c.prepMin,
    cookMin: c.cookMin,
    tags: [...new Set(c.tags.map(cleanTag).filter(Boolean))],
    source: web.url,
    ...(c.photo ? { photo: c.photo } : {}),
  });
  plan.recipes.unshift(recipe);
  return recipe;
}
