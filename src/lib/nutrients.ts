// Daily goals for a man aged 19–30: US Dietary Reference Intakes; salt and sugar limits from WHO.
// Phase 3 replaces these with goals worked out from the user's own profile.

export interface NutrientDef {
  k: string;
  l: string; // long label
  s: string; // short label for table headers
  u: string; // unit
  g: 'Energy' | 'Macros' | 'Vitamins' | 'Minerals';
  min?: number;
  max?: number;
}

export const ENERGY: NutrientDef[] = [
  { k: 'kcal', l: 'Calories', s: 'kcal', u: 'kcal', g: 'Energy' },
  { k: 'protein', l: 'Protein', s: 'Protein', u: 'g', g: 'Energy' },
];

export const NUTRIENTS: NutrientDef[] = [
  { k: 'carbs', l: 'Carbohydrates', s: 'Carbs', u: 'g', g: 'Macros', min: 130 },
  { k: 'fat', l: 'Fat', s: 'Fat', u: 'g', g: 'Macros', min: 50, max: 88 },
  { k: 'satfat', l: 'Saturated fat', s: 'Sat fat', u: 'g', g: 'Macros', max: 25 },
  { k: 'sugar', l: 'Sugars (all)', s: 'Sugars', u: 'g', g: 'Macros', max: 56 },
  { k: 'fibre', l: 'Fibre', s: 'Fibre', u: 'g', g: 'Macros', min: 38 },
  { k: 'salt', l: 'Salt', s: 'Salt', u: 'g', g: 'Macros', max: 5 },
  { k: 'vitA', l: 'Vitamin A', s: 'Vit A', u: 'µg', g: 'Vitamins', min: 900 },
  { k: 'vitC', l: 'Vitamin C', s: 'Vit C', u: 'mg', g: 'Vitamins', min: 90 },
  { k: 'vitD', l: 'Vitamin D', s: 'Vit D', u: 'µg', g: 'Vitamins', min: 15 },
  { k: 'vitE', l: 'Vitamin E', s: 'Vit E', u: 'mg', g: 'Vitamins', min: 15 },
  { k: 'vitK', l: 'Vitamin K', s: 'Vit K', u: 'µg', g: 'Vitamins', min: 120 },
  { k: 'b1', l: 'Thiamin (B1)', s: 'B1', u: 'mg', g: 'Vitamins', min: 1.2 },
  { k: 'b2', l: 'Riboflavin (B2)', s: 'B2', u: 'mg', g: 'Vitamins', min: 1.3 },
  { k: 'b3', l: 'Niacin (B3)', s: 'B3', u: 'mg', g: 'Vitamins', min: 16 },
  { k: 'b6', l: 'Vitamin B6', s: 'B6', u: 'mg', g: 'Vitamins', min: 1.3 },
  { k: 'folate', l: 'Folate (B9)', s: 'Folate', u: 'µg', g: 'Vitamins', min: 400 },
  { k: 'b12', l: 'Vitamin B12', s: 'B12', u: 'µg', g: 'Vitamins', min: 2.4 },
  { k: 'ca', l: 'Calcium', s: 'Calcium', u: 'mg', g: 'Minerals', min: 1000 },
  { k: 'fe', l: 'Iron', s: 'Iron', u: 'mg', g: 'Minerals', min: 8 },
  { k: 'mg', l: 'Magnesium', s: 'Magnes.', u: 'mg', g: 'Minerals', min: 400 },
  { k: 'p', l: 'Phosphorus', s: 'Phosph.', u: 'mg', g: 'Minerals', min: 700 },
  { k: 'k', l: 'Potassium', s: 'Potass.', u: 'mg', g: 'Minerals', min: 3400 },
  { k: 'zn', l: 'Zinc', s: 'Zinc', u: 'mg', g: 'Minerals', min: 11 },
  { k: 'se', l: 'Selenium', s: 'Selen.', u: 'µg', g: 'Minerals', min: 55 },
];

export const ALL_NUTRIENTS = [...ENERGY, ...NUTRIENTS];
export const NUTRIENT_KEYS = new Set(ALL_NUTRIENTS.map((n) => n.k));
