// Dates are kept as "YYYY-MM-DD" text in the device's own calendar. The maths below runs in UTC on purpose:
// a date has no time zone, and UTC has no daylight-saving jumps to make a "day" 23 or 25 hours long.

import { WEEKDAYS, WEEKDAYS_SHORT } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** Today's date on this device, as YYYY-MM-DD. */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => fromUtc(utc(iso) + n * DAY_MS);

/** Whole days from a to b (b later = positive). */
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY_MS);

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (iso: string) => new Date(utc(iso)).getUTCDay();

/** The first day of the week holding `iso`. */
export const weekStartOf = (iso: string, start: 0 | 1) => addDays(iso, -((weekday(iso) - start + 7) % 7));

/** The seven dates of the week holding `iso`. */
export function weekDates(iso: string, start: 0 | 1): string[] {
  const first = weekStartOf(iso, start);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** Index into a Monday-first list (templates). */
export const mondayIndex = (iso: string) => (weekday(iso) + 6) % 7;

/** "2026-11-21" → "21 Nov". Read straight from the text, so time zones can't shift the day. */
export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** "2026-11-21" → "21 Nov 2026". */
export const longDate = (iso: string) => `${shortDate(iso)} ${iso.slice(0, 4)}`;

export const dayName = (iso: string) => WEEKDAYS[weekday(iso)];
export const dayShort = (iso: string) => WEEKDAYS_SHORT[weekday(iso)];

/** "Saturday 21 Nov". */
export const dayTitle = (iso: string) => `${dayName(iso)} ${shortDate(iso)}`;

/** "16 – 22 Nov", "30 Nov – 6 Dec", "29 Dec 2026 – 4 Jan 2027". */
export function rangeText(from: string, to: string): string {
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${longDate(from)} – ${longDate(to)}`;
  if (from.slice(5, 7) === to.slice(5, 7)) return `${Number(from.slice(8, 10))} – ${shortDate(to)}`;
  return `${shortDate(from)} – ${shortDate(to)}`;
}
