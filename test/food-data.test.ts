import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankFood, fillBlanks, foodFromDraft, libraryMatch, nounOf, portionName, pushRecent, RECENT_MAX, toggleFavourite } from '../src/lib/foods';
import { basicDraft, loadBasic, parseBasic, queryTokens, resetBasic, searchBasic } from '../src/lib/basicFoods';
import { offDraft, offNutrients, offProduct, offSearch, OffError, RateLimit, relay, resetLimits, retryDelay, servingPortion, type OffProduct } from '../src/lib/off';

retryDelay.ms = 0;
const LIVE_RELAY = relay.url;
relay.url = '';
import { emptyPlan, normalize } from '../src/lib/migrate';
import { amountText } from '../src/lib/units';

const skyr: OffProduct = {
  code: '5900000000015',
  product_name: 'Skyr naturalny',
  brands: 'Testowa Mleczarnia, Inna',
  quantity: '150 g',
  product_quantity: 150,
  product_quantity_unit: 'g',
  serving_size: '1 pot (150 g)',
  serving_quantity: 150,
  nutriments: {
    'energy-kcal_100g': 63,
    'energy-kj_100g': 264,
    proteins_100g: 11,
    carbohydrates_100g: 3.9,
    sugars_100g: 3.9,
    fat_100g: 0.2,
    'saturated-fat_100g': 0.1,
    salt_100g: 0.1,
    calcium_100g: 0.12, // 120 mg
    'vitamin-d_100g': 0.0000011, // 1.1 µg
  },
};

describe('Open Food Facts product → food', () => {
  it('reads nutrients per 100 g and converts vitamins and minerals from grams', () => {
    const n = offNutrients(skyr.nutriments);
    expect(n).toMatchObject({ kcal: 63, protein: 11, carbs: 3.9, sugar: 3.9, fat: 0.2, satfat: 0.1, salt: 0.1, ca: 120, vitD: 1.1 });
    expect(n.fibre).toBeUndefined();
  });

  it('falls back to kJ for energy and sodium for salt', () => {
    expect(offNutrients({ 'energy-kj_100g': 418.4, sodium_100g: 0.4 })).toEqual({ kcal: 100, salt: 1 });
    expect(offNutrients({ energy_100g: '836.8' })).toEqual({ kcal: 200 });
  });

  it('ignores blanks, text and negative numbers', () => {
    expect(offNutrients({ proteins_100g: '', fat_100g: 'n/a', sugars_100g: -1 })).toEqual({});
  });

  it('builds a draft with brand, a counted serving and the pack', () => {
    const d = offDraft(skyr);
    expect(d.name).toBe('Skyr naturalny (Testowa Mleczarnia)');
    expect(d.unit).toBe('g');
    expect(d.portions).toEqual([{ name: 'pot', size: 150 }]); // pack is the same size, so it's not repeated
    expect(d.countBy).toBe(0);
    expect(d.source).toEqual({ db: 'off', id: '5900000000015' });
    expect(d.url).toBe('https://world.openfoodfacts.org/product/5900000000015');
  });

  it('spots drinks as ml', () => {
    expect(offDraft({ code: '1', product_name: 'Juice', quantity: '1 l', product_quantity: 1000, product_quantity_unit: 'ml' }).unit).toBe('ml');
    expect(offDraft({ code: '1', product_name: 'Water', quantity: '500 ml' }).unit).toBe('ml');
  });

  it('reads serving sizes', () => {
    expect(servingPortion({ code: '1', serving_size: '2 slices (50 g)', serving_quantity: 50 })).toEqual({ name: 'slice', size: 25, counted: true });
    expect(servingPortion({ code: '1', serving_size: '30 g', serving_quantity: 30 })).toEqual({ name: 'serving', size: 30, counted: false });
    expect(servingPortion({ code: '1', serving_size: '1 portion (30g)', serving_quantity: '30' })).toEqual({ name: 'portion', size: 30, counted: true });
    expect(servingPortion({ code: '1', serving_size: '2 cookies', serving_quantity: 24 })).toEqual({ name: 'cookie', size: 12, counted: true });
    expect(servingPortion({ code: '1', serving_size: '1 piece' })).toBeNull();
  });

  it('turns into a food that remembers its source', () => {
    const food = foodFromDraft(offDraft(skyr), '  Skyr  ');
    expect(food.name).toBe('Skyr');
    expect(food.per).toBe(100);
    expect(food.source).toEqual({ db: 'off', id: '5900000000015' });
    expect(food.measures[0]).toMatchObject({ name: 'pot', size: 150 });
    expect(food.countBy).toBe(food.measures[0].id);
    expect(food.note).toContain('Open Food Facts, barcode 5900000000015 (150 g)');
    expect(amountText(food, 2, food.countBy, 'metric')).toBe('2 pots');
  });
});

