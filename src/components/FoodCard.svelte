<script lang="ts">
  import type { Food } from '../lib/types';
  import { allDays, foodNut, foodUsedIn } from '../lib/calc';
  import { ALL_NUTRIENTS, NUTRIENTS } from '../lib/nutrients';
  import { currencySymbol } from '../lib/money';
  import { fmt0, fmt1, uid } from '../lib/num';
  import { baseAmount, measureOf, measuresOf, plural } from '../lib/units';
  import { E, EU, amountOf, fromE, system } from '../lib/display';
  import { store, undoable } from '../lib/store.svelte';
  import NumInput from './NumInput.svelte';
  import FoodSearch from './FoodSearch.svelte';
  import { blanksFilledBy, fillBlanks } from '../lib/foods';

  interface Props {
    food: Food;
    open: boolean;
    ontoggle: () => void;
  }
  let { food, open, ontoggle }: Props = $props();

  const plan = $derived(store.plan!);
  const used = $derived(open ? foodUsedIn(plan, food.id) : []);
  /** Recipes keep a line for a deleted food, so those have to be changed first; meals just lose it. */
  const inRecipes = $derived(open ? plan.recipes.filter((r) => r.lines.some((l) => l.food === food.id)) : []);

  function setPack(size: number | null, price: number | null) {
    if (size == null || !(size > 0)) delete food.pack;
    else food.pack = { size, price: price != null && price >= 0 ? price : null };
  }

  const MAIN = ['carbs', 'fat'];
  const more = NUTRIENTS.filter((n) => !MAIN.includes(n.k));
  const filled = $derived(more.filter((n) => food.nut[n.k] != null).length);

  // The summary line describes one of whatever the food is counted in by default.
  const startMeasure = $derived(food.countBy && measureOf(food, food.countBy) ? food.countBy : null);
  const startAmount = $derived(startMeasure ? 1 : food.per);
  const startBase = $derived(baseAmount(food, startAmount, startMeasure));
  const summary = $derived(
    `${fmt0(E(foodNut(food, startBase, 'kcal')))} ${EU()} · ${fmt1(foodNut(food, startBase, 'protein'))} g protein per ${amountOf(food, startAmount, startMeasure).replace(/^1 /, '')}`,
  );
  const byWhat = $derived(food.unit === 'g' ? ' (by weight)' : food.unit === 'ml' ? ' (by volume)' : '');

  function setNut(k: string, v: number | null) {
    if (v == null) delete food.nut[k];
    else food.nut[k] = v;
  }

  function setSupplement(on: boolean) {
    if (on) {
      food.supplement = true;
      return;
    }
    undoable(`${food.name || 'This food'} is no longer a supplement`, (p) => {
      food.supplement = false;
      for (const d of allDays(p)) {
        d.supps = d.supps.filter((id) => id !== food.id);
        d.suppsTaken = d.suppsTaken.filter((id) => id !== food.id);
      }
    });
  }

  function addMeasure() {
    const id = uid();
    food.measures.push({ id, name: '', size: food.per });
    queueMicrotask(() => document.querySelector<HTMLInputElement>(`#way-${id}`)?.focus());
  }

  /** Removing a way to count it turns every amount that used it back into the base unit, so nothing changes size. */
  function removeMeasure(id: string) {
    const m = food.measures.find((x) => x.id === id);
    if (!m) return;
    undoable(`Removed “${m.name || 'unnamed'}” from ${food.name || 'this food'}`, (p) => {
      const back = (o: { amount: number | null; measure: string | null }) => {
        if (o.measure !== id) return;
        o.amount = o.amount == null ? null : Math.round(o.amount * m.size * 10) / 10;
        o.measure = null;
      };
      for (const r of p.recipes) for (const l of r.lines) if (l.food === food.id) back(l);
      for (const d of allDays(p)) for (const list of Object.values(d.meals)) for (const e of list) if (e.ref === 'f:' + food.id) back(e);
      if (food.countBy === id) food.countBy = null;
      food.measures = food.measures.filter((x) => x.id !== id);
    });
  }

  // ---------- filling blanks from a database ----------
  let finding = $state(false);
  const canFill = $derived((food.unit === 'g' || food.unit === 'ml') && ALL_NUTRIENTS.some((n) => food.nut[n.k] == null));
  function fill(nut: Record<string, number>, from: string) {
    const n = blanksFilledBy(food, nut).length;
    undoable(`Filled ${n} value${n === 1 ? '' : 's'} in ${food.name || 'this food'} from ${from}`, () => {
      fillBlanks(food, nut);
    });
  }
  const sourceLink = $derived(
    food.source?.db === 'off'
      ? { text: 'Open Food Facts', url: `https://world.openfoodfacts.org/product/${food.source.id}` }
      : food.source?.db === 'usda'
        ? { text: 'USDA FoodData Central', url: `https://fdc.nal.usda.gov/food-details/${food.source.id}/nutrients` }
        : null,
  );

  function remove() {
    undoable(`Deleted ${food.name || 'unnamed food'}`, (p) => {
      p.foods = p.foods.filter((f) => f.id !== food.id);
      // Meals and supplements that used it go too; recipes keep the line, waiting for a new food.
      const ref = 'f:' + food.id;
      for (const d of allDays(p)) {
        for (const k of Object.keys(d.meals)) d.meals[k] = d.meals[k].filter((e) => e.ref !== ref);
        d.supps = d.supps.filter((id) => id !== food.id);
        d.suppsTaken = d.suppsTaken.filter((id) => id !== food.id);
      }
    });
  }
