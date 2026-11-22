import { describe, expect, it } from 'vitest';
import { amountFor, matchOwn, nameScore, parseIngredient } from '../src/lib/ingredients';
import { blankFood } from '../src/lib/foods';

const p = (t: string) => {
  const r = parseIngredient(t);
  return [r.amount, r.unit, r.name, r.word];
};

describe('reading ingredient lines', () => {
  it('reads English lines', () => {
    expect(p('500 g chicken breast')).toEqual([500, 'g', 'chicken breast', null]);
    expect(p('500g chicken breast, diced')).toEqual([500, 'g', 'chicken breast', null]);
    expect(p('1 ½ tbsp olive oil')).toEqual([1.5, 'tbsp', 'olive oil', null]);
    expect(p('1 1/2 cups milk')).toEqual([1.5, 'cup', 'milk', null]);
    expect(p('1/2 tsp salt')).toEqual([0.5, 'tsp', 'salt', null]);
    expect(p('2 cloves garlic')).toEqual([2, 'piece', 'garlic', 'cloves']);
    expect(p('2-3 carrots')).toEqual([2, 'piece', 'carrots', null]);
    expect(p('1 kg potatoes')).toEqual([1000, 'g', 'potatoes', null]);
    expect(p('1 lb ground beef')).toEqual([453.59, 'g', 'ground beef', null]);
    expect(p('1 (400 g) can chopped tomatoes')).toEqual([400, 'g', 'chopped tomatoes', null]);
    expect(p('a pinch of salt')).toEqual([null, 'pinch', 'salt', null]);
    expect(p('Salt and pepper to taste')).toEqual([null, null, 'Salt and pepper', null]);
  });

  it('reads Polish lines', () => {
    expect(p('2 łyżki oliwy')).toEqual([2, 'tbsp', 'oliwy', null]);
    expect(p('1 łyżeczka soli')).toEqual([1, 'tsp', 'soli', null]);
    expect(p('pół szklanki ryżu')).toEqual([0.5, 'cup', 'ryżu', null]);
    expect(p('20 dag sera')).toEqual([200, 'g', 'sera', null]);
    expect(p('3 jajka')).toEqual([3, 'piece', 'jajka', null]);
    expect(p('2 ząbki czosnku')).toEqual([2, 'piece', 'czosnku', 'ząbki']);
    expect(p('1,5 l mleka')).toEqual([1500, 'ml', 'mleka', null]);
    expect(p('szczypta soli')).toEqual([null, 'pinch', 'soli', null]);
    expect(p('100 ml śmietany 18%')).toEqual([100, 'ml', 'śmietany 18%', null]);
  });
});

describe('matching to foods', () => {
  const foods = [
    blankFood({ id: 'milk', name: 'Milk 1.5-2%', unit: 'ml' }),
    blankFood({ id: 'chicken', name: 'Chicken breast (filet z piersi kurczaka)' }),
    blankFood({ id: 'egg', name: 'Eggs', measures: [{ id: 'm-egg', name: 'egg', size: 60 }], countBy: 'm-egg' }),
    blankFood({ id: 'oil', name: 'Olive oil', measures: [{ id: 'm-tbsp', name: 'tbsp', size: 13.5 }] }),
    blankFood({ id: 'rice', name: 'White rice (dry)' }),
    blankFood({ id: 'd3', name: 'Vitamin D3', supplement: true, unit: 'tablet', per: 1 }),
  ];

  it('scores word overlap, give or take Polish and English endings', () => {
    expect(nameScore('mleka', 'Milk (mleko)')).toBe(1);
    expect(nameScore('piersi z kurczaka', 'Chicken breast (filet z piersi kurczaka)')).toBe(1);
    expect(nameScore('rice', 'Ricotta')).toBe(0);
    // The last word is the food: chicken stock isn't chicken breast, but a red onion is an onion.
    expect(nameScore('chicken stock', 'Chicken breast')).toBeLessThan(0.5);
    expect(nameScore('red onion', 'Onion')).toBeGreaterThan(0.5);
    expect(nameScore('eggs', 'Egg (jajko)')).toBe(1);
  });

  it('finds your own foods', () => {
    expect(matchOwn(foods, 'chicken breast')?.id).toBe('chicken');
    expect(matchOwn(foods, 'piersi z kurczaka')?.id).toBe('chicken');
    expect(matchOwn(foods, 'eggs')?.id).toBe('egg');
    expect(matchOwn(foods, 'basmati rice')?.id).toBe('rice');
    expect(matchOwn(foods, 'paprika')).toBeNull();
    expect(matchOwn(foods, 'vitamin d3')).toBeNull(); // not supplements
  });

  it('puts amounts in the food’s own terms', () => {
    const [milk, chicken, egg, oil] = foods;
    expect(amountFor(chicken, parseIngredient('500 g chicken breast'))).toEqual({ amount: 500, measure: null, approx: false });
    expect(amountFor(egg, parseIngredient('3 eggs'))).toEqual({ amount: 3, measure: 'm-egg', approx: false });
    expect(amountFor(oil, parseIngredient('2 tbsp olive oil'))).toEqual({ amount: 2, measure: 'm-tbsp', approx: false });
    expect(amountFor(milk, parseIngredient('1 cup milk'))).toEqual({ amount: 1, measure: '@cup', approx: false });
    expect(amountFor(chicken, parseIngredient('1 tbsp chicken'))).toEqual({ amount: 15, measure: null, approx: true });
    expect(amountFor(milk, parseIngredient('200 g milk'))).toEqual({ amount: 200, measure: null, approx: true });
    expect(amountFor(chicken, parseIngredient('2 chicken breasts'))).toEqual({ amount: null, measure: null, approx: false });
    expect(amountFor(chicken, parseIngredient('salt to taste'))).toEqual({ amount: null, measure: null, approx: false });
  });
});

