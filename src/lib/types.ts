// The whole plan is one document, saved on the device and in backup files.

/** Nutrient values for the food's `per` amount, keyed by nutrient id (see nutrients.ts). */
export type Nutrients = Record<string, number>;

export interface Food {
  id: string;
  name: string;
  /** What the food is measured in: g, ml, egg, wrap, tablet… */
  unit: string;
  /** The label values are for this many units (100 g, 30 g, 1 egg). */
  per: number;
  nut: Nutrients;
  note: string;
  /** Supplements are ticked per day instead of added to meals. */
  supplement: boolean;
}

export interface RecipeLine {
  food: string; // food id, "" while not picked yet
  amount: number | null;
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
}

export interface Day {
  /** Entries per slot id. */
  meals: Record<string, Entry[]>;
  /** Ids of supplement foods taken that day; each counts one label serving. */
  supps: string[];
}

export interface Targets {
  kcalLow: number;
  kcalHigh: number;
  proteinLow: number;
  proteinHigh: number;
}

export interface Meta {
  /** ISO time of the last backup export. */
  lastBackup: string | null;
  /** ISO date the backup reminder is snoozed until. */
  backupSnoozedUntil: string | null;
}

export interface Plan {
  app: 'meal-plan';
  version: 2;
  foods: Food[];
  recipes: Recipe[];
  slots: Slot[];
  /** Monday to Sunday. */
  week: Day[];
  targets: Targets;
  meta: Meta;
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
