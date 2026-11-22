<script lang="ts">
  import type { Day, Entry, Slot } from '../lib/types';
  import { entriesNut, entryNut, entryTarget } from '../lib/calc';
  import { entryCost } from '../lib/costs';
  import { money } from '../lib/money';
  import { fmt0, fmt1 } from '../lib/num';
  import { cleanGauges, gaugeShort, type GaugeKey } from '../lib/look';
  import { E, EU } from '../lib/display';
  import { store, undoable } from '../lib/store.svelte';
  import NumInput from './NumInput.svelte';
  import AmountInput from './AmountInput.svelte';

  interface Props {
    /** Undefined while nothing is planned that day. */
    day: Day | undefined;
    slot: Slot;
    /** Today or earlier: meals can be ticked off as eaten, or swapped. */
    canTick: boolean;
    onadd: () => void;
    /** Swap a planned meal for what was eaten instead. */
    onswap: (e: Entry) => void;
  }
  let { day, slot, canTick, onadd, onswap }: Props = $props();

  const plan = $derived(store.plan!);
  const entries = $derived(day?.meals[slot.id] ?? []);
  // The same nutrients as the gauges at the top of the day screen.
  const keys = $derived(cleanGauges(plan.settings.gauges));
  const shown = (value: (k: GaugeKey) => number) =>
    keys
      .map((k) => {
        const v = value(k);
        if (k === 'kcal') return `${fmt0(E(v))} ${EU()}`;
        return `${k === 'salt' ? fmt1(v) : fmt0(v)} g ${gaugeShort(k)}`;
      })
      .join(' · ');
  const currency = $derived(plan.settings.currency);

  function nameOf(e: Entry) {
    const t = entryTarget(plan, e);
    if (!t) return 'Deleted item';
    return t.kind === 'recipe' ? t.recipe.name || 'Unnamed recipe' : t.food.name || 'Unnamed food';
  }
  const byId = (id: string | undefined) => entries.find((x) => x.id === id);
  const swapFor = (e: Entry) => entries.find((x) => x.swapOf === e.id);

  function remove(e: Entry) {
    const name = nameOf(e);
    undoable(e.extra ? `Removed ${name}` : `Removed ${name} from ${slot.name || 'this meal'}`, () => {
      const list = day!.meals[slot.id];
      // Taking out a swap puts the planned meal back; taking out a swapped meal takes its swap with it.
      const linked = e.extra ? list.find((x) => x.id === e.swapOf) : list.find((x) => x.swapOf === e.id);
      if (e.extra && linked) delete linked.skipped;
      day!.meals[slot.id] = list.filter((x) => x.id !== e.id && !(!e.extra && linked && x.id === linked.id));
    });
  }
</script>