describe('importing a recipe', async () => {
  const { matchRows, buildRecipe, fetchRecipe } = await import('../src/lib/recipeImport');
  const { emptyPlan } = await import('../src/lib/migrate');
  const { parseBasic } = await import('../src/lib/basicFoods');
  const { relay } = await import('../src/lib/off');
  const { vi } = await import('vitest');

  const basic = parseBasic({
    v: 1,
    keys: ['kcal', 'protein'],
    foods: [
      [11, 'Garlic, raw', 'Vegetables and Vegetable Products', [149, 6.4], [['clove', 3], ['cup', 136]]],
      [12, 'Carrots, raw', 'Vegetables and Vegetable Products', [41, 0.9], [['medium', 61]]],
    ],
  } as never);
  const web = { name: 'Garlic chicken', servings: 2, prepMin: 10, cookMin: 30, ingredients: [], steps: ['Fry.'], image: null, url: 'https://example.com/r', site: 'example.com' };

  it('matches own foods, then basic foods, and leaves out what’s to taste', () => {
    const plan = emptyPlan();
    plan.foods.push(blankFood({ id: 'chicken', name: 'Chicken breast' }));
    const rows = matchRows(plan, basic, ['400 g chicken breast', '3 cloves garlic', '2 carrots', 'salt to taste', '1 tbsp paprika']);
    expect(rows.map((r) => [r.food?.name ?? null, r.amount, r.skip, r.pending])).toEqual([
      ['Chicken breast', 400, false, false],
      ['Garlic, raw', 3, false, true],
      ['Carrots, raw', 2, false, true],
      [null, null, true, false],
      [null, null, false, false],
    ]);
    expect(plan.foods).toHaveLength(1); // nothing added until it's saved
  });

  it('builds the recipe, adding the basic foods it uses and noting what was left out', () => {
    const plan = emptyPlan();
    plan.foods.push(blankFood({ id: 'chicken', name: 'Chicken breast' }));
    const rows = matchRows(plan, basic, ['400 g chicken breast', '3 cloves garlic', '1 clove garlic, minced', 'salt to taste', '1 tbsp paprika']);
    const r = buildRecipe(plan, web, rows, { name: ' Garlic chicken ', servings: 2, prepMin: 10, cookMin: 30, steps: ['Fry.', ' '], photo: null });
    expect(plan.recipes[0]).toBe(r);
    expect(r.lines).toHaveLength(3);
    expect(plan.foods.map((f) => f.name)).toEqual(['Chicken breast', 'Garlic, raw']); // garlic added once
    expect(r.lines[1].measure).toBe(plan.foods[1].measures.find((m) => m.name === 'clove')!.id);
    expect(r.notes).toBe('Not added from the original:\n• salt to taste\n• 1 tbsp paprika');
    expect(r).toMatchObject({ name: 'Garlic chicken', servings: 2, prepMin: 10, cookMin: 30, steps: ['Fry.'], source: 'https://example.com/r' });
  });

  it('passes on the relay’s reason when a page can’t be read', async () => {
    relay.url = 'https://relay.test';
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'This page doesn’t share its recipe' }), { status: 422 }));
    await expect(fetchRecipe('https://example.com/x', f)).rejects.toThrow('doesn’t share its recipe');
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe('https://relay.test/recipe?url=https%3A%2F%2Fexample.com%2Fx');
  });
});
