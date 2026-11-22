// Prices and costs, in one currency per plan.

export const CURRENCIES: { code: string; name: string; symbol: string; after: boolean }[] = [
  { code: 'PLN', name: 'Polish złoty', symbol: 'zł', after: true },
  { code: 'EUR', name: 'Euro', symbol: '€', after: false },
  { code: 'GBP', name: 'Pound sterling', symbol: '£', after: false },
  { code: 'USD', name: 'US dollar', symbol: '$', after: false },
  { code: 'CZK', name: 'Czech koruna', symbol: 'Kč', after: true },
  { code: 'HUF', name: 'Hungarian forint', symbol: 'Ft', after: true },
  { code: 'SEK', name: 'Swedish krona', symbol: 'kr', after: true },
  { code: 'NOK', name: 'Norwegian krone', symbol: 'kr', after: true },
  { code: 'DKK', name: 'Danish krone', symbol: 'kr', after: true },
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF', after: false },
  { code: 'UAH', name: 'Ukrainian hryvnia', symbol: '₴', after: true },
  { code: 'RON', name: 'Romanian leu', symbol: 'lei', after: true },
];

export const isCurrency = (v: unknown): v is string => typeof v === 'string' && CURRENCIES.some((c) => c.code === v);

/** "12.40 zł", "€12.40". Forints are shown without decimals. */
export function money(amount: number, code: string): string {
  const c = CURRENCIES.find((x) => x.code === code) ?? CURRENCIES[0];
  const digits = c.code === 'HUF' ? 0 : 2;
  const n = amount.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return c.after ? `${n} ${c.symbol}` : c.symbol.length > 1 ? `${c.symbol} ${n}` : `${c.symbol}${n}`;
}

export const currencySymbol = (code: string) => CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
