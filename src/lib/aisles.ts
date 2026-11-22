// Shop aisles for the shopping list, and guesses for foods picked from a database.

import type { AisleId, Food } from './types';

export const AISLES: { id: AisleId; name: string }[] = [
  { id: 'fruitveg', name: 'Fruit & veg' },
  { id: 'meat', name: 'Meat & fish' },
  { id: 'dairy', name: 'Dairy & eggs' },
  { id: 'bakery', name: 'Bread & bakery' },
  { id: 'grains', name: 'Rice, pasta & grains' },
  { id: 'tins', name: 'Tins & jars' },
  { id: 'frozen', name: 'Frozen' },
  { id: 'ready', name: 'Ready meals' },
  { id: 'snacks', name: 'Snacks & sweets' },
  { id: 'drinks', name: 'Drinks' },
  { id: 'pantry', name: 'Oils, spices & sauces' },
  { id: 'other', name: 'Other' },
];

const IDS = new Set(AISLES.map((a) => a.id));
export const isAisle = (v: unknown): v is AisleId => typeof v === 'string' && IDS.has(v as AisleId);
export const aisleOf = (f: Food): AisleId => f.aisle ?? 'other';
export const aisleName = (id: AisleId) => AISLES.find((a) => a.id === id)?.name ?? 'Other';

/** USDA SR Legacy food groups. */
const USDA: Record<string, AisleId> = {
  'Dairy and Egg Products': 'dairy',
  'Spices and Herbs': 'pantry',
  'Fats and Oils': 'pantry',
  'Poultry Products': 'meat',
  'Soups, Sauces, and Gravies': 'tins',
  'Sausages and Luncheon Meats': 'meat',
  'Breakfast Cereals': 'grains',
  'Fruits and Fruit Juices': 'fruitveg',
  'Pork Products': 'meat',
  'Vegetables and Vegetable Products': 'fruitveg',
  'Nut and Seed Products': 'snacks',
  'Beef Products': 'meat',
  Beverages: 'drinks',
  'Finfish and Shellfish Products': 'meat',
  'Legumes and Legume Products': 'grains',
  'Lamb, Veal, and Game Products': 'meat',
  'Baked Products': 'bakery',
  Sweets: 'snacks',
  'Cereal Grains and Pasta': 'grains',
  'Fast Foods': 'ready',
  'Meals, Entrees, and Side Dishes': 'ready',
  Snacks: 'snacks',
  'Restaurant Foods': 'ready',
};

export function aisleFromUsda(category: string, name = ''): AisleId {
  // Canned and frozen versions of basic foods sit with the tins and the freezer, not with fresh ones.
  if (/\bcanned\b/i.test(name)) return 'tins';
  if (/\bfrozen\b/i.test(name)) return 'frozen';
  return USDA[category] ?? 'other';
}

/** Open Food Facts category tags, most telling first: frozen peas belong in Frozen, tinned tomatoes in Tins. */
const OFF_RULES: [RegExp, AisleId][] = [
  [/^en:frozen/, 'frozen'],
  [/^en:canned|^en:tinned|^en:jams|^en:pickles|^en:soups|^en:tomato-sauces|^en:pasta-sauces/, 'tins'],
  [/^en:meals$|^en:prepared-|^en:pizzas|^en:sandwiches|^en:salads$/, 'ready'],
  [/^en:dairies|^en:cheeses|^en:yogurts|^en:milks|^en:eggs|^en:butters|^en:creams|^en:fermented-milk/, 'dairy'],
  [/^en:meats|^en:fishes|^en:seafood|^en:poultries|^en:sausages|^en:hams|^en:prepared-meats/, 'meat'],
  [/^en:breads|^en:pastries|^en:viennoiseries|^en:tortillas|^en:wraps/, 'bakery'],
  [/^en:condiments|^en:sauces|^en:spices|^en:herbs|^en:vegetable-oils|^en:olive-oils|^en:vinegars|^en:salts|^en:sugars$|^en:mayonnaises|^en:ketchup/, 'pantry'],
  [/^en:pastas|^en:rices|^en:cereal-grains|^en:breakfast-cereals|^en:flours|^en:legumes|^en:oat|^en:cereals-and-their-products|^en:dried-pulses/, 'grains'],
  [/^en:snacks|^en:sweet-snacks|^en:salty-snacks|^en:chocolates|^en:biscuits|^en:confectioneries|^en:candies|^en:nuts|^en:dried-fruits/, 'snacks'],
  [/^en:beverages|^en:waters|^en:juices|^en:sodas|^en:coffees|^en:teas/, 'drinks'],
  [/^en:fruits|^en:vegetables|^en:fresh-|^en:potatoes|^en:fruits-and-vegetables-based-foods/, 'fruitveg'],
];

export function aisleFromOff(tags: unknown): AisleId {
  const list = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
  for (const [rule, aisle] of OFF_RULES) if (list.some((t) => rule.test(t))) return aisle;
  return 'other';
}
