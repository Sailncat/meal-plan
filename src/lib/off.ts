// Packaged foods from Open Food Facts (openfoodfacts.org). Data © Open Food Facts contributors, ODbL.
// Called straight from the browser: simple GETs with no custom headers, so no CORS preflight. Browsers can't set
// a User-Agent, so the app identifies itself with app_name/app_version instead, as the API asks.

import type { Nutrients } from './types';
import type { FoodDraft } from './foods';

const BASE = 'https://world.openfoodfacts.org';
const APP = 'app_name=MealPlan&app_version=0.4';
const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'brands',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'serving_size',
  'serving_quantity',
  'nutriments',
].join(',');

/** Countries for packaged search, with the language their product names are mostly in (searched alongside English). */
export const COUNTRIES: { tag: string; name: string; lang: string }[] = [
  ['poland', 'Poland', 'pl'],
  ['austria', 'Austria', 'de'],
  ['belgium', 'Belgium', 'nl'],
  ['czech-republic', 'Czechia', 'cs'],
  ['denmark', 'Denmark', 'da'],
  ['estonia', 'Estonia', 'et'],
  ['finland', 'Finland', 'fi'],
  ['france', 'France', 'fr'],
  ['germany', 'Germany', 'de'],
  ['hungary', 'Hungary', 'hu'],
  ['ireland', 'Ireland', 'en'],
  ['italy', 'Italy', 'it'],
  ['latvia', 'Latvia', 'lv'],
  ['lithuania', 'Lithuania', 'lt'],
  ['netherlands', 'Netherlands', 'nl'],
  ['norway', 'Norway', 'nb'],
  ['portugal', 'Portugal', 'pt'],
  ['romania', 'Romania', 'ro'],
  ['slovakia', 'Slovakia', 'sk'],
  ['spain', 'Spain', 'es'],
  ['sweden', 'Sweden', 'sv'],
  ['switzerland', 'Switzerland', 'de'],
  ['ukraine', 'Ukraine', 'uk'],
  ['united-kingdom', 'United Kingdom', 'en'],
  ['australia', 'Australia', 'en'],
  ['canada', 'Canada', 'en'],
  ['united-states', 'United States', 'en'],
].map(([t, name, lang]) => ({ tag: 'en:' + t, name, lang }));

export const countryName = (tag: string) => COUNTRIES.find((c) => c.tag === tag)?.name ?? 'all countries';

export interface OffProduct {
  code: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

export class OffError extends Error {
  constructor(
    public kind: 'offline' | 'busy' | 'failed' | 'notfound',
    message: string,
  ) {
    super(message);
  }
}

// ---------- staying inside the API's rate limits (per user: 10 searches and 15 product reads a minute) ----------

export class RateLimit {
  private times: number[] = [];
  constructor(
    private max: number,
    private windowMs = 60_000,
  ) {}
  /** Takes a slot and returns 0, or returns how many ms until one frees up (and takes nothing). */
  take(now = Date.now()): number {
    this.times = this.times.filter((t) => now - t < this.windowMs);
    if (this.times.length >= this.max) return this.windowMs - (now - this.times[0]);
    this.times.push(now);
    return 0;
  }
}

let searchLimit = new RateLimit(10);
let productLimit = new RateLimit(15);

/** For tests. */
export function resetLimits() {
  searchLimit = new RateLimit(10);
  productLimit = new RateLimit(15);
}

interface GetOptions {
  /** How many times to try. Search is flaky on their side (see below), so it gets three. */
  tries: number;
  /** Wait before the first retry, doubled each time. 0 in tests. */
  delayMs: number;
  /** What to say when every try failed. */
  gaveUp: string;
}

const OFFLINE = 'You’re offline. Packaged foods need a connection; basic foods still work.';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Open Food Facts sheds load: its search answers about half of requests with a quick 503, and those error pages
 * carry no CORS header, so the browser only sees "failed to fetch". Both look the same here, so both get retried
 * after a short pause. Every try counts against the rate limit.
 */
async function get(url: string, limit: RateLimit, fetcher: typeof fetch, opts: GetOptions): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    const wait = limit.take();
    if (wait) throw new OffError('busy', `Open Food Facts allows only a few searches a minute. Try again in ${Math.ceil(wait / 1000)} s.`);
    const last = attempt >= opts.tries;
    const retry = () => sleep(opts.delayMs * 2 ** (attempt - 1) + Math.random() * opts.delayMs * 0.3);
    let res: Response;
    try {
      res = await fetcher(url, { signal: AbortSignal.timeout(12_000) });
    } catch {
      if (navigator.onLine === false) throw new OffError('offline', OFFLINE);
      if (!last) {
        await retry();
        continue;
      }
      throw new OffError('failed', opts.gaveUp);
    }
    if (res.status === 429) throw new OffError('busy', 'Open Food Facts is busy. Try again in a minute.');
    if (res.status === 404) return { status: 0 };
    if (res.status >= 500 && !last) {
      await retry();
      continue;
    }
    if (!res.ok) throw new OffError('failed', opts.gaveUp);
    try {
      return await res.json();
    } catch {
      throw new OffError('failed', 'Open Food Facts sent something unreadable. Try again in a moment.');
    }
  }
}

