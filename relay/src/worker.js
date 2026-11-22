// Meal plan search relay: a Cloudflare Worker that searches Open Food Facts for the app.
//
// Why it exists: browsers can't use Open Food Facts' name search reliably. Their newer search
// (search.openfoodfacts.org) sends no CORS header, and the old one (/cgi/search.pl) answers about half of
// requests with a 503 that has no CORS header either. A server isn't bound by CORS, so this asks the newer search
// first, falls back to the old one with retries, and hands the app one tidy answer.
//
// GET /search?q=pomidory&country=en:poland&lang=pl&page=1
//   → { count, products: [{ code, product_name, brands, quantity, nutriments, ... }], from: "new" | "old" }
// GET /recipe?url=https://…   → the recipe a page publishes (schema.org Recipe), for importing into the app
// GET /image?url=https://…    → a picture, passed through so the app may shrink it into a recipe photo
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

// ---------- recipe pages ----------

const MAX_PAGE = 3 * 1024 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;

/** Only ordinary public web addresses: no local machines, no bare IP addresses, no odd ports. */
export function publicUrl(raw) {
  let u;
  try {
    u = new URL(String(raw ?? ''));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[') || /(^|\.)(localhost|local|internal|lan|home)$/.test(host)) return null;
  return u;
}

/** Reads at most `max` bytes, so a huge page can't tie the relay up. */
async function readCapped(res, max) {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      reader.cancel();
      throw new Error('too big');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export function cleanText(v) {
  return String(v ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** "PT1H30M" → 90, "P0DT0H20M" → 20; a plain number is taken as minutes. */
export function isoMinutes(v) {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const m = String(v ?? '').match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (!m) return null;
  const min = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return min > 0 ? Math.round(min) : null;
}

const isRecipe = (n) => n && typeof n === 'object' && [].concat(n['@type'] ?? []).some((t) => /^(schema:|https?:\/\/schema\.org\/)?Recipe$/i.test(String(t)));

/** The first Recipe anywhere in a JSON-LD tree: plain, in an array, in @graph, or under mainEntity. */
export function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const r = findRecipe(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (isRecipe(node)) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'about']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function stepsOf(v) {
  if (!v) return [];
  if (typeof v === 'string') {
    // One block of text: split on line breaks, or on numbered steps.
    const text = cleanText(v.replace(/<\/(p|li|div)>/gi, '\n'));
    return text.split(/\n+|(?=\b\d{1,2}[.)]\s+[A-ZĄĆĘŁŃÓŚŹŻ])/).map((x) => x.replace(/^\d{1,2}[.)]\s+/, '').trim()).filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap(stepsOf);
  if (typeof v === 'object') {
    if (v.itemListElement) return stepsOf(v.itemListElement);
    const t = v.text ?? v.name ?? v.description;
    return t ? stepsOf(String(t)) : [];
  }
  return [];
}

function imageOf(v, base) {
  const first = Array.isArray(v) ? v[0] : v;
  const url = typeof first === 'string' ? first : first?.url ?? first?.contentUrl;
  if (!url) return null;
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

/** Turns a page's HTML into the recipe it publishes, or null when it publishes none. */
export function recipeFromHtml(html, pageUrl) {
  const scripts = [...html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const raw of scripts) {
    let data;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      try {
        data = JSON.parse(raw.trim().replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        continue;
      }
    }
    const r = findRecipe(data);
    if (!r) continue;
    const yieldText = [].concat(r.recipeYield ?? []).map(String).join(' ');
    const servings = Number(yieldText.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.')) || null;
    let prepMin = isoMinutes(r.prepTime);
    let cookMin = isoMinutes(r.cookTime);
    if (!prepMin && !cookMin) cookMin = isoMinutes(r.totalTime);
    const ingredients = [].concat(r.recipeIngredient ?? r.ingredients ?? []).map(cleanText).filter(Boolean);
    return {
      name: cleanText(r.name) || 'Imported recipe',
      servings,
      prepMin,
      cookMin,
      ingredients,
      steps: stepsOf(r.recipeInstructions),
      image: imageOf(r.image, pageUrl),
      url: pageUrl,
      site: new URL(pageUrl).hostname.replace(/^www\./, ''),
    };
  }
  return null;
}

async function recipeRoute(url, origin, fetcher) {
  const target = publicUrl(url.searchParams.get('url'));
  if (!target) return json({ error: 'That doesn’t look like a web page address.' }, 400, origin);
  let res;
  try {
    res = await fetcher(target.href, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return json({ error: 'Couldn’t open that page. Check the link, or try again in a moment.' }, 502, origin);
  }
  if (!res.ok) return json({ error: `That page answered with an error (${res.status}).` }, 502, origin);
  if (!/html/i.test(res.headers.get('content-type') ?? '')) return json({ error: 'That link isn’t a web page.' }, 422, origin);
  let html;
  try {
    html = new TextDecoder().decode(await readCapped(res, MAX_PAGE));
  } catch {
    return json({ error: 'That page is too big to read.' }, 422, origin);
  }
  const recipe = recipeFromHtml(html, res.url || target.href);
  if (!recipe) return json({ error: 'This page doesn’t share its recipe in a form the app can read. Many big recipe sites do; this one doesn’t.' }, 422, origin);
  return json(recipe, 200, origin, { 'Cache-Control': 'max-age=86400' });
}

async function imageRoute(url, origin, fetcher) {
  const target = publicUrl(url.searchParams.get('url'));
  if (!target) return json({ error: 'Bad picture address' }, 400, origin);
  let res;
  try {
    res = await fetcher(target.href, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  } catch {
    return json({ error: 'Couldn’t get the picture' }, 502, origin);
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) return json({ error: 'Not a picture' }, 422, origin);
  try {
    const body = await readCapped(res, MAX_IMAGE);
    return new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'max-age=86400', ...corsHeaders(origin) } });
  } catch {
    return json({ error: 'Picture too big' }, 422, origin);
  }
}

export async function handle(request, { fetcher = fetch, cache = null, waitUntil = () => {}, delayMs = 400 } = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') ?? '';

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'GET') return json({ error: 'Only GET' }, 405, origin);
  if (url.pathname === '/') return new Response('Meal plan search relay. https://github.com/Sailncat/meal-plan\n', { headers: corsHeaders(origin) });
  // Pages and pictures are only fetched for the app itself, so the relay can't be used as an open proxy.
  if (url.pathname === '/recipe' || url.pathname === '/image') {
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Only for the Meal plan app' }, 403, origin);
    return url.pathname === '/recipe' ? recipeRoute(url, origin, fetcher) : imageRoute(url, origin, fetcher);
  }
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
