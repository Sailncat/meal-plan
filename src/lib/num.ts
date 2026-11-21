/** Any value to a finite number, or 0. */
export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** What the user typed to a number, or null when blank. Accepts "1,5" as well as "1.5". */
export function parseInput(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '.') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** A number as it should appear inside an input box: no thousands separators, up to 2 decimals. */
export function toInput(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  return String(Math.round(v * 100) / 100);
}

const whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const two = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

/** Whole number with thousands separators: 2,345. */
export const fmt0 = (n: number) => whole.format(Math.round(n));
/** Up to one decimal. */
export const fmt1 = (n: number) => one.format(n);
/** Sensible precision for nutrient amounts of any size. */
export function fmtN(v: number): string {
  const a = Math.abs(v);
  if (a >= 100) return whole.format(v);
  if (a >= 10) return one.format(v);
  return two.format(v);
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Lowercase, accents stripped: for forgiving search ("losos" finds "łosoś"). */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');
}
