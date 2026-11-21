// Shortcuts for showing energy and amounts in the user's chosen units. They read the live plan,
// so anything that calls them from a component updates when a setting changes.

import type { Food } from './types';
import { store } from './store.svelte';
import { amountText, energyUnit, fromEnergy, toEnergy } from './units';
import { DEFAULT_SETTINGS } from './units';

const settings = () => store.plan?.settings ?? DEFAULT_SETTINGS;

/** kcal in the chosen energy unit. */
export const E = (kcal: number) => toEnergy(kcal, settings());
/** "kcal" or "kJ". */
export const EU = () => energyUnit(settings());
/** "metric" or "imperial". */
export const system = () => settings().system;
/** "3 eggs", "250 g", "8.8 oz". */
export const amountOf = (food: Food, amount: number | null, measure: string | null) => amountText(food, amount, measure, system());
/** A number typed in the chosen energy unit, back to kcal. */
export const fromE = (v: number) => fromEnergy(v, settings());