describe('Open Food Facts requests', () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  beforeEach(() => resetLimits());

  it('looks up a barcode and asks only for the fields it needs', async () => {
    const f = ok({ status: 1, product: skyr });
    const p = await offProduct('5900000000015', f);
    expect(p.product_name).toBe('Skyr naturalny');
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('/api/v2/product/5900000000015?fields=code,product_name');
    expect(url).toContain('app_name=MealPlan');
  });

  it('says when a barcode is unknown', async () => {
    await expect(offProduct('123', ok({ status: 0, status_verbose: 'product not found' }))).rejects.toMatchObject({ kind: 'notfound' });
    await expect(offProduct('123', ok({}, 404))).rejects.toMatchObject({ kind: 'notfound' });
  });

  it('turns network trouble into a readable error, after retrying', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(offProduct('1', down)).rejects.toBeInstanceOf(OffError);
    expect(down).toHaveBeenCalledTimes(2);
    await expect(offProduct('1', ok({}, 503))).rejects.toMatchObject({ kind: 'failed' });
    const busy = ok({}, 429);
    await expect(offProduct('1', busy)).rejects.toMatchObject({ kind: 'busy' });
    expect(busy).toHaveBeenCalledTimes(1); // told to slow down: no retry
  });

  it('retries a search that their server sheds (503, or a failed fetch with no CORS header)', async () => {
    let n = 0;
    const flaky = vi.fn(async () => {
      n++;
      if (n === 1) throw new TypeError('Failed to fetch');
      if (n === 2) return new Response('', { status: 503 });
      return new Response(JSON.stringify({ count: 1, products: [skyr] }));
    });
    const r = await offSearch('skyr', 'en:poland', 1, flaky);
    expect(r.products.length).toBe(1);
    expect(flaky).toHaveBeenCalledTimes(3);
    const dead = vi.fn(async () => new Response('', { status: 503 }));
    await expect(offSearch('skyr', '', 1, dead)).rejects.toThrow(/overloaded/);
    expect(dead).toHaveBeenCalledTimes(3);
  });

  it('searches within a country, or everywhere', async () => {
    const f = ok({ count: 2, products: [skyr, { code: '2', product_name: '' }] });
    const r = await offSearch('skyr', 'en:poland', 1, f);
    expect(r.products.map((p) => p.code)).toEqual(['5900000000015']); // nameless products are dropped
    const url = new URL(String((f.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe('/cgi/search.pl');
    expect(url.searchParams.get('search_terms')).toBe('skyr');
    expect(url.searchParams.get('tag_0')).toBe('en:poland');
    const all = ok({ count: 0, products: [] });
    await offSearch('skyr', '', 1, all);
    expect(new URL(String((all.mock.calls[0] as unknown[])[0])).searchParams.has('tag_0')).toBe(false);
  });

  describe('through the relay', () => {
    beforeEach(() => (relay.url = 'https://relay.test'));
    afterEach(() => (relay.url = ''));

    it('points at the deployed relay', () => {
      expect(LIVE_RELAY).toBe('https://meal-plan-search.sailncat.workers.dev');
    });

    it('asks the relay, with the country’s language', async () => {
      const f = ok({ count: 1, products: [skyr], from: 'new' });
      const r = await offSearch('skyr', 'en:poland', 1, f);
      expect(r.products[0].code).toBe(skyr.code);
      const url = new URL(String((f.mock.calls[0] as unknown[])[0]));
      expect(url.origin + url.pathname).toBe('https://relay.test/search');
      expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'skyr', country: 'en:poland', lang: 'pl', page: '1' });
    });

    it('falls back to Open Food Facts directly when the relay is down', async () => {
      const f = vi.fn(async (url: string) =>
        url.startsWith('https://relay.test') ? new Response('', { status: 500 }) : new Response(JSON.stringify({ count: 1, products: [skyr] })),
      );
      const r = await offSearch('skyr', '', 1, f);
      expect(r.products.length).toBe(1);
      expect(String((f.mock.calls[1] as unknown[])[0])).toContain('/cgi/search.pl');
    });

    it('passes on the relay’s reason for a bad search', async () => {
      await expect(offSearch('"', '', 1, ok({ error: 'Type something to search for' }, 400))).rejects.toThrow('Type something to search for');
    });
  });

  it('keeps to the rate limit', () => {
    const r = new RateLimit(2, 60_000);
    expect(r.take(0)).toBe(0);
    expect(r.take(1000)).toBe(0);
    expect(r.take(2000)).toBe(58_000);
    expect(r.take(60_001)).toBe(0);
  });
});

