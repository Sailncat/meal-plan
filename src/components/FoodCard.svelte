<script lang="ts">
  import type { Food } from '../lib/types';
  import { foodUsedIn } from '../lib/calc';
  import { NUTRIENTS } from '../lib/nutrients';
  import { fmt0, fmt1 } from '../lib/num';
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
    <span class="meta tabular">per {fmt1(food.per)} {food.unit} · {fmt0(food.nut.kcal ?? 0)} kcal · {fmt1(food.nut.protein ?? 0)} g protein</span>
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
          <span class="label">Values per</span>
          <NumInput value={food.per} label="Values per" onchange={(v) => v && v > 0 && (food.per = v)} />
        </label>
        <label>
          <span class="label">Unit</span>
          <input class="field" bind:value={food.unit} placeholder="g, ml, egg…" />
        </label>
        <label>
          <span class="label">kcal</span>
          <NumInput value={food.nut.kcal ?? null} label="kcal" onchange={(v) => setNut('kcal', v)} />
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

      <label class="check">
        <input type="checkbox" checked={food.supplement} onchange={(e) => setSupplement(e.currentTarget.checked)} />
        <span><b>Supplement</b><small>Ticked off each day on the Plan tab, instead of added to meals. Counts one “values per” amount.</small></span>
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
</style>