</script>

<article class="card food" class:open id="food-{food.id}">
  <button class="summary" aria-expanded={open} onclick={ontoggle}>
    <span class="nm">
      {food.name || 'Unnamed food'}
      {#if food.supplement}<span class="tag">Supplement</span>{/if}
    </span>
    <span class="meta tabular">{summary}</span>
    <span class="chev" aria-hidden="true">▾</span>
  </button>

  {#if open}
    <div class="body">
      <div class="grid">
        <label class="wide">
          <span class="label">Name</span>
          <input class="field nm-in" bind:value={food.name} placeholder="e.g. Oats (dry)" />
        </label>
        <label>
          <span class="label">Label values per</span>
          <NumInput value={food.per} label="Label values per" onchange={(v) => v && v > 0 && (food.per = v)} />
        </label>
        <label>
          <span class="label">Unit</span>
          <input class="field" bind:value={food.unit} placeholder="g or ml" list="base-units" />
        </label>
        <label>
          <span class="label">{EU()}</span>
          <NumInput value={food.nut.kcal != null ? E(food.nut.kcal) : null} label={EU()} onchange={(v) => setNut('kcal', v == null ? null : fromE(v))} />
        </label>
        <label>
          <span class="label">Protein (g)</span>
          <NumInput value={food.nut.protein ?? null} label="Protein" onchange={(v) => setNut('protein', v)} />
        </label>
        <label>
          <span class="label">Carbs (g)</span>
          <NumInput value={food.nut.carbs ?? null} label="Carbs" onchange={(v) => setNut('carbs', v)} />
        </label>
        <label>
          <span class="label">Fat (g)</span>
          <NumInput value={food.nut.fat ?? null} label="Fat" onchange={(v) => setNut('fat', v)} />
        </label>
      </div>
      <p class="note hint">Copy the label: values per 100 g or 100 ml. For something without a weight, like a tablet, use that word as the unit.</p>

      <section class="ways" aria-label="Ways to count it">
        <span class="label">Ways to count it</span>
        {#each food.measures as m (m.id)}
          <div class="way">
            <span class="one">1</span>
            <input class="field" id="way-{m.id}" bind:value={m.name} placeholder="egg, slice…" aria-label="Name, like egg or slice" />
            <span class="eq">=</span>
            <NumInput value={m.size} label="How much one {m.name || 'of these'} is, in {food.unit}" onchange={(v) => v && v > 0 && (m.size = v)} />
            <span class="u">{food.unit}</span>
            <button class="icon-btn x" aria-label="Remove {m.name || 'this way to count it'}" onclick={() => removeMeasure(m.id)}>×</button>
          </div>
        {/each}
        <div class="ways-foot">
          <button class="btn small" onclick={addMeasure}>+ Add a way to count it</button>
          <span class="note">
            Like 1 egg = 60 g or 1 slice = 35 g.{#if food.unit === 'ml'}
              tsp, tbsp and cup ({system() === 'imperial' ? '5 ml, 15 ml and the 8 fl oz US cup' : '5, 15 and 250 ml'}) are always there for liquids.{/if}
          </span>
        </div>
        {#if measuresOf(food, system()).length}
          <label class="countby">
            <span class="label">New amounts start in</span>
            <select class="field" value={startMeasure ?? ''} onchange={(e) => (food.countBy = e.currentTarget.value || null)}>
              <option value="">{plural(food.unit, 2)}{byWhat}</option>
              {#each measuresOf(food, system()) as m (m.id)}
                <option value={m.id}>{plural(m.name || 'unnamed', 2)}</option>
              {/each}
            </select>
          </label>
        {/if}
      </section>

      <label class="check">
        <input type="checkbox" checked={food.supplement} onchange={(e) => setSupplement(e.currentTarget.checked)} />
        <span><b>Supplement</b><small>Ticked off each day on the Plan tab, instead of added to meals. Counts one label amount.</small></span>
      </label>

      {#if !food.supplement}
        <section class="shop" aria-label="Pack and price">
          <label>
            <span class="label">Pack size ({food.unit || 'g'})</span>
            <NumInput value={food.pack?.size ?? null} label="Pack size in {food.unit}" placeholder="e.g. 500" onchange={(v) => setPack(v, food.pack?.price ?? null)} />
          </label>
          <label>
            <span class="label">Pack price ({currencySymbol(plan.settings.currency)})</span>
            <NumInput
              value={food.pack?.price ?? null}
              label="Pack price"
              placeholder={food.pack ? 'e.g. 4.99' : 'pack size first'}
              onchange={(v) => food.pack && setPack(food.pack.size, v)}
            />
          </label>
        </section>
        <p class="note hint">The pack you buy and what it costs, so meals and days on the Plan tab show what they cost.</p>
      {/if}

      {#if canFill}
        <div class="find">
          <button class="btn small" onclick={() => (finding = true)}>Find missing values</button>
          <span class="note">Fills only the blanks, from basic or packaged foods.</span>
        </div>
      {/if}

      <details>
        <summary>More nutrients <span class="muted">({filled} of {more.length} filled in)</span></summary>
        <div class="grid more">
          {#each more as n (n.k)}
            <label>
              <span class="label">{n.l} ({n.u})</span>
              <NumInput value={food.nut[n.k] ?? null} label="{n.l} in {n.u}" onchange={(v) => setNut(n.k, v)} />
            </label>
          {/each}
        </div>
      </details>

      <label class="note-in">
        <span class="label">
          Source or note{#if sourceLink} · <a href={sourceLink.url} target="_blank" rel="noopener">see it on {sourceLink.text} ↗</a>{/if}
        </span>
        <textarea class="field" bind:value={food.note} placeholder="Where the values came from" rows="2"></textarea>
      </label>

      <div class="foot">
        <p class="used">{used.length ? `Used in: ${used.join(', ')}` : 'Not used anywhere yet'}</p>
        <button class="btn small danger" disabled={inRecipes.length > 0} onclick={remove}>Delete food</button>
      </div>
      {#if inRecipes.length}
        <p class="note">To delete it, take it out of {inRecipes.length === 1 ? 'that recipe' : 'those recipes'} first.</p>
      {:else if used.length}
        <p class="note">Deleting it takes it out of those meals too. You can undo it.</p>
      {/if}
    </div>
  {/if}
</article>

{#if open && canFill}
  <FoodSearch bind:open={finding} mode="fill" title="Find missing values" query={food.name} fillFood={food} onfill={fill} />
{/if}

<datalist id="base-units">
  <option value="g"></option>
  <option value="ml"></option>
</datalist>

<style>
  .food {
    overflow: hidden;
  }
  .summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'nm chev' 'meta chev';
    gap: 0.1rem 0.75rem;
    align-items: center;
    width: 100%;
    min-height: 3.25rem;
    padding: 0.5rem 0.8rem;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .summary:hover {
    background: var(--pale);
  }
  .open .summary {
    background: var(--pale);
  }
  .nm {
    grid-area: nm;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .meta {
    grid-area: meta;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .chev {
    grid-area: chev;
    color: var(--muted);
    transition: transform 0.15s;
  }
  .open .chev {
    transform: rotate(180deg);
  }
  .tag {
    display: inline-block;
    margin-left: 0.35rem;
    padding: 0 0.4rem;
    border-radius: 0.3rem;
    background: var(--pick);
    color: var(--pick-ink);
    font-size: 0.72rem;
    font-weight: 700;
    vertical-align: 0.1em;
  }
  .body {
    padding: 0.75rem 0.8rem 0.85rem;
    display: grid;
    gap: 0.85rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: 0.6rem;
  }
  .grid .wide {
    grid-column: 1 / -1;
  }
  .nm-in {
    font-weight: 600;
  }
  .check {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    cursor: pointer;
  }
  .check input {
    width: 1.2rem;
    height: 1.2rem;
    margin-top: 0.15rem;
    accent-color: var(--bar);
    flex: none;
  }
  .check small {
    display: block;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .shop {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.6rem 0.75rem;
    margin-top: 0.9rem;
  }
  .find {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.6rem;
    margin-top: 0.8rem;
  }
  .find .note {
    margin: 0;
  }
  .note-in a {
    color: inherit;
    font-weight: 500;
  }
  details summary {
    cursor: pointer;
    font-weight: 600;
    padding: 0.3rem 0;
  }
  .more {
    margin-top: 0.5rem;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .used {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .body .note {
    margin: -0.4rem 0 0;
  }
  .hint {
    margin-top: -0.5rem !important;
  }
  .ways {
    display: grid;
    gap: 0.4rem;
    padding: 0.7rem;
    border: 1px solid var(--line);
    border-radius: 0.45rem;
    background: var(--bg);
  }
  .way {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto 4.5rem 2.2rem auto;
    align-items: center;
    gap: 0.4rem;
  }
  .one,
  .eq,
  .u {
    color: var(--muted);
    font-weight: 600;
  }
  .u {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ways-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.75rem;
  }
  .ways-foot .note {
    margin: 0;
    font-size: 0.85rem;
  }
  .countby {
    display: block;
    margin-top: 0.35rem;
    max-width: 18rem;
  }
</style>