/** Wait before a retry; tests set it to 0. */
export const retryDelay = { ms: 700 };

/**
 * The app's own search relay on Cloudflare (relay/ in the repo), which can use Open Food Facts' newer search that
 * browsers can't reach. Empty until it's deployed; then search goes through it and only falls back to calling
 * Open Food Facts directly if the relay is down.
 */
export const relay = { url: 'https://meal-plan-search.sailncat.workers.dev' };

export async function offProduct(barcode: string, fetcher: typeof fetch = fetch): Promise<OffProduct> {
  const code = barcode.replace(/\D/g, '');
  const data = await get(`${BASE}/api/v2/product/${code}?fields=${FIELDS}&${APP}`, productLimit, fetcher, {
    tries: 2,
    delayMs: retryDelay.ms,
    gaveUp: 'Couldn’t reach Open Food Facts. Try again in a moment.',
  });
  if (data.status !== 1 || !data.product) throw new OffError('notfound', `Barcode ${code} isn’t in Open Food Facts yet.`);
  return { ...data.product, code: String(data.product.code ?? code) };
}

export interface OffSearchResult {
  count: number;
  products: OffProduct[];
}

const OVERLOADED =
  'Open Food Facts’ search is overloaded right now, which happens a lot. Try again in a minute, or scan the barcode instead; that part works even when search doesn’t.';

async function viaRelay(query: string, country: string, page: number, fetcher: typeof fetch): Promise<OffSearchResult> {
  const lang = COUNTRIES.find((c) => c.tag === country)?.lang ?? 'en';
  const params = new URLSearchParams({ q: query, country, lang, page: String(page) });
  const res = await fetcher(`${relay.url}/search?${params}`, { signal: AbortSignal.timeout(20_000) });
  if (res.status === 400) {
    const data = await res.json().catch(() => ({}));
    throw new OffError('failed', data.error || 'That search didn’t work. Try different words.');
  }
  if (!res.ok) throw new Error(`relay ${res.status}`);
  const data = await res.json();
  const products = (Array.isArray(data.products) ? data.products : []).filter((p: OffProduct) => p && p.code && offName(p));
  return { count: Number(data.count) || products.length, products };
}

/** Full-text search, limited to products sold in a country unless country is "". Through the relay when there is one. */
export async function offSearch(query: string, country: string, page = 1, fetcher: typeof fetch = fetch): Promise<OffSearchResult> {
  if (relay.url) {
    const wait = searchLimit.take();
    if (wait) throw new OffError('busy', `Only a few searches a minute, to go easy on Open Food Facts. Try again in ${Math.ceil(wait / 1000)} s.`);
    try {
      return await viaRelay(query, country, page, fetcher);
    } catch (e) {
      if (e instanceof OffError) throw e;
      if (navigator.onLine === false) throw new OffError('offline', OFFLINE);
      // Relay down: try Open Food Facts directly, flaky as that is.
    }
  }
  const params = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '20', page: String(page), fields: FIELDS });
  if (country) {
    params.set('tagtype_0', 'countries');
    params.set('tag_contains_0', 'contains');
    params.set('tag_0', country);
  }
  const data = await get(`${BASE}/cgi/search.pl?${params}&${APP}`, searchLimit, fetcher, { tries: 3, delayMs: retryDelay.ms, gaveUp: OVERLOADED });
  const products = (Array.isArray(data.products) ? data.products : []).filter((p: OffProduct) => p && p.code && offName(p));
  return { count: Number(data.count) || products.length, products };
}

// ---------- turning a product into a food ----------

