// How the app looks: light or dark, colour set, text size, spacing, and which gauges the day screen shows.
// Saved with the plan, and copied to the browser's local storage so the next start can apply it
// before anything is drawn (see the small script in index.html).

export type Theme = 'auto' | 'light' | 'dark';
export type Palette = 'crimson' | 'forest' | 'ocean' | 'plum' | 'slate';
export type TextSize = 'small' | 'normal' | 'large' | 'larger';
export type Density = 'roomy' | 'compact';

export interface Look {
  theme: Theme;
  palette: Palette;
  textSize: TextSize;
  density: Density;
}

export const DEFAULT_LOOK: Look = { theme: 'auto', palette: 'crimson', textSize: 'normal', density: 'roomy' };

/** The two colours each set is known by, for the swatches and the phone's status bar. Must match app.css. */
export const PALETTES: { id: Palette; name: string; light: [string, string]; dark: [string, string] }[] = [
  { id: 'crimson', name: 'Crimson', light: ['#8e2433', '#f5e2a8'], dark: ['#6b1f2b', '#f0cd6e'] },
  { id: 'forest', name: 'Forest', light: ['#2f5d43', '#efe3bd'], dark: ['#24452f', '#e3d29c'] },
  { id: 'ocean', name: 'Ocean', light: ['#1f3b63', '#f0e0bb'], dark: ['#1c3354', '#e9d4a3'] },
  { id: 'plum', name: 'Plum', light: ['#5a2a55', '#f5d9e0'], dark: ['#482244', '#f0c4cf'] },
  { id: 'slate', name: 'Slate', light: ['#3a3f46', '#f8dfa8'], dark: ['#33373d', '#f2b544'] },
];

export const TEXT_SIZES: { id: TextSize; name: string; scale: number }[] = [
  { id: 'small', name: 'Small', scale: 0.9 },
  { id: 'normal', name: 'Normal', scale: 1 },
  { id: 'large', name: 'Large', scale: 1.12 },
  { id: 'larger', name: 'Larger', scale: 1.25 },
];

const pick = <T extends string>(v: unknown, ok: readonly T[], fallback: T): T => (ok.includes(v as T) ? (v as T) : fallback);

export function cleanLook(v: Record<string, unknown>): Look {
  return {
    theme: pick(v.theme, ['auto', 'light', 'dark'], DEFAULT_LOOK.theme),
    palette: pick(
      v.palette,
      PALETTES.map((p) => p.id),
      DEFAULT_LOOK.palette,
    ),
    textSize: pick(
      v.textSize,
      TEXT_SIZES.map((t) => t.id),
      DEFAULT_LOOK.textSize,
    ),
    density: pick(v.density, ['roomy', 'compact'], DEFAULT_LOOK.density),
  };
}

export const LOOK_KEY = 'meal-plan-look';

export const isDark = (theme: Theme, systemDark: boolean) => theme === 'dark' || (theme === 'auto' && systemDark);

/** Puts the look on the page: attributes app.css keys off, the status bar colour, and the copy for the next start. */
export function applyLook(look: Look, systemDark: boolean, root: HTMLElement = document.documentElement) {
  const dark = isDark(look.theme, systemDark);
  root.dataset.mode = dark ? 'dark' : 'light';
  root.dataset.palette = look.palette;
  root.dataset.text = look.textSize;
  root.dataset.density = look.density;
  const p = PALETTES.find((x) => x.id === look.palette) ?? PALETTES[0];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', (dark ? p.dark : p.light)[0]);
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    // Private browsing can refuse storage; the look still applies once the plan loads.
  }
}

// ---------- day screen gauges ----------
// Which nutrients can have a gauge; what each is judged against is in gauges.ts.

export const GAUGE_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugar', 'salt', 'satfat'] as const;
export type GaugeKey = (typeof GAUGE_KEYS)[number];
export const DEFAULT_GAUGES: GaugeKey[] = ['kcal', 'protein', 'carbs', 'fat'];
export const MAX_GAUGES = 4;

export const GAUGE_NAMES: Record<GaugeKey, string> = {
  kcal: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fibre: 'Fibre',
  sugar: 'Sugars',
  salt: 'Salt',
  satfat: 'Saturated fat',
};
/** How a nutrient reads after its amount on a meal card: "32 g protein". */
const SHORT: Record<GaugeKey, string> = {
  kcal: '',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  fibre: 'fibre',
  sugar: 'sugars',
  salt: 'salt',
  satfat: 'sat fat',
};
export const gaugeShort = (k: GaugeKey) => SHORT[k];

/** 1 to 4 known gauges, in the list's order; anything else falls back to the usual four. */
export function cleanGauges(v: unknown): GaugeKey[] {
  const chosen = new Set(Array.isArray(v) ? v : []);
  const out = GAUGE_KEYS.filter((k) => chosen.has(k)).slice(0, MAX_GAUGES);
  return out.length ? out : [...DEFAULT_GAUGES];
}
