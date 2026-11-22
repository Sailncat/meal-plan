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
