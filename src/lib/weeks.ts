// Days by date, and whole weeks: copying, templates and clearing.

import type { Day, Entry, Plan, Template } from './types';
import { emptyDay, isEmptyDay } from './migrate';
import { mondayIndex } from './dates';
import { uid } from './num';

/** The stored day, or undefined when nothing is planned. Read-only use. */
export const dayAt = (plan: Plan, date: string): Day | undefined => plan.days[date];

/** The day for `date`, created if it isn't stored yet, so it can be changed. */
export function ensureDay(plan: Plan, date: string): Day {
  if (!plan.days[date]) plan.days[date] = emptyDay(plan.slots);
  const d = plan.days[date];
  for (const s of plan.slots) d.meals[s.id] ??= [];
  return d;
}

/**
 * The planned part of a day, as a fresh copy: what was eaten, swapped or added on the day is left behind, and every
 * entry gets a new id. This is what copying a week or saving a template takes.
 */
export function planOnly(plan: Plan, day: Day | undefined): Day {
  const out = emptyDay(plan.slots);
  if (!day) return out;
  for (const s of plan.slots) {
    out.meals[s.id] = (day.meals[s.id] ?? [])
      .filter((e) => !e.extra)
      .map((e): Entry => ({ id: uid(), ref: e.ref, amount: e.amount, measure: e.measure }));
  }
  out.supps = [...day.supps];
  return out;
}

/** Puts `days` (one per date, same order) onto `dates`, replacing what was there. */
function putDays(plan: Plan, dates: string[], days: Day[]) {
  dates.forEach((date, i) => {
    if (isEmptyDay(days[i])) delete plan.days[date];
    else plan.days[date] = days[i];
  });
}

export function copyWeek(plan: Plan, from: string[], to: string[]) {
  putDays(
    plan,
    to,
    from.map((d) => planOnly(plan, plan.days[d])),
  );
}

export const weekIsEmpty = (plan: Plan, dates: string[]) => dates.every((d) => isEmptyDay(plan.days[d]));

/** Templates are stored Monday first, so they fit any week whichever day it starts on. */
export function applyTemplate(plan: Plan, t: Template, dates: string[]) {
  putDays(
    plan,
    dates,
    dates.map((d) => planOnly(plan, t.days[mondayIndex(d)])),
  );
}

export function saveTemplate(plan: Plan, name: string, dates: string[]): Template {
  const days: Day[] = Array.from({ length: 7 }, () => emptyDay(plan.slots));
  for (const d of dates) days[mondayIndex(d)] = planOnly(plan, plan.days[d]);
  const t: Template = { id: uid(), name: name.trim() || 'Saved week', days };
  plan.templates.push(t);
  return t;
}

export function clearDates(plan: Plan, dates: string[]) {
  for (const d of dates) delete plan.days[d];
}

/** Every stored day, oldest first. */
export const storedDates = (plan: Plan) => Object.keys(plan.days).sort();
