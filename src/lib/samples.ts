// Sample recipes for a new plan, so the app never starts empty. Built from the basic foods that
// ship with the app, so the nutrients are real and it works offline.

import type { Food, Plan, Recipe } from './types';
import { basicDraft, type BasicFood } from './basicFoods';
import { foodFromDraft, libraryMatch } from './foods';
import { blankRecipe } from './recipes';

/** USDA FoodData Central ids, with a friendlier name than the database's. */
const FOODS = {
  oats: [173904, 'Oats'],
  milk: [171267, 'Milk, 2%'],
  banana: [173944, 'Banana'],
  chicken: [171077, 'Chicken breast'],
  rice: [168877, 'White rice (dry)'],
  broccoli: [170379, 'Broccoli'],
  oil: [171413, 'Olive oil'],
  egg: [171287, 'Egg'],
  bread: [172688, 'Wholemeal bread'],
  butter: [173410, 'Butter'],
  yogurt: [170894, 'Greek yogurt, plain'],
  blueberries: [171711, 'Blueberries'],
  peanut: [172470, 'Peanut butter'],
  tuna: [173709, 'Tuna in water (drained)'],
  pasta: [169736, 'Pasta (dry)'],
  tomatoes: [170051, 'Chopped tomatoes (canned)'],
  onion: [170000, 'Onion'],
} as const satisfies Record<string, readonly [number, string]>;
type Key = keyof typeof FOODS;

/** An ingredient: grams, or a count of a measure found by name (a large egg, a slice, a tablespoon). */
type Line = [Key, number] | [Key, number, RegExp];

interface Sample {
  name: string;
  servings: number;
  prepMin: number | null;
  cookMin: number | null;
  lines: Line[];
  steps: string[];
}

export const SAMPLES: Sample[] = [
  {
    name: 'Overnight oats with banana',
    servings: 1,
    prepMin: 5,
    cookMin: null,
    lines: [
      ['oats', 60],
      ['milk', 200],
      ['banana', 1, /medium/i],
    ],
    steps: [
      'Stir the oats into the milk in a jar or bowl.',
      'Slice the banana on top, cover, and leave it in the fridge overnight.',
      'Eat it cold, or warm it in the microwave for a minute.',
    ],
  },
  {
    name: 'Chicken, rice and broccoli',
    servings: 4,
    prepMin: 10,
    cookMin: 25,
    lines: [
      ['chicken', 600],
      ['rice', 300],
      ['broccoli', 400],
      ['oil', 2, /tablespoon|tbsp/i],
    ],
    steps: [
      'Cook the rice as the packet says.',
      'Cut the chicken into bite-size pieces, season it, and fry it in the oil for 8–10 minutes, until cooked through.',
      'Steam or boil the broccoli for about 5 minutes.',
      'Split everything between 4 boxes. It keeps for 3–4 days in the fridge.',
    ],
  },
  {
    name: 'Scrambled eggs on toast',
    servings: 1,
    prepMin: 2,
    cookMin: 5,
    lines: [
      ['egg', 3, /large/i],
      ['bread', 2, /slice/i],
      ['butter', 10],
    ],
    steps: [
      'Toast the bread.',
      'Whisk the eggs with a pinch of salt.',
      'Melt the butter in a pan over a low heat, add the eggs and stir slowly until just set.',
      'Pile the eggs onto the toast.',
    ],
  },
  {
    name: 'Greek yogurt bowl',
    servings: 1,
    prepMin: 3,
    cookMin: null,
    lines: [
      ['yogurt', 200],
      ['blueberries', 80],
      ['peanut', 1, /tbsp|tablespoon/i],
    ],
    steps: ['Spoon the yogurt into a bowl.', 'Top it with the blueberries and the peanut butter.'],
  },
  {
    name: 'Tuna and tomato pasta',
    servings: 2,
    prepMin: 5,
    cookMin: 15,
    lines: [
      ['pasta', 160],
      ['tuna', 1, /^can\b(?!, drained)/i],
      ['tomatoes', 400],
      ['onion', 1, /medium|large/i],
      ['oil', 1, /tablespoon|tbsp/i],
    ],
    steps: [
      'Boil the pasta as the packet says.',
      'Meanwhile, chop the onion and soften it in the oil for 5 minutes.',
      'Add the tomatoes and simmer for 5 minutes, then stir in the tuna.',
      'Drain the pasta and mix it into the sauce.',
    ],
  },
];

/**
 * Adds the sample recipes and the foods they use. A sample whose foods can't all be found is left
 * out rather than added half-made. Returns how many recipes were added.
 */
export function addSamples(plan: Plan, basic: BasicFood[]): number {
  const byId = new Map(basic.map((b) => [b.id, b]));
  const food = (k: Key): Food | null => {
    const [id, name] = FOODS[k];
    const have = libraryMatch(plan, { db: 'usda', id: String(id) });
    if (have) return have;
    const b = byId.get(id);
    if (!b) return null;
    const f = foodFromDraft(basicDraft(b), name);
    // Canned tomatoes come by weight; the database's "large tomato" is for fresh ones.
    if (k === 'tomatoes') f.countBy = null;
    plan.foods.push(f);
    return f;
  };
  const added: Recipe[] = [];
  for (const s of SAMPLES) {
    const lines = s.lines.map(([k, amount, measure]) => {
      const f = food(k);
      if (!f) return null;
      const m = measure ? f.measures.find((x) => measure.test(x.name)) : undefined;
      // Without the measure the amount would be wrong, so the sample is left out.
      if (measure && !m) return null;
      return { food: f.id, amount, measure: m?.id ?? null };
    });
    if (lines.some((l) => !l)) continue;
    added.push(
      blankRecipe({ name: s.name, servings: s.servings, prepMin: s.prepMin, cookMin: s.cookMin, steps: [...s.steps], lines: lines as Recipe['lines'] }),
    );
  }
  plan.recipes.push(...added);
  return added.length;
}
