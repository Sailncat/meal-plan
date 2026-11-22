// App state, saving to the device, and undo.

import { get, set } from 'idb-keyval';
import type { Plan } from './types';
import { emptyPlan, toPlan } from './migrate';
import { today } from './dates';

const KEY = 'plan';
const LS_KEY = 'meal-plan:plan';

export const store = $state({
  plan: null as Plan | null,
  loaded: false,
  save: 'idle' as 'idle' | 'saving' | 'saved' | 'error',
  /** Where the plan is kept: IndexedDB, localStorage as a fallback, or nowhere (memory only). */
  storage: 'idb' as 'idb' | 'local' | 'memory',
});

/** What's on screen, shared between screens. Not saved. */
export const ui = $state({
  /** The chosen day, and with it the week. */
  date: today(),
  /** A recipe someone shared by link, waiting to be added (the code from the link). */
  shared: null as string | null,
  /** A recipe the Recipes screen should open and scroll to. */
  showRecipe: null as string | null,
  /** First-run setup is open. */
  setup: false,
  /** The print view of the chosen week is open. */
  printing: false,
});

// ---------- reading and writing the device copy ----------

async function readRaw(): Promise<string | null> {
  try {
    const v = await get(KEY);
    store.storage = 'idb';
    if (v == null) return null;
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    /* IndexedDB unavailable, try the next option */
  }
  try {
    const v = localStorage.getItem(LS_KEY);
    store.storage = 'local';
    return v;
  } catch {
    store.storage = 'memory';
    return null;
  }
}

async function writeRaw(json: string): Promise<void> {
  if (store.storage === 'idb') {
    try {
      await set(KEY, json);
      return;
    } catch {
      store.storage = 'local';
    }
  }
  if (store.storage === 'local') {
    try {
      localStorage.setItem(LS_KEY, json);
      return;
    } catch {
      store.storage = 'memory';
    }
  }
  throw new Error('No storage on this device');
}

let lastSaved: string | null = null;
let pending: string | null = null;
let writing = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export async function load(): Promise<void> {
  const raw = await readRaw();
  if (raw) {
    try {
      const data = JSON.parse(raw);
      store.plan = toPlan(data);
      // A plan from an older version was just converted (an undated week landed on this week's dates), so save
      // the converted copy now; converting again on a later day would put it on a different week.
      lastSaved = data?.version === store.plan.version ? JSON.stringify(store.plan) : null;
    } catch {
      // Keep the unreadable copy aside instead of overwriting it.
      try {
        await set('plan-unreadable-' + Date.now(), raw);
      } catch {
        /* nothing more we can do */
      }
      store.plan = null;
    }
  }
  store.loaded = true;
  if (store.plan) requestPersistence();
}

export function queueSave(json: string): void {
  if (json === lastSaved) return;
  pending = json;
  store.save = 'saving';
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

async function flush(): Promise<void> {
  if (writing || pending == null) return;
  writing = true;
  const json = pending;
  pending = null;
  try {
    await writeRaw(json);
    lastSaved = json;
    store.save = 'saved';
  } catch {
    store.save = 'error';
  } finally {
    writing = false;
    if (pending != null) void flush();
  }
}

if (typeof document !== 'undefined') {
  // Write straight away when the app is put in the background or closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer);
      void flush();
    }
  });
}

/** Ask the browser not to clear the plan when space runs low (granted more readily to installed apps). */
async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

export function startEmpty(): void {
  store.plan = emptyPlan();
  requestPersistence();
}

export function replacePlan(plan: Plan): void {
  store.plan = plan;
  requestPersistence();
}

// ---------- toast and undo ----------

export const toast = $state({ msg: '', canUndo: false, key: 0 });
let undoFn: (() => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(msg: string, undo?: () => void): void {
  toast.msg = msg;
  toast.canUndo = !!undo;
  toast.key++;
  undoFn = undo ?? null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 8000 : 3500);
}

export function hideToast(): void {
  toast.msg = '';
  toast.canUndo = false;
  undoFn = null;
}

export function runUndo(): void {
  const f = undoFn;
  hideToast();
  f?.();
}

/** Makes a change that can be undone from the toast, like deleting a recipe or clearing the week. */
export function undoable(msg: string, mutate: (plan: Plan) => void): void {
  if (!store.plan) return;
  const before = JSON.stringify(store.plan);
  mutate(store.plan);
  showToast(msg, () => {
    store.plan = toPlan(JSON.parse(before));
  });
}
