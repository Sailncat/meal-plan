// Builds public/data/basic-foods.json from USDA FoodData Central, SR Legacy (April 2018, CC0 public domain).
//
//   node scripts/basic-foods/build.mjs --out public/data/basic-foods.json        downloads the CSV release
//   node scripts/basic-foods/build.mjs --dir path/to/csvs --out file.json        uses CSVs already on disk
//
// Run by .github/workflows/basic-foods.yml, since the app's own build has no need to download anything.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The download page has used a few file names for the same release over the years; the first that answers wins. */
export const SOURCE_URLS = [
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_%202019-04-02.zip',
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2019-04-02.zip',
];

/** App nutrient key → SR nutrient number, the unit SR stores it in, and how to convert to the app's unit. */
export const NUTRIENTS = [
  ['kcal', 208, 'KCAL', 1],
  ['protein', 203, 'G', 1],
  ['carbs', 205, 'G', 1],
  ['fat', 204, 'G', 1],
  ['satfat', 606, 'G', 1],
  ['sugar', 269, 'G', 1],
  ['fibre', 291, 'G', 1],
  ['salt', 307, 'MG', 2.5 / 1000], // sodium mg → salt g
  ['vitA', 320, 'UG', 1], // RAE
  ['vitC', 401, 'MG', 1],
  ['vitD', 328, 'UG', 1],
  ['vitE', 323, 'MG', 1], // alpha-tocopherol
  ['vitK', 430, 'UG', 1],
  ['b1', 404, 'MG', 1],
  ['b2', 405, 'MG', 1],
  ['b3', 406, 'MG', 1],
  ['b6', 415, 'MG', 1],
  ['folate', 435, 'UG', 1], // DFE
  ['b12', 418, 'UG', 1],
  ['ca', 301, 'MG', 1],
  ['fe', 303, 'MG', 1],
  ['mg', 304, 'MG', 1],
  ['p', 305, 'MG', 1],
  ['k', 306, 'MG', 1],
  ['zn', 309, 'MG', 1],
  ['se', 317, 'UG', 1],
];

const SKIP_CATEGORIES = new Set(['Baby Foods']);
/** Portions that just restate a weight unit the app already has. */
const SKIP_PORTION = /^(oz|ounce|g|gram|lb|pound|fl oz)\b/i;
const MAX_PORTIONS = 5;

/** Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

/** Rows as objects keyed by the header line, so column order never matters. */
function table(dir, name) {
  const path = join(dir, name);
  if (!existsSync(path)) throw new Error(`Missing ${name} in ${dir}`);
  const [head, ...rows] = parseCsv(readFileSync(path, 'utf8'));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

/** Three significant figures keeps the file small without losing anything a label would show. */
const sig = (n) => (n === 0 ? 0 : Number(n.toPrecision(3)));

export function buildFromCsvDir(dir) {
  const nutrientRows = table(dir, 'nutrient.csv');
  const idToSlot = new Map();
  NUTRIENTS.forEach(([key, nbr, unit], slot) => {
    const same = nutrientRows.filter((n) => n.nutrient_nbr !== '' && Number(n.nutrient_nbr) === nbr);
    if (!same.length) throw new Error(`Nutrient ${nbr} (${key}) not found`);
    const n = same.find((r) => r.unit_name.toUpperCase() === unit);
    if (!n) throw new Error(`Nutrient ${nbr} (${key}) is in ${same[0].unit_name}, expected ${unit}`);
    idToSlot.set(n.id, slot);
  });

  const categories = new Map(table(dir, 'food_category.csv').map((c) => [c.id, c.description]));
  const foods = new Map();
  for (const f of table(dir, 'food.csv')) {
    const cat = categories.get(f.food_category_id) ?? '';
    if (SKIP_CATEGORIES.has(cat)) continue;
    foods.set(f.fdc_id, { id: Number(f.fdc_id), name: f.description.trim(), cat, vals: NUTRIENTS.map(() => null), portions: [] });
  }

  for (const fn of table(dir, 'food_nutrient.csv')) {
    const food = foods.get(fn.fdc_id);
    const slot = idToSlot.get(fn.nutrient_id);
    if (!food || slot == null || fn.amount === '') continue;
    food.vals[slot] = sig(Number(fn.amount) * NUTRIENTS[slot][3]);
  }

  const portions = table(dir, 'food_portion.csv').sort((a, b) => Number(a.seq_num) - Number(b.seq_num));
  for (const p of portions) {
    const food = foods.get(p.fdc_id);
    if (!food) continue;
    const name = (p.modifier || p.portion_description || '').trim().replace(/\s+/g, ' ');
    const amount = Number(p.amount) || 1;
    const grams = Number(p.gram_weight);
    if (!name || !(grams > 0) || SKIP_PORTION.test(name)) continue;
    if (food.portions.length >= MAX_PORTIONS || food.portions.some(([n]) => n === name)) continue;
    food.portions.push([name, sig(grams / amount)]);
  }

  const list = [...foods.values()].filter((f) => f.vals[0] != null).sort((a, b) => a.name.localeCompare(b.name));
  return {
    v: 1,
    source: 'USDA FoodData Central, SR Legacy (April 2018)',
    license: 'CC0 1.0 (public domain)',
    keys: NUTRIENTS.map(([k]) => k),
    foods: list.map((f) => [f.id, f.name, f.cat, f.vals, f.portions]),
  };
}

function findCsvDir(root) {
  if (existsSync(join(root, 'food.csv'))) return root;
  for (const entry of readdirSync(root)) {
    const p = join(root, entry);
    if (statSync(p).isDirectory()) {
      const found = findCsvDir(p);
      if (found) return found;
    }
  }
  return null;
}

async function download() {
  for (const url of SOURCE_URLS) {
    console.log(`Trying ${url}`);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'meal-plan-basic-foods/1 (github.com/Sailncat/meal-plan)' } });
      const body = Buffer.from(await res.arrayBuffer());
      // A zip starts with "PK"; anything else is an error page.
      if (res.ok && body[0] === 0x50 && body[1] === 0x4b) return body;
      console.log(`  no: HTTP ${res.status}, ${body.length} bytes`);
    } catch (e) {
      console.log(`  no: ${e.message}`);
    }
  }
  throw new Error('None of the SR Legacy download links worked');
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  const out = args.out ?? 'public/data/basic-foods.json';
  let dir = args.dir;
  if (!dir) {
    const tmp = mkdtempSync(join(tmpdir(), 'sr-legacy-'));
    const zip = join(tmp, 'sr.zip');
    writeFileSync(zip, await download());
    execFileSync('unzip', ['-q', zip, '-d', tmp]);
    dir = findCsvDir(tmp);
    if (!dir) throw new Error('No food.csv in the download');
  }
  const data = buildFromCsvDir(dir);
  const json = JSON.stringify(data);
  writeFileSync(out, json);
  console.log(`Wrote ${data.foods.length} foods to ${out} (${(json.length / 1024).toFixed(0)} KB)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
