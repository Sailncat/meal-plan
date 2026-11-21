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
}

export interface Day {
  /** Entries per slot id. */
  meals: Record<string, Entry[]>;
  /** Ids of supplement foods taken that day; each counts one label serving. */
  supps: string[];
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
  /** Imperial uses UK fluid ounces (28.41 ml). */
  system: 'metric' | 'imperial';
  energy: 'kcal' | 'kJ';
}

export interface Plan {
  app: 'meal-plan';
  version: 2;
  settings: Settings;
  foods: Food[];
  recipes: Recipe[];
  slots: Slot[];
  /** Monday to Sunday. */
  week: Day[];
  targets: Targets;
  profile: Profile;
  /** Oldest first. */
  weights: WeightEntry[];
  meta: Meta;
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
