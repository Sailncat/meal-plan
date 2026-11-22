// Basic foods: USDA SR Legacy, shipped with the app as public/data/basic-foods.json so search works offline.

import type { Nutrients } from './types';
import { fold } from './num';
import { portionName, type FoodDraft } from './foods';

type Row = [id: number, name: string, category: string, values: (number | null)[], portions: [string, number][]];
interface BasicFile {
  v: number;
  keys: string[];
  foods: Row[];
}

export interface BasicFood {
  id: number;
  name: string;
  category: string;
  nut: Nutrients;
  portions: { name: string; size: number }[];
  /** Folded words of the name, for search. */
  words: string[];
  /** How many words the part before the first comma has: "Egg, whole, raw" → 1. */
  headWords: number;
  staple: boolean;
  /** Has a brand in capitals, like "CHOBANI": basic search puts generic foods first. */
  branded: boolean;
}

/**
 * The plain everyday version of common foods, so "milk" finds cow's milk before sheep's milk and "egg" finds a
 * whole egg before the yolk. Exact names from the data; matching still has to pass the normal word check.
 */
export const STAPLES = new Set([
  'Egg, whole, raw, fresh', 'Egg, whole, cooked, hard-boiled', 'Egg, whole, cooked, scrambled', 'Egg, whole, cooked, fried', 'Egg, white, raw, fresh',
  'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw', 'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
  'Chicken, broilers or fryers, thigh, meat only, cooked, roasted', 'Turkey, retail parts, breast, meat only, raw', 'Turkey, whole, meat only, raw',
  'Beef, ground, 80% lean meat / 20% fat, raw', 'Beef, ground, 85% lean meat / 15% fat, raw', 'Beef, ground, 90% lean meat / 10% fat, raw',
  'Pork, fresh, loin, tenderloin, separable lean only, raw', 'Ham, sliced, regular (approximately 11% fat)',
  'Fish, salmon, Atlantic, farmed, raw', 'Fish, salmon, Atlantic, farmed, cooked, dry heat', 'Fish, tuna, light, canned in water, drained solids',
  'Fish, cod, Atlantic, raw', 'Crustaceans, shrimp, raw',
  'Rice, white, long-grain, regular, raw, enriched', 'Rice, white, long-grain, regular, enriched, cooked', 'Rice, brown, long-grain, raw', 'Rice, brown, long-grain, cooked',
  'Oats', 'Pasta, dry, enriched', 'Pasta, cooked, enriched, without added salt', 'Quinoa, uncooked', 'Quinoa, cooked', 'Couscous, dry', 'Couscous, cooked',
  'Bread, whole-wheat, commercially prepared', 'Bread, white, commercially prepared (includes soft bread crumbs)', 'Bread, rye',
  'Tortillas, ready-to-bake or -fry, flour, refrigerated', 'Wheat flour, white, all-purpose, enriched, bleached',
  'Milk, whole, 3.25% milkfat, with added vitamin D', 'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D',
  'Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D', 'Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)',
  'Yogurt, Greek, plain, nonfat', 'Yogurt, Greek, plain, lowfat', 'Yogurt, Greek, plain, whole milk',
  'Cheese, cottage, lowfat, 2% milkfat', 'Cheese, cottage, creamed, large or small curd', 'Cheese, cheddar', 'Cheese, mozzarella, whole milk',
  'Cheese, mozzarella, part skim milk', 'Cheese, feta', 'Cheese, parmesan, grated', 'Cheese, cream', 'Butter, salted', 'Butter, without salt',
  'Cream, fluid, heavy whipping', 'Beverages, Protein powder whey based',
  'Bananas, raw', 'Apples, raw, with skin', 'Oranges, raw, all commercial varieties', 'Strawberries, raw', 'Blueberries, raw',
  'Grapes, red or green (European type, such as Thompson seedless), raw', 'Pineapple, raw, all varieties', 'Kiwifruit, green, raw', 'Avocados, raw, all commercial varieties',
  'Tomatoes, red, ripe, raw, year round average', 'Potatoes, flesh and skin, raw', 'Sweet potato, raw, unprepared', 'Broccoli, raw', 'Spinach, raw', 'Carrots, raw',
  'Onions, raw', 'Garlic, raw', 'Cucumber, with peel, raw', 'Peppers, sweet, red, raw', 'Peppers, sweet, green, raw', 'Lettuce, cos or romaine, raw',
  'Mushrooms, white, raw', 'Corn, sweet, yellow, raw', 'Peas, green, raw', 'Squash, summer, zucchini, includes skin, raw', 'Cabbage, raw', 'Cauliflower, raw',
  'Beans, kidney, all types, mature seeds, canned', 'Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, drained solids', 'Lentils, raw',
  'Lentils, mature seeds, cooked, boiled, without salt', 'Tofu, raw, firm, prepared with calcium sulfate',
  'Nuts, almonds', 'Nuts, walnuts, english', 'Peanut butter, smooth style, with salt', 'Oil, olive, salad or cooking', 'Honey', 'Sugars, granulated',
  'Chocolate, dark, 70-85% cacao solids', 'Hummus, commercial', 'Catsup', 'Salad dressing, mayonnaise, regular',
]);