const file = {
  v: 1,
  keys: ['kcal', 'protein', 'carbs', 'fat', 'vitC'],
  foods: [
    [1, 'Egg, whole, raw, fresh', 'Dairy and Egg Products', [143, 12.6, 0.72, 9.51, null], [['large', 50], ['cup', 243]]],
    [2, 'Egg, yolk, raw, fresh', 'Dairy and Egg Products', [322, 15.9, 3.59, 26.5, null], [['large', 17]]],
    [3, 'Eggplant, raw', 'Vegetables and Vegetable Products', [25, 0.98, 5.88, 0.18, 2.2], [['cup, cubes', 82]]],
    [4, 'Bananas, raw', 'Fruits and Fruit Juices', [89, 1.09, 22.8, 0.33, 8.7], [['cup, sliced', 150], ['medium', 118]]],
    [5, 'Beef, ground, 85% lean meat / 15% fat, raw', 'Beef Products', [215, 18.6, 0, 15, null], []],
    [6, 'Bread, rye', 'Baked Products', [259, 8.5, 48.3, 3.3, 0.4], [['slice', 32]]],
  ],
} as const;

describe('basic foods', () => {
  const list = parseBasic(file as never);

  it('names size-only portions after the food', () => {
    expect(nounOf('Bananas, raw')).toBe('banana');
    expect(nounOf('Tomatoes, red')).toBe('tomato');
    expect(nounOf('Strawberries, raw')).toBe('strawberry');
    expect(nounOf('Egg, whole')).toBe('egg');
    expect(portionName('Egg, whole', 'large')).toBe('large egg');
    expect(portionName('Bread, rye', 'slice')).toBe('slice');
    expect(list[0].portions[0]).toEqual({ name: 'large egg', size: 50 });
  });

  it('finds whole words before prefixes, and eggs before eggplant', () => {
    expect(searchBasic(list, 'egg').map((f) => f.id)).toEqual([1, 2, 3]);
    expect(searchBasic(list, 'eggs')[0].id).toBe(1);
    expect(searchBasic(list, 'eggpl').map((f) => f.id)).toEqual([3]);
    expect(searchBasic(list, 'banana')[0].id).toBe(4);
    expect(searchBasic(list, 'raw egg yolk').map((f) => f.id)).toEqual([2]);
    expect(searchBasic(list, '')).toEqual([]);
  });

  it('understands British words', () => {
    expect(queryTokens('Beef mince')).toEqual(['beef', 'ground']);
    expect(searchBasic(list, 'beef mince').map((f) => f.id)).toEqual([5]);
    expect(searchBasic(list, 'aubergine').map((f) => f.id)).toEqual([3]);
  });

  it('starts counted in an obvious piece', () => {
    expect(basicDraft(list[0])).toMatchObject({ countBy: 0, unit: 'g', source: { db: 'usda', id: '1' } });
    expect(basicDraft(list.find((f) => f.id === 4)!).countBy).toBe(1); // medium banana, not the cup
    expect(basicDraft(list.find((f) => f.id === 6)!).countBy).toBe(0); // slice
    expect(basicDraft(list.find((f) => f.id === 3)!).countBy).toBeNull();
    const egg = foodFromDraft(basicDraft(list[0]), 'Eggs');
    expect(amountText(egg, 3, egg.countBy, 'metric')).toBe('3 large eggs');
    expect(egg.nut.vitC).toBeUndefined(); // missing stays missing, not 0
  });

  it('loads the file once and retries after a failure', async () => {
    resetBasic();
    const bad = vi.fn(async () => new Response('', { status: 500 }));
    await expect(loadBasic(bad)).rejects.toThrow();
    const good = vi.fn(async () => new Response(JSON.stringify(file)));
    expect((await loadBasic(good)).length).toBe(6);
    await loadBasic(good);
    expect(good).toHaveBeenCalledTimes(1);
    expect(String((good.mock.calls[0] as unknown[])[0])).toBe('./data/basic-foods.json');
    resetBasic();
  });
});

