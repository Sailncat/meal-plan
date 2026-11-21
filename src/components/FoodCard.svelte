<script lang="ts">
  import type { Food } from '../lib/types';
  import { foodNut, foodUsedIn } from '../lib/calc';
  import { NUTRIENTS } from '../lib/nutrients';
  import { fmt0, fmt1, uid } from '../lib/num';
  import { baseAmount, measureOf, measuresOf, plural } from '../lib/units';
  import { E, EU, amountOf, fromE } from '../lib/display';
  import { store, undoable } from '../lib/store.svelte';
  import NumInput from './NumInput.svelte';

  interface Props {
    food: Food;
    open: boolean;
    ontoggle: () => void;
  }
  let { food, open, ontoggle }: Props = $props();

  const plan = $derived(store.plan!);
  const used = $derived(open ? foodUsedIn(plan, food.id) : []);
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
      for (const d of p.week) d.supps = d.supps.filter((id) => id !== food.id);
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
      for (const d of p.week) for (const list of Object.values(d.meals)) for (const e of list) if (e.ref === 'f:' + food.id) back(e);
      if (food.countBy === id) food.countBy = null;
      food.measures = food.measures.filter((x) => x.id !== id);
    });
  }

  function remove() {
    undoable(`Deleted ${food.name || 'unnamed food'}`, (p) => {
      p.foods = p.foods.filter((f) => f.id !== food.id);
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
              tsp, tbsp and cup (5, 15 and 250 ml) are always there for liquids.{/if}
          </span>
        </div>
        {#if measuresOf(food).length}
          <label class="countby">
            <span class="label">New amounts start in</span>
            <select class="field" value={startMeasure ?? ''} onchange={(e) => (food.countBy = e.currentTarget.value || null)}>
              <option value="">{plural(food.unit, 2)}{byWhat}</option>
              {#each measuresOf(food) as m (m.id)}
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
        <span class="label">Source or note</span>
        <textarea class="field" bind:value={food.note} placeholder="Where the values came from" rows="2"></textarea>
      </label>

      <div class="foot">
        <p class="used">{used.length ? `Used in: ${used.join(', ')}` : 'Not used anywhere yet'}</p>
        <button class="btn small danger" disabled={used.length > 0} onclick={remove}>Delete food</button>
      </div>
      {#if used.length}
        <p class="note">To delete it, take it out of those recipes and meals first.</p>
      {/if}
    </div>
  {/if}
</article>

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
