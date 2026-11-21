import type { Plan } from './types';
import { PlanFormatError, toPlan } from './migrate';

/** Days between backup reminders. */
export const BACKUP_EVERY_DAYS = 7;
/** How long "Later" hides the reminder. */
export const SNOOZE_DAYS = 3;

const DAY_MS = 86_400_000;

export function backupFileName(now = new Date()): string {
  return `meal-plan-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** Downloads the whole plan as a file and records the time. */
export function exportBackup(plan: Plan): void {
  plan.meta.lastBackup = new Date().toISOString();
  plan.meta.backupSnoozedUntil = null;
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Reads a backup file: this app's own, or the plan from the old Claude artifact. */
export async function readBackup(file: File): Promise<Plan> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new PlanFormatError('That file isn’t a backup this app can read.');
  }
  return toPlan(data);
}

/**
 * Whether to show the backup reminder.
 * Returns null when not needed, otherwise the days since the last backup (null-ish "never" is Infinity).
 */
export function backupReminder(plan: Plan, now = new Date()): number | null {
  if (!plan.foods.length && !plan.recipes.length) return null;
  if (plan.meta.backupSnoozedUntil && now < new Date(plan.meta.backupSnoozedUntil)) return null;
  if (!plan.meta.lastBackup) return Infinity;
  const days = Math.floor((now.getTime() - new Date(plan.meta.lastBackup).getTime()) / DAY_MS);
  return days >= BACKUP_EVERY_DAYS ? days : null;
}

export function snoozeBackup(plan: Plan, now = new Date()): void {
  plan.meta.backupSnoozedUntil = new Date(now.getTime() + SNOOZE_DAYS * DAY_MS).toISOString();
}