describe('library helpers', () => {
  it('fills only blank nutrients, scaled to the label amount', () => {
    const f = blankFood({ per: 50, nut: { kcal: 70, protein: 6 } });
    const filled = fillBlanks(f, { kcal: 143, protein: 12.6, fat: 9.51, vitD: 2 });
    expect(filled).toEqual(['fat', 'vitD']);
    expect(f.nut).toEqual({ kcal: 70, protein: 6, fat: 4.755, vitD: 1 });
    expect(fillBlanks(blankFood({ unit: 'tablet', per: 1 }), { kcal: 1 })).toEqual([]);
  });

  it('finds a food already added from the same entry', () => {
    const p = emptyPlan();
    p.foods.push(blankFood({ id: 'a', source: { db: 'off', id: '590' } }));
    expect(libraryMatch(p, { db: 'off', id: '590' })?.id).toBe('a');
    expect(libraryMatch(p, { db: 'usda', id: '590' })).toBeUndefined();
  });

  it('keeps recents newest first, unique and capped', () => {
    const p = emptyPlan();
    for (let i = 0; i < 20; i++) pushRecent(p, 'f:' + i);
    pushRecent(p, 'f:10');
    expect(p.recent.length).toBe(RECENT_MAX);
    expect(p.recent[0]).toBe('f:10');
    expect(p.recent.filter((r) => r === 'f:10').length).toBe(1);
  });

  it('toggles favourites', () => {
    const p = emptyPlan();
    toggleFavourite(p, 'r:x');
    expect(p.favourites).toEqual(['r:x']);
    toggleFavourite(p, 'r:x');
    expect(p.favourites).toEqual([]);
  });

  it('normalize keeps valid sources, favourites, recents and the country', () => {
    const p = emptyPlan();
    p.foods.push(blankFood({ id: 'a', source: { db: 'off', id: '590' } }), blankFood({ id: 'b' }));
    const raw = JSON.parse(JSON.stringify(p));
    raw.foods[1].source = { db: 'nope', id: 'x' };
    raw.favourites = ['f:a', 'f:gone', 'f:a', 42];
    raw.recent = ['f:b', 'x:a'];
    raw.settings.country = 'en:germany';
    const n = normalize(raw);
    expect(n.foods[0].source).toEqual({ db: 'off', id: '590' });
    expect('source' in n.foods[1]).toBe(false);
    expect(n.favourites).toEqual(['f:a']);
    expect(n.recent).toEqual(['f:b']);
    expect(n.settings.country).toBe('en:germany');
    expect(normalize({ ...raw, settings: { country: 'bad tag' } }).settings.country).toBe('en:poland');
    expect(normalize({ ...raw, settings: { country: '' } }).settings.country).toBe('');
  });
});

describe('barcodes', async () => {
  const { validBarcode, looksLikeBarcode } = await import('../src/lib/scan');
  it('checks the check digit', () => {
    expect(validBarcode('3017624010701')).toBe(true); // EAN-13
    expect(validBarcode('3017624010702')).toBe(false);
    expect(validBarcode('96385074')).toBe(true); // EAN-8
    expect(validBarcode('036000291452')).toBe(true); // UPC-A
    expect(validBarcode('04252614')).toBe(true); // UPC-E for 042100005264
    expect(validBarcode('12345')).toBe(false);
  });
  it('tells a barcode from a name', () => {
    expect(looksLikeBarcode('5900 0000 00017')).toBe(true);
    expect(looksLikeBarcode('skyr 2')).toBe(false);
  });
});

describe('packs from the databases', () => {
  it('keeps the pack size from Open Food Facts, with no price yet', () => {
    const d = offDraft(skyr);
    expect(d.pack).toEqual({ size: 150, price: null });
    const food = foodFromDraft(d, 'Skyr');
    expect(food.pack).toEqual({ size: 150, price: null });
    expect('aisle' in food).toBe(false);
  });
  it('has no pack for a basic food', () => {
    const list = parseBasic(file as never);
    expect('pack' in foodFromDraft(basicDraft(list[0]), 'Eggs')).toBe(false);
  });
});