/** App key, Open Food Facts nutriment, and how to get from its unit (always grams in *_100g) to ours. */
const MAP: [string, string, number][] = [
  ['protein', 'proteins', 1],
  ['carbs', 'carbohydrates', 1],
  ['fat', 'fat', 1],
  ['satfat', 'saturated-fat', 1],
  ['sugar', 'sugars', 1],
  ['fibre', 'fiber', 1],
  ['salt', 'salt', 1],
  ['vitA', 'vitamin-a', 1e6],
  ['vitC', 'vitamin-c', 1e3],
  ['vitD', 'vitamin-d', 1e6],
  ['vitE', 'vitamin-e', 1e3],
  ['vitK', 'vitamin-k', 1e6],
  ['b1', 'vitamin-b1', 1e3],
  ['b2', 'vitamin-b2', 1e3],
  ['b3', 'vitamin-pp', 1e3],
  ['b6', 'vitamin-b6', 1e3],
  ['folate', 'vitamin-b9', 1e6],
  ['b12', 'vitamin-b12', 1e6],
  ['ca', 'calcium', 1e3],
  ['fe', 'iron', 1e3],
  ['mg', 'magnesium', 1e3],
  ['p', 'phosphorus', 1e3],
  ['k', 'potassium', 1e3],
  ['zn', 'zinc', 1e3],
  ['se', 'selenium', 1e6],
];

const numOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const sig = (n: number) => (n === 0 ? 0 : Number(n.toPrecision(4)));

export function offNutrients(n: OffProduct['nutriments'] = {}): Nutrients {
  const out: Nutrients = {};
  const kcal = numOf(n['energy-kcal_100g']);
  const kj = numOf(n['energy-kj_100g']) ?? numOf(n['energy_100g']);
  if (kcal != null) out.kcal = sig(kcal);
  else if (kj != null) out.kcal = sig(kj / 4.184);
  for (const [key, off, factor] of MAP) {
    const v = numOf(n[`${off}_100g`]);
    if (v != null) out[key] = sig(v * factor);
  }
  if (out.salt == null) {
    const sodium = numOf(n['sodium_100g']);
    if (sodium != null) out.salt = sig(sodium * 2.5);
  }
  return out;
}

export const offName = (p: OffProduct) => (p.product_name || p.product_name_en || '').trim();
export const offBrand = (p: OffProduct) => (p.brands ?? '').split(',')[0].trim();

const WEIGHT_WORDS = /^(g|gr|gram|grams|ml|millilitres?|milliliters?|cl|l|oz|kg)$/i;

/** "1 piece (20 g)" → piece of 20; "2 slices (50 g)" → slice of 25; "30 g" → serving of 30. */
export function servingPortion(p: OffProduct): { name: string; size: number; counted: boolean } | null {
  const qty = numOf(p.serving_quantity);
  if (!qty) return null;
  const m = (p.serving_size ?? '').match(/^\s*(\d+(?:[.,]\d+)?)?\s*([a-zA-Ząćęłńóśźż][a-zA-Ząćęłńóśźż ]*?)\s*(?:\(|$)/);
  const count = m?.[1] ? Number(m[1].replace(',', '.')) : 1;
  let word = (m?.[2] ?? '').trim().toLowerCase();
  if (!word || WEIGHT_WORDS.test(word) || word.split(' ').length > 2) return { name: 'serving', size: sig(qty), counted: false };
  if (word.endsWith('ies') && !/(cook|p)ies$/.test(word)) word = word.slice(0, -3) + 'y';
  else if (word.endsWith('s') && !word.endsWith('ss')) word = word.slice(0, -1);
  return { name: word, size: sig(qty / (count || 1)), counted: true };
}

export function offDraft(p: OffProduct): FoodDraft {
  const name = offName(p) || 'Unnamed product';
  const brand = offBrand(p);
  const unitText = `${p.product_quantity_unit ?? ''} ${p.quantity ?? ''}`;
  const unit = /\b(ml|cl|l)\b/i.test(unitText) && !/\b(g|kg)\b/i.test(p.product_quantity_unit ?? '') ? 'ml' : 'g';
  const portions: { name: string; size: number }[] = [];
  let countBy: number | null = null;
  const serving = servingPortion(p);
  if (serving) {
    portions.push({ name: serving.name, size: serving.size });
    if (serving.counted) countBy = 0;
  }
  const pack = numOf(p.product_quantity);
  if (pack && pack <= 2000 && !portions.some((x) => x.size === pack)) portions.push({ name: 'pack', size: sig(pack) });
  return {
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    brand,
    unit,
    nut: offNutrients(p.nutriments),
    portions,
    countBy,
    source: { db: 'off', id: p.code },
    url: `https://world.openfoodfacts.org/product/${p.code}`,
    quantity: (p.quantity ?? '').trim(),
  };
}
