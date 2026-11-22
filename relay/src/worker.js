// Meal plan search relay: a Cloudflare Worker that searches Open Food Facts for the app.
//
// Why it exists: browsers can't use Open Food Facts' name search reliably. Their newer search
// (search.openfoodfacts.org) sends no CORS header, and the old one (/cgi/search.pl) answers about half of
// requests with a 503 that has no CORS header either. A server isn't bound by CORS, so this asks the newer search
// first, falls back to the old one with retries, and hands the app one tidy answer.
//
// GET /search?q=pomidory&country=en:poland&lang=pl&page=1
//   → { count, products: [{ code, product_name, brands, quantity, nutriments, ... }], from: "new" | "old" }
//
// Nothing is logged or stored except Cloudflare's own short-lived cache of identical searches.

const ALLOWED_ORIGINS = ['https://sailncat.github.io', 'http://localhost:4173', 'http://localhost:5173'];
const USER_AGENT = 'MealPlan/0.4 (https://github.com/Sailncat/meal-plan)';
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
];
const PAGE_SIZE = 20;
const CACHE_SECONDS = 3600;

/** Characters that mean something to the new search's query language; a user's search text shouldn't. */
const QUERY_SYNTAX = /[\\"'():[\]{}^~*?!/<>=+&|]/g;

export function cleanTerms(q) {
  return String(q ?? '')
    .replace(QUERY_SYNTAX, ' ')
    .replace(/\b(AND|OR|NOT)\b/g, (w) => w.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** Taxonomy tags like "nasza-spizarnia" back into something readable. */
export function prettyBrand(tag) {
  const t = String(tag ?? '').replace(/^[a-z]{2}:/, '');
  return t
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function corsHeaders(origin) {
  const h = { Vary: 'Origin' };
  if (ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin), ...extra },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, fetcher, timeoutMs) {
  const res = await fetcher(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** The newer search (Search-a-licious). Country goes inside the query; text is matched in the country's language and English. */
export async function searchNew({ terms, country, lang, page }, fetcher) {
  const q = country ? `${terms} countries_tags:"${country}"` : terms;
  const langs = [...new Set([lang, 'en'].filter(Boolean))].join(',');
  const params = new URLSearchParams({ q, langs, page: String(page), page_size: String(PAGE_SIZE), fields: FIELDS.join(','), boost_phrase: 'true' });
  const data = await getJson(`https://search.openfoodfacts.org/search?${params}`, fetcher, 6000);
  if (!Array.isArray(data.hits)) throw new Error('No hits in the answer');
  const products = data.hits
    .map((h) => ({
      code: String(h.code ?? ''),
      product_name: h.product_name || h[`product_name_${lang}`] || h.product_name_en || '',
      brands: (Array.isArray(h.brands) ? h.brands : h.brands ? [h.brands] : []).map(prettyBrand).join(', '),
      quantity: h.quantity ?? '',
      product_quantity: h.product_quantity,
      product_quantity_unit: h.product_quantity_unit,
      serving_size: h.serving_size,
      serving_quantity: h.serving_quantity,
      nutriments: h.nutriments ?? {},
    }))
    .filter((p) => p.code && p.product_name);
  return { count: Number(data.count) || products.length, products };
}

/** The old search, which sheds load with 503s; a server can simply try again. */
export async function searchOld({ terms, country, page }, fetcher, delayMs = 400) {
  const params = new URLSearchParams({ search_terms: terms, search_simple: '1', action: 'process', json: '1', page_size: String(PAGE_SIZE), page: String(page), fields: FIELDS.join(',') });
  if (country) {
    params.set('tagtype_0', 'countries');
    params.set('tag_contains_0', 'contains');
    params.set('tag_0', country);
  }
  const url = `https://world.openfoodfacts.org/cgi/search.pl?${params}`;
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const data = await getJson(url, fetcher, 8000);
      const products = (Array.isArray(data.products) ? data.products : []).filter((p) => p && p.code && (p.product_name || p.product_name_en));
      return { count: Number(data.count) || products.length, products };
    } catch (e) {
      lastError = e;
      if (e.status && e.status < 500) break;
      await sleep(delayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function handle(request, { fetcher = fetch, cache = null, waitUntil = () => {}, delayMs = 400 } = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') ?? '';

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return json({ error: 'Only GET' }, 405, origin);
  if (url.pathname === '/') return new Response('Meal plan search relay. https://github.com/Sailncat/meal-plan\n', { headers: corsHeaders(origin) });
  if (url.pathname !== '/search') return json({ error: 'Not found' }, 404, origin);

  const terms = cleanTerms(url.searchParams.get('q'));
  const country = url.searchParams.get('country') ?? '';
  const lang = url.searchParams.get('lang') ?? 'en';
  const page = Number(url.searchParams.get('page') ?? '1');
  if (!terms) return json({ error: 'Type something to search for' }, 400, origin);
  if (!/^(|[a-z]{2}:[a-z-]+)$/.test(country) || !/^[a-z]{2}$/.test(lang) || !Number.isInteger(page) || page < 1 || page > 10) {
    return json({ error: 'Bad search' }, 400, origin);
  }

  // Identical searches within the hour come from Cloudflare's cache, sparing Open Food Facts.
  const key = new Request(`https://relay.cache/search?${new URLSearchParams({ q: terms.toLowerCase(), country, lang, page: String(page) })}`);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return json(await hit.json(), 200, origin, { 'X-Cache': 'hit' });
    } catch {
      // the cache is a nicety
    }
  }

  const args = { terms, country, lang, page };
  let result;
  let from = 'new';
  try {
    result = await searchNew(args, fetcher);
    // The newer search sometimes knows less; a page-one blank is worth a second opinion.
    if (!result.products.length && page === 1) {
      try {
        const old = await searchOld(args, fetcher, delayMs);
        if (old.products.length) {
          result = old;
          from = 'old';
        }
      } catch {
        // keep the empty answer
      }
    }
  } catch {
    try {
      result = await searchOld(args, fetcher, delayMs);
      from = 'old';
    } catch {
      return json({ error: 'Open Food Facts didn’t answer. Try again in a minute.' }, 502, origin);
    }
  }

  const body = { ...result, from };
  if (cache) {
    const stored = new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` } });
    waitUntil(cache.put(key, stored).catch(() => {}));
  }
  return json(body, 200, origin, { 'Cache-Control': `max-age=${CACHE_SECONDS}` });
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, { cache: typeof caches !== 'undefined' ? caches.default : null, waitUntil: (p) => ctx.waitUntil(p) });
  },
};