/** British and European English for things the US data names differently. */
const SYNONYMS: Record<string, string[]> = {
  mince: ['ground'],
  minced: ['ground'],
  courgette: ['zucchini'],
  courgettes: ['zucchini'],
  aubergine: ['eggplant'],
  aubergines: ['eggplant'],
  prawn: ['shrimp'],
  prawns: ['shrimp'],
  yoghurt: ['yogurt'],
  porridge: ['oats'],
  wholemeal: ['whole', 'wheat'],
  wholegrain: ['whole', 'grain'],
  beetroot: ['beets'],
  rocket: ['arugula'],
  crisps: ['potato', 'chips'],
  swede: ['rutabagas'],
  skimmed: ['nonfat'],
  capsicum: ['peppers', 'sweet'],
  ketchup: ['catsup'],
  mayo: ['mayonnaise'],
};

let loaded: Promise<BasicFood[]> | null = null;

export function parseBasic(file: BasicFile): BasicFood[] {
  return file.foods.map(([id, name, category, values, portions]) => {
    const nut: Nutrients = {};
    file.keys.forEach((k, i) => {
      if (values[i] != null) nut[k] = values[i] as number;
    });
    return {
      id,
      name,
      category,
      nut,
      portions: portions.map(([n, size]) => ({ name: portionName(name, n), size })),
      words: fold(name).split(/[^a-z0-9%]+/).filter(Boolean),
      headWords: fold(name.split(',')[0]).split(/[^a-z0-9%]+/).filter(Boolean).length,
      staple: STAPLES.has(name),
      branded: /\b[A-Z]{3,}\b/.test(name.replace(/\b(USDA|NFS|NS|UPC)\b/g, '')),
    };
  });
}

/** Loads the list once. Relative URL, so it works under the GitHub Pages sub-path and from the offline cache. */
export function loadBasic(fetcher: typeof fetch = fetch): Promise<BasicFood[]> {
  loaded ??= fetcher('./data/basic-foods.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(parseBasic)
    .catch((e) => {
      loaded = null; // try again next time
      throw e;
    });
  return loaded;
}

/** For tests. */
export function resetBasic() {
  loaded = null;
}

/** "eggs" should find "Egg", "tomatoes" "Tomato", "berries" "Berry". */
function stems(token: string): string[] {
  const out = [token];
  if (token.length > 3 && token.endsWith('ies')) out.push(token.slice(0, -3) + 'y');
  if (token.length > 3 && token.endsWith('es')) out.push(token.slice(0, -2));
  if (token.length > 2 && token.endsWith('s')) out.push(token.slice(0, -1));
  return out;
}

const PLAIN = new Set(['raw', 'whole', 'fresh', 'plain']);
const PROCESSED = new Set(['dried', 'dehydrated', 'powder', 'imitation', 'substitute', 'flavored', 'frozen', 'mix', 'babyfood', 'canned', 'fried', 'breaded']);

export function queryTokens(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9%]+/)
    .filter(Boolean)
    .flatMap((t) => SYNONYMS[t] ?? [t]);
}

/**
 * Every word typed has to start a word of the name. A word typed in full counts more than a prefix, a match in the
 * name's head ("Chicken" in "Chicken, breast, roasted") more than one further along, everyday staples and plain raw
 * foods come before prepared and branded ones, and shorter names win ties.
 */
export function searchBasic(list: BasicFood[], query: string, limit = 30): BasicFood[] {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  const scored: [BasicFood, number][] = [];
  for (const f of list) {
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      const forms = stems(t);
      let best = -1;
      f.words.forEach((w, i) => {
        const whole = w === t || w === t + 's' || w === t + 'es' ? 1 : forms.includes(w) ? 0.8 : 0;
        if (!whole && !forms.some((s) => w.startsWith(s))) return;
        best = Math.max(best, (i < f.headWords ? 2 : 0.6) + whole + (i === 0 ? 0.4 : 0));
      });
      if (best < 0) {
        ok = false;
        break;
      }
      score += best;
    }
    if (!ok) continue;
    if (f.staple) score += 2.5;
    if (f.branded) score -= 1;
    for (const w of f.words) {
      if (PLAIN.has(w)) score += 0.3;
      else if (PROCESSED.has(w)) score -= 0.3;
    }
    score -= f.words.length * 0.06;
    scored.push([f, score]);
  }
  return scored
    .sort((a, b) => b[1] - a[1] || a[0].name.length - b[0].name.length)
    .slice(0, limit)
    .map(([f]) => f);
}

export function basicDraft(f: BasicFood): FoodDraft {
  // A food with an obvious piece (a large egg, a medium banana, a slice) starts counted in it.
  const piece = f.portions.findIndex((p) => /^(large|medium) |^slice\b/i.test(p.name));
  return {
    name: f.name,
    brand: '',
    unit: 'g',
    nut: { ...f.nut },
    portions: f.portions.map((p) => ({ ...p })),
    countBy: piece >= 0 ? piece : null,
    source: { db: 'usda', id: String(f.id) },
    url: `https://fdc.nal.usda.gov/food-details/${f.id}/nutrients`,
    quantity: '',
  };
}
