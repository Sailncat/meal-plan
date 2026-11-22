// The whole plan is one document, saved on the device and in backup files.

/** Nutrient values for the food's `per` amount, keyed by nutrient id (see nutrients.ts). */
export type Nutrients = Record<string, number>;

/** A way to count a food: 1 egg = 60 g, 1 slice = 35 g, 1 tbsp = 13.5 g. */
export interface Measure {
  id: string;
  /** Singular, like "egg", "slice", "medium onion". */
  name: string;
  /** How much one of it is, in the food's base unit. */
  size: number;
}

/** Where a food's values came from, when it was picked from a database. */
export interface FoodSource {
  db: 'off' | 'usda';
  /** Barcode for Open Food Facts, FDC id for USDA. */
  id: string;
}

export interface Food {
  id: string;
  name: string;
  /** The base unit the label values use: g, ml, or a counting word like "tablet" when the weight isn't known. */
  unit: string;
  /** The label values are for this many base units (100 g, 30 g, 1 tablet). */
  per: number;
  nut: Nutrients;
  note: string;
  /** Supplements are ticked per day instead of added to meals. */
  supplement: boolean;
  /** Ways to count it besides the base unit. */
  measures: Measure[];
  /** The measure new amounts start in (a measure id), or null for the base unit. */
  countBy: string | null;
  /** Set when it was picked from a database; used for credit and for finding missing values. */
  source?: FoodSource;
  /** The pack it's bought in, for what meals and days cost. */
  pack?: Pack;
}

export interface Pack {
  /** How much one pack holds, in the food's base unit (500 g, 1000 ml, 10 eggs). */
  size: number;
  /** What one pack costs, in the plan's currency; null when not known. */
  price: number | null;
}

/**
 * Amounts are stored in the unit they were entered in: `measure` is a measure id (3 eggs),
 * or null for the food's base unit (200 g). Base units are always metric; imperial is only for display.
 */
export interface RecipeLine {
  food: string; // food id, "" while not picked yet
  amount: number | null;
  measure: string | null;
}

export interface Recipe {
  id: string;
  name: string;
  /** How many meals one batch makes. */
  servings: number;
  lines: RecipeLine[];
  notes: string;
  /** Cooking steps, in order. */
  steps: string[];
  /** A JPEG data URL, shrunk to phone-screen size. */
  photo?: string;
  /** Minutes; null when not filled in. */
  prepMin: number | null;
  cookMin: number | null;
  /** The page it was imported from. */
  source?: string;
}

/** A meal the user has in their day: Breakfast, Lunch, Shakes… */
export interface Slot {
  id: string;
  name: string;
}

/**
 * One thing eaten in a meal.
 * ref is "r:<recipe id>" (amount = servings) or "f:<food id>" (amount in the food's unit).
 */
export interface Entry {
  id: string;
  ref: string;
  amount: number | null;
  /** For foods: a measure id, or null for the base unit. Always null for recipes (amount = servings). */
  measure: string | null;
  /** Ticked off as eaten. */
  eaten?: boolean;
  /** Planned but swapped for something else (the swap is an `extra` entry with `swapOf` = this id). */
  skipped?: boolean;
  /** Eaten but never planned, like what a meal was swapped for. Counts as eaten, not as planned. */
  extra?: boolean;
  /** For an extra entry: the planned entry it replaced. */
  swapOf?: string;
}

export interface Day {
  /** Entries per slot id. */
  meals: Record<string, Entry[]>;
  /** Ids of supplement foods planned that day; each counts one label serving. */
  supps: string[];
  /** Ids of the planned supplements ticked off as taken. */
  suppsTaken: string[];
}

/** A saved week to start new weeks from. */
export interface Template {
  id: string;
  name: string;
  /** Monday to Sunday. */
  days: Day[];
}

export interface Range {
  low: number;
  high: number;
}

export type MacroKey = 'kcal' | 'protein' | 'carbs' | 'fat';

/**
 * Daily targets the user typed. They're used where `custom` is true, and for calories and protein
 * until the profile is filled in. Otherwise the targets are worked out from the profile.
 */
export interface Targets {
  kcal: Range;
  protein: Range;
  carbs: Range;
  fat: Range;
  custom: Record<MacroKey, boolean>;
}

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very';
export type Aim = 'lose' | 'maintain' | 'gain';
export type Stage = 'none' | 'pregnant1' | 'pregnant2' | 'pregnant3' | 'breastfeeding';
/** Which official tables the vitamin and mineral goals come from. */
export type Standard = 'eu' | 'us';

export interface Profile {
  sex: Sex | null;
  birthYear: number | null;
  heightCm: number | null;
  activity: Activity;
  aim: Aim;
  /** kg a week to lose or gain. */
  pace: number;
  stage: Stage;
  standard: Standard;
}

export interface WeightEntry {
  /** YYYY-MM-DD */
  date: string;
  kg: number;
}

export interface Meta {
  /** ISO time of the last backup export. */
  lastBackup: string | null;
  /** ISO date the backup reminder is snoozed until. */
  backupSnoozedUntil: string | null;
}

export interface Settings {
  /** "imperial" means US customary units: oz, US fl oz (29.57 ml), US cups, lb, ft and in. */
  system: 'metric' | 'imperial';
  energy: 'kcal' | 'kJ';
  /** Open Food Facts country tag that packaged-food search is limited to, like "en:poland"; "" searches every country. */
  country: string;
  /** First day of the week: 1 = Monday, 0 = Sunday. */
  weekStart: 0 | 1;
  /** ISO currency code for prices, like "PLN". */
  currency: string;
}

export interface Plan {
  app: 'meal-plan';
  version: 3;
  settings: Settings;
  foods: Food[];
  recipes: Recipe[];
  slots: Slot[];
  /** Planned days by date (YYYY-MM-DD). Days with nothing in them aren't stored. */
  days: Record<string, Day>;
  templates: Template[];
  targets: Targets;
  profile: Profile;
  /** Oldest first. */
  weights: WeightEntry[];
  /** Starred foods and recipes, as "f:id" / "r:id". */
  favourites: string[];
  /** Last things added to a meal or recipe, newest first, as "f:id" / "r:id". */
  recent: string[];
  meta: Meta;
}

/** Weekday names by JavaScript's numbering: 0 = Sunday … 6 = Saturday. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
