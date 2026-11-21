<script lang="ts">
  import type { Day, Slot } from '../lib/types';
  import { entriesNut, entryNut, entryTarget, entryUnit } from '../lib/calc';
  import { fmt0 } from '../lib/num';
  import { store, undoable } from '../lib/store.svelte';
  import NumInput from './NumInput.svelte';

  interface Props {
    day: Day;
    slot: Slot;
    onadd: () => void;
  }
  let { day, slot, onadd }: Props = $props();

  const plan = $derived(store.plan!);
  const entries = $derived(day.meals[slot.id] ?? []);
  const kcal = $derived(entriesNut(plan, entries, 'kcal'));
  const protein = $derived(entriesNut(plan, entries, 'protein'));

  function nameOf(e: (typeof entries)[number]) {
    const t = entryTarget(plan, e);
    if (!t) return 'Deleted item';
    return t.kind === 'recipe' ? t.recipe.name || 'Unnamed recipe' : t.food.name || 'Unnamed food';
  }
</script>

<section class="slot card" aria-labelledby="slot-{slot.id}">
  <header>
    <h2 id="slot-{slot.id}">{slot.name || 'Unnamed meal'}</h2>
    {#if entries.length}
      <span class="sum tabular">{fmt0(kcal)} kcal · {fmt0(protein)} g protein</span>
    {/if}
  </header>

  {#each entries as e (e.id)}
    {@const name = nameOf(e)}
    <div class="entry">
      <div class="what">
        <span class="name">{name}</span>
        <small class="tabular">{fmt0(entryNut(plan, e, 'kcal'))} kcal · {fmt0(entryNut(plan, e, 'protein'))} g protein</small>
      </div>
      <div class="amt">
        <NumInput value={e.amount} label="{name} amount" onchange={(v) => (e.amount = v)} />
        <span class="unit">{entryUnit(plan, e)}</span>
      </div>
      <button
        class="icon-btn x"
        aria-label="Remove {name}"
        onclick={() =>
          undoable(`Removed ${name} from ${slot.name || 'this meal'}`, () => {
            const list = day.meals[slot.id];
            const k = list.findIndex((x) => x.id === e.id);
            if (k >= 0) list.splice(k, 1);
          })}>×</button
      >
    </div>
  {/each}

  <button class="add" onclick={onadd}>+ Add to {slot.name || 'this meal'}</button>
</section>

<style>
  .slot {
    padding: 0.2rem 0 0.35rem;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    padding: 0.55rem 0.85rem 0.35rem;
  }
  h2 {
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.2rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .sum {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
  }
  .entry {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.4rem 0.45rem 0.85rem;
    border-top: 1px solid var(--line);
  }
  .what {
    min-width: 0;
  }
  .name {
    display: block;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .what small {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .amt {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .amt :global(.field) {
    width: 4.5rem;
  }
  .unit {
    width: 4.2rem;
    font-size: 0.85rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .add {
    display: block;
    width: calc(100% - 1rem);
    margin: 0.3rem 0.5rem 0.15rem;
    min-height: 2.5rem;
    border: 1px dashed var(--line);
    border-radius: 0.45rem;
    background: transparent;
    color: var(--muted);
    font-weight: 600;
    cursor: pointer;
  }
  .add:hover {
    border-color: var(--bar);
    color: var(--ink);
  }
  /* Narrow phones: name and × on top, calories on the left and the amount on the right below. */
  @media (max-width: 26rem) {
    .entry {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'name x' 'mac amt';
      row-gap: 0.15rem;
    }
    .what {
      display: contents;
    }
    .name {
      grid-area: name;
    }
    .what small {
      grid-area: mac;
    }
    .amt {
      grid-area: amt;
    }
    .entry .icon-btn {
      grid-area: x;
      justify-self: end;
    }
    .unit {
      width: 3.6rem;
    }
  }
</style>