<section class="slot card" aria-labelledby="slot-{slot.id}">
  <header>
    <h2 id="slot-{slot.id}">{slot.name || 'Unnamed meal'}</h2>
    {#if entries.some((e) => !e.extra)}
      <span class="sum tabular">{shown((k) => entriesNut(plan, entries, k))}</span>
    {/if}
  </header>

  {#each entries as e (e.id)}
    {@const name = nameOf(e)}
    {@const t = entryTarget(plan, e)}
    {@const cost = entryCost(plan, e)}
    <div class="entry" class:tick={canTick} class:skipped={e.skipped} class:extra={e.extra}>
      {#if canTick}
        {#if e.skipped}
          <span class="check-gap" aria-hidden="true"></span>
        {:else}
          <button
            class="check"
            class:on={e.eaten}
            aria-pressed={!!e.eaten}
            aria-label="{name}: {e.eaten ? 'eaten' : 'not eaten yet'}"
            disabled={e.extra}
            onclick={() => (e.eaten = !e.eaten)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </button>
        {/if}
      {/if}
      <div class="what">
        <span class="name">{name}</span>
        <small class="tabular">
          {#if e.skipped}
            Swapped for {swapFor(e) ? nameOf(swapFor(e)!) : 'something else'}
          {:else}
            {#if e.extra}Instead of {nameOf(byId(e.swapOf) ?? e)} ·{/if}
            {shown((k) => entryNut(plan, e, k))}{#if cost.known} · {cost.partial ? '≥ ' : ''}{money(cost.total, currency)}{/if}
          {/if}
        </small>
      </div>
      <div class="amt">
        {#if e.skipped}
          <button class="btn small ghost" onclick={() => remove(swapFor(e) ?? e)}>Undo swap</button>
        {:else if t?.kind === 'food'}
          <AmountInput
            food={t.food}
            amount={e.amount}
            measure={e.measure}
            label="{name} amount"
            onchange={(a, m) => {
              e.amount = a;
              e.measure = m;
            }}
          />
        {:else}
          <NumInput value={e.amount} label="{name} servings" onchange={(v) => (e.amount = v)} />
          <span class="unit">{e.amount === 1 ? 'serving' : 'servings'}</span>
        {/if}
      </div>
      <div class="acts">
        {#if canTick && !e.extra && !e.skipped}
          <button class="icon-btn swap" aria-label="Swap {name} for what you ate instead" title="Ate something else" onclick={() => onswap(e)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" /></svg>
          </button>
        {/if}
        {#if !e.skipped}
          <button class="icon-btn x" aria-label="Remove {name}" onclick={() => remove(e)}>×</button>
        {/if}
      </div>
    </div>
  {/each}

  <button class="add" onclick={onadd}>+ Add to {slot.name || 'this meal'}</button>
</section>

<style>
  .slot {
    padding: 0.2rem 0 0.35rem;
    container: slot / inline-size;
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
    grid-template-areas: 'what amt acts';
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.4rem 0.45rem 0.85rem;
    border-top: 1px solid var(--line);
  }
  .entry.tick {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas: 'check what amt acts';
    padding-left: 0.5rem;
  }
  .what {
    grid-area: what;
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
  .skipped .name {
    text-decoration: line-through;
    color: var(--muted);
  }
  .extra .what small {
    color: var(--ink);
  }
  .amt {
    grid-area: amt;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .acts {
    grid-area: acts;
    display: flex;
    align-items: center;
  }
  .amt > :global(.field.num) {
    width: 4.25rem;
  }
  .unit {
    width: 6.75rem;
    padding-left: 0.4rem;
    font-size: 0.85rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .check,
  .check-gap {
    grid-area: check;
    width: 2.25rem;
    height: 2.25rem;
  }
  .check {
    display: grid;
    place-items: center;
    border: 2px solid var(--line);
    border-radius: 50%;
    background: var(--surface);
    color: transparent;
    cursor: pointer;
  }
  .check:disabled {
    cursor: default;
  }
  .check.on {
    background: var(--ok);
    border-color: var(--ok);
    color: #fff;
  }
  .check svg,
  .swap svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .swap svg {
    stroke-width: 2;
  }
  .swap {
    color: var(--muted);
  }
  :global(:root[data-density='compact']) header {
    padding: 0.35rem 0.75rem 0.2rem;
  }
  :global(:root[data-density='compact']) .entry {
    gap: 0.4rem;
    padding: 0.25rem 0.3rem 0.25rem 0.75rem;
  }
  :global(:root[data-density='compact']) .entry.tick {
    padding-left: 0.4rem;
  }
  :global(:root[data-density='compact']) .check,
  :global(:root[data-density='compact']) .check-gap {
    width: 1.95rem;
    height: 1.95rem;
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
  /* Narrow phones: name and buttons on top, calories on the left and the amount on the right below. */
  @media (max-width: 26rem) {
    .entry {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'name acts' 'mac amt';
      row-gap: 0.15rem;
    }
    .entry.tick {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: 'check name acts' 'check mac amt';
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
  }
  /* Large text on a phone: the numbers get their own row, and the amount goes under them. */
  @container slot (max-width: 21.5rem) {
    .entry {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'name acts' 'mac mac' 'amt amt';
      row-gap: 0.2rem;
    }
    .entry.tick {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: 'check name acts' 'check mac mac' 'check amt amt';
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
      justify-self: start;
    }
  }
  :global(:root[data-density='compact']) .add {
    min-height: 2.1rem;
    margin: 0.2rem 0.5rem 0.1rem;
  }
</style>
