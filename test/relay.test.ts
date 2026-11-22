import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS worker, no types
import { cleanTerms, handle, prettyBrand } from '../relay/src/worker.js';

const APP = 'https://sailncat.github.io';
const req = (path: string, origin = APP, method = 'GET') => new Request(`https://meal-plan-search.example.workers.dev${path}`, { method, headers: { Origin: origin } });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const NEW_HIT = {
  code: '5900783000150',
  product_name: 'Pomidory całe',
  brands: ['nasza-spizarnia'],
  quantity: '400 g',
  nutriments: { 'energy-kcal_100g': 21, proteins_100g: 1 },
};
const OLD_PRODUCT = { code: '5900000000015', product_name: 'Skyr naturalny', brands: 'Testowa Mleczarnia', nutriments: { 'energy-kcal_100g': 63 } };

/** A pretend internet: the newer search and the old one answer however each test says. */
function upstream({ fresh, old }: { fresh: () => Response | Promise<Response>; old: () => Response | Promise<Response> }) {
  return vi.fn(async (url: string) => (new URL(url).hostname === 'search.openfoodfacts.org' ? fresh() : old()));
}

describe('search relay', () => {
  it('searches the newer service, inside the country, in its language and English', async () => {
    const fetcher = upstream({ fresh: () => reply({ count: 1, hits: [NEW_HIT] }), old: () => reply({}) });
    const res = await handle(req('/search?q=pomidory&country=en:poland&lang=pl'), { fetcher });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    const body = await res.json();
    expect(body.from).toBe('new');
    expect(body.products[0]).toMatchObject({ code: '5900783000150', product_name: 'Pomidory całe', brands: 'Nasza Spizarnia', quantity: '400 g' });
    const sent = new URL(fetcher.mock.calls[0][0] as string);
    expect(sent.searchParams.get('q')).toBe('pomidory countries_tags:"en:poland"');
    expect(sent.searchParams.get('langs')).toBe('pl,en');
    expect((fetcher.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'User-Agent': expect.stringContaining('MealPlan') });
  });

  it('falls back to the old search, retrying its 503s', async () => {
    let n = 0;
    const fetcher = upstream({
      fresh: () => reply({ error: 'down' }, 500),
      old: () => (++n < 3 ? new Response('busy', { status: 503 }) : reply({ count: 1, products: [OLD_PRODUCT] })),
    });
    const body = await (await handle(req('/search?q=skyr&country=en:poland&lang=pl'), { fetcher, delayMs: 0 })).json();
    expect(body.from).toBe('old');
    expect(body.products[0].code).toBe('5900000000015');
    expect(n).toBe(3);
  });

  it('asks the old search when the newer one finds nothing', async () => {
    const fetcher = upstream({ fresh: () => reply({ count: 0, hits: [] }), old: () => reply({ count: 1, products: [OLD_PRODUCT] }) });
    const body = await (await handle(req('/search?q=skyr'), { fetcher, delayMs: 0 })).json();
    expect(body.from).toBe('old');
  });

  it('says so when both are down', async () => {
    const fetcher = upstream({ fresh: () => new Response('', { status: 502 }), old: () => new Response('', { status: 503 }) });
    const res = await handle(req('/search?q=skyr'), { fetcher, delayMs: 0 });
    expect(res.status).toBe(502);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP); // so the app can read the message
  });

  it('only lets the app’s own site read the answer', async () => {
    const fetcher = upstream({ fresh: () => reply({ count: 1, hits: [NEW_HIT] }), old: () => reply({}) });
    const res = await handle(req('/search?q=x', 'https://someone-else.example'), { fetcher });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const pre = await handle(req('/search', APP, 'OPTIONS'));
    expect(pre.status).toBe(204);
  });

  it('turns away bad input', async () => {
    const fetcher = vi.fn();
    expect((await handle(req('/search?q='), { fetcher })).status).toBe(400);
    expect((await handle(req('/search?q=x&country=poland'), { fetcher })).status).toBe(400);
    expect((await handle(req('/search?q=x&page=99'), { fetcher })).status).toBe(400);
    expect((await handle(req('/other'), { fetcher })).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('answers repeat searches from the cache', async () => {
    const store = new Map<string, Response>();
    const cache = {
      match: async (k: Request) => store.get(k.url)?.clone(),
      put: async (k: Request, r: Response) => void store.set(k.url, r),
    };
    const waits: Promise<unknown>[] = [];
    const fetcher = upstream({ fresh: () => reply({ count: 1, hits: [NEW_HIT] }), old: () => reply({}) });
    await handle(req('/search?q=Pomidory&country=en:poland&lang=pl'), { fetcher, cache, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    const again = await handle(req('/search?q=pomidory&country=en:poland&lang=pl'), { fetcher, cache });
    expect(again.headers.get('X-Cache')).toBe('hit');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('strips query syntax from what was typed', () => {
    expect(cleanTerms('  "chocolate" balls (milk) countries_tags:x ')).toBe('chocolate balls milk countries_tags x');
    expect(cleanTerms('salt AND pepper')).toBe('salt and pepper');
    expect(prettyBrand('nasza-spizarnia')).toBe('Nasza Spizarnia');
    expect(prettyBrand('xx:pudliszki')).toBe('Pudliszki');
  });
});

describe('recipe pages', async () => {
  // @ts-expect-error plain JS worker, no types
  const { recipeFromHtml, isoMinutes, cleanText, publicUrl, findRecipe } = await import('../relay/src/worker.js');

  const page = (ld: unknown, extra = '') =>
    `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(ld)}</script>${extra}</head><body></body></html>`;

  const RECIPE = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Chicken &amp; rice',
    recipeYield: ['4', '4 servings'],
    prepTime: 'PT15M',
    cookTime: 'PT1H5M',
    image: [{ '@type': 'ImageObject', url: '/img/chicken.jpg' }],
    keywords: 'High Protein, Meal prep, a tag that is far too long to keep',
    recipeCategory: 'Dinner',
    recipeIngredient: ['500 g chicken breast', '200 g rice', '1 &frac12; tbsp olive oil', '<b>2</b> cloves garlic'],
    recipeInstructions: [
      { '@type': 'HowToSection', name: 'Prep', itemListElement: [{ '@type': 'HowToStep', text: 'Dice the chicken.' }] },
      { '@type': 'HowToStep', text: 'Cook the rice.<br>Mix.' },
    ],
  };

  it('reads a schema.org Recipe', () => {
    const r = recipeFromHtml(page(RECIPE), 'https://www.example.com/recipes/chicken');
    expect(r).toMatchObject({
      name: 'Chicken & rice',
      servings: 4,
      prepMin: 15,
      cookMin: 65,
      ingredients: ['500 g chicken breast', '200 g rice', '1 ½ tbsp olive oil', '2 cloves garlic'],
      steps: ['Dice the chicken.', 'Cook the rice.', 'Mix.'],
      image: 'https://www.example.com/img/chicken.jpg',
      tags: ['high protein', 'meal prep', 'dinner'],
      site: 'example.com',
    });
  });

  it('finds it inside @graph, next to other blocks and broken JSON', () => {
    const html =
      '<script type="application/ld+json">{ broken </script>' +
      page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { ...RECIPE, '@type': ['Recipe', 'NewsArticle'] }] });
    expect(recipeFromHtml(html, 'https://example.com/a')?.name).toBe('Chicken & rice');
    expect(findRecipe({ mainEntity: { '@type': 'Recipe', name: 'x' } })?.name).toBe('x');
  });

  it('splits a method given as one block of text', () => {
    const r = recipeFromHtml(page({ ...RECIPE, recipeInstructions: '<p>Boil water.</p><p>Add pasta.</p>' }), 'https://example.com/a');
    expect(r.steps).toEqual(['Boil water.', 'Add pasta.']);
    const numbered = recipeFromHtml(page({ ...RECIPE, recipeInstructions: '1. Boil water. 2. Add pasta. 3. Drain.' }), 'https://example.com/a');
    expect(numbered.steps).toEqual(['Boil water.', 'Add pasta.', 'Drain.']);
  });

  it('uses total time when there’s no prep or cook time', () => {
    const r = recipeFromHtml(page({ ...RECIPE, prepTime: undefined, cookTime: undefined, totalTime: 'PT45M' }), 'https://example.com/a');
    expect([r.prepMin, r.cookMin]).toEqual([null, 45]);
  });

  it('returns nothing for a page without a recipe', () => {
    expect(recipeFromHtml(page({ '@type': 'Article', name: 'News' }), 'https://example.com/a')).toBeNull();
    expect(recipeFromHtml('<html></html>', 'https://example.com/a')).toBeNull();
  });

  it('reads durations and cleans text', () => {
    expect(isoMinutes('PT1H30M')).toBe(90);
    expect(isoMinutes('P0DT0H20M')).toBe(20);
    expect(isoMinutes('PT0S')).toBeNull();
    expect(isoMinutes('soon')).toBeNull();
    expect(cleanText('Salt &amp; pepper&nbsp;to taste &#8211; &#x2153; cup')).toBe('Salt & pepper to taste – ⅓ cup');
  });

  it('only fetches ordinary public pages', () => {
    expect(publicUrl('https://www.kwestiasmaku.com/przepis/x')?.hostname).toBe('www.kwestiasmaku.com');
    for (const bad of ['file:///etc/passwd', 'http://localhost/x', 'http://127.0.0.1/x', 'http://[::1]/x', 'http://router/x', 'http://nas.local/x', 'https://a.com:8080/x', 'https://u:p@a.com/', 'nonsense']) {
      expect(publicUrl(bad), bad).toBeNull();
    }
  });

  it('serves recipes only to the app, and passes the page’s answer on', async () => {
    const fetcher = vi.fn(async () => new Response(page(RECIPE), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    const other = await handle(req('/recipe?url=https://example.com/a', 'https://someone-else.example'), { fetcher });
    expect(other.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    const ok = await handle(req('/recipe?url=' + encodeURIComponent('https://example.com/a')), { fetcher });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect((await ok.json()).ingredients).toHaveLength(4);
    const none = await handle(req('/recipe?url=https://example.com/b'), { fetcher: vi.fn(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })) });
    expect(none.status).toBe(422);
    expect((await none.json()).error).toMatch(/doesn’t share its recipe/);
    expect((await handle(req('/recipe?url=http://localhost/'), { fetcher })).status).toBe(400);
  });

  it('passes pictures through, and nothing else', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const pic = await handle(req('/image?url=https://example.com/a.png'), { fetcher: vi.fn(async () => new Response(png, { headers: { 'Content-Type': 'image/png' } })) });
    expect(pic.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await pic.arrayBuffer())).toEqual(png);
    const notPic = await handle(req('/image?url=https://example.com/a'), { fetcher: vi.fn(async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })) });
    expect(notPic.status).toBe(422);
  });
});
