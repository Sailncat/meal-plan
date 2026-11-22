import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptyPlan } from '../src/lib/migrate';
import { parseBasic } from '../src/lib/basicFoods';
import { addSamples, SAMPLES } from '../src/lib/samples';
import { addShared, decodeShare, encodeShare, recipeText, shareData, shareLink } from '../src/lib/share';
import { blankFood } from '../src/lib/foods';
import { blankRecipe } from '../src/lib/recipes';
import { baseAmount } from '../src/lib/units';
import type { Plan } from '../src/lib/types';

const basic = parseBasic(JSON.parse(readFileSync(new URL('../public/data/basic-foods.json', import.meta.url), 'utf8')));

function sharer(): { plan: Plan; id: string } {
  const plan = emptyPlan();
  const egg = blankFood({
    name: 'Egg',
    nut: { kcal: 143, protein: 12.6 },
    measures: [{ id: 'm1', name: 'large egg', size: 50 }],
    countBy: 'm1',
    source: { db: 'usda', id: '171287' },
    pack: { size: 10, price: 12.5 },
  });
  const rice = blankFood({ name: 'White rice (dry)', nut: { kcal: 365, protein: 7.1, carbs: 80 } });
  plan.foods.push(egg, rice);
  const r = blankRecipe({
    name: 'Egg fried rice',
    servings: 2,
    prepMin: 5,
    cookMin: 10,
    photo: 'data:image/jpeg;base64,AAAA',
    steps: ['Cook the rice.', 'Fry it with the eggs.'],
    notes: 'Day-old rice works best.',
    lines: [
      { food: egg.id, amount: 3, measure: 'm1' },
      { food: rice.id, amount: 150, measure: null },
    ],
  });
  plan.recipes.push(r);
  return { plan, id: r.id };
}

describe('sharing a recipe', () => {
  it('leaves the photo and prices behind', () => {
    const { plan, id } = sharer();
    const d = shareData(plan, plan.recipes.find((r) => r.id === id)!);
    expect(d.recipe.photo).toBeUndefined();
    expect(d.foods).toHaveLength(2);
    expect(d.foods.every((f) => !('pack' in f))).toBe(true);
  });

  it('survives the trip through a link', async () => {
    const { plan, id } = sharer();
    const code = await encodeShare(shareData(plan, plan.recipes[0]));
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(shareLink(code, 'https://sailncat.github.io/meal-plan/')).toBe(`https://sailncat.github.io/meal-plan/#add=${code}`);
    const back = await decodeShare(code);
    expect(back.recipe).toMatchObject({ name: 'Egg fried rice', servings: 2, prepMin: 5, cookMin: 10, steps: ['Cook the rice.', 'Fry it with the eggs.'] });
    expect(back.foods.map((f) => f.name)).toEqual(['Egg', 'White rice (dry)']);
    expect(back.foods[0].nut.kcal).toBe(143);
    expect(id).toBeTruthy();
  });

  it('says so when a link is damaged', async () => {
    await expect(decodeShare('not-a-real-code')).rejects.toThrow(/incomplete or damaged/);
  });

  it('adds new foods, and reuses ones you have, keeping amounts the same size', async () => {
    const { plan } = sharer();
    const shared = await decodeShare(await encodeShare(shareData(plan, plan.recipes[0])));

    // Someone with no foods gets both foods added.
    const fresh = emptyPlan();
    const r1 = addShared(fresh, shared);
    expect(fresh.foods).toHaveLength(2);
    expect(fresh.recipes[0]).toBe(r1);
    expect(r1.lines[0]).toMatchObject({ amount: 3, measure: 'm1' });

    // Someone who has the same egg (same database entry) but calls the piece "egg" keeps their own food.
    const mine = emptyPlan();
    const myEgg = blankFood({ name: 'Eggs (jajka)', nut: { kcal: 143 }, measures: [{ id: 'x', name: 'egg', size: 60 }], source: { db: 'usda', id: '171287' } });
    const myRice = blankFood({ name: 'white rice (DRY)', nut: { kcal: 360 } });
    mine.foods.push(myEgg, myRice);
    const r2 = addShared(mine, shared);
    expect(mine.foods).toHaveLength(2);
    expect(r2.lines.map((l) => l.food)).toEqual([myEgg.id, myRice.id]);
    // 3 large eggs = 150 g, which is 2.5 of their 60 g eggs.
    expect(baseAmount(myEgg, r2.lines[0].amount, r2.lines[0].measure)).toBeCloseTo(150, 5);
    expect(r2.lines[1]).toMatchObject({ amount: 150, measure: null });
  });

  it('writes readable text', () => {
    const { plan } = sharer();
    const t = recipeText(plan, plan.recipes[0]);
    expect(t).toContain('Egg fried rice\nMakes 2 servings · prep 5 min · cook 10 min');
    expect(t).toContain('• Egg: 3 large eggs');
    expect(t).toContain('• White rice (dry): 150 g');
    expect(t).toContain('Method\n1. Cook the rice.\n2. Fry it with the eggs.');
    expect(t).toMatch(/Per serving: \d+ kcal · \d+ g protein/);
    expect(t).toContain('Notes\nDay-old rice works best.');
  });
});

describe('sample recipes', () => {
  it('are all built from the basic foods, each food once', () => {
    const plan = emptyPlan();
    expect(addSamples(plan, basic)).toBe(SAMPLES.length);
    expect(plan.recipes.map((r) => r.name)).toEqual(SAMPLES.map((s) => s.name));
    const ids = plan.foods.map((f) => f.source?.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of plan.recipes) {
      expect(r.lines.every((l) => plan.foods.some((f) => f.id === l.food) && l.amount)).toBe(true);
      expect(r.steps.length).toBeGreaterThan(0);
    }
  });

  it('count eggs, slices and bananas in pieces', () => {
    const plan = emptyPlan();
    addSamples(plan, basic);
    const egg = plan.foods.find((f) => f.name === 'Egg')!;
    const line = plan.recipes.find((r) => r.name === 'Scrambled eggs on toast')!.lines.find((l) => l.food === egg.id)!;
    expect(egg.measures.find((m) => m.id === line.measure)?.name).toMatch(/large egg/);
    expect(plan.foods.find((f) => f.name.startsWith('Chopped tomatoes'))!.countBy).toBeNull();
  });
});
