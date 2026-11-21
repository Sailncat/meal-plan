<script lang="ts">
  import { DAYS, DAYS_SHORT } from '../lib/types';
  import { fmt0 } from '../lib/num';
  import { bandStatus } from '../lib/calc';
  import { store } from '../lib/store.svelte';

  interface Props {
    selected: number;
    today: number;
    kcal: number[];
    protein: number[];
    onselect: (i: number) => void;
  }
  let { selected, today, kcal, protein, onselect }: Props = $props();
  const t = $derived(store.plan!.targets);
</script>

<div class="strip" role="group" aria-label="Days of the week">
  {#each DAYS_SHORT as d, i (d)}
    {@const ks = bandStatus(kcal[i], t.kcalLow, t.kcalHigh)}
    {@const ps = protein[i] < t.proteinLow ? 'under' : ''}
    <button
      class="day"
      class:sel={i === selected}
      aria-pressed={i === selected}
      aria-label="{DAYS[i]}: {fmt0(kcal[i])} kcal, {fmt0(protein[i])} g protein{i === today ? ', today' : ''}"
      onclick={() => onselect(i)}
    >
      <span class="d">{d}{#if i === today}<span class="today" aria-hidden="true"></span>{/if}</span>
      <span class="k tabular {kcal[i] ? ks : 'empty'}">{kcal[i] ? fmt0(kcal[i]) : '–'}</span>
      <span class="p tabular {ps}">{kcal[i] ? fmt0(protein[i]) + ' g' : ''}</span>
    </button>
  {/each}
</div>

<style>
  .strip {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.25rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 0.6rem;
    padding: 0.3rem;
  }
  .day {
    display: grid;
    justify-items: center;
    gap: 0.05rem;
    min-width: 0;
    padding: 0.4rem 0.1rem 0.35rem;
    border: 0;
    border-radius: 0.45rem;
    background: transparent;
    cursor: pointer;
  }
  .day:hover {
    background: var(--pale);
  }
  .day.sel {
    background: var(--bar);
    color: var(--bar-ink);
  }
  .d {
    position: relative;
    font-family: var(--display);
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: 0.02em;
  }
  .today {
    position: absolute;
    top: -0.1rem;
    right: -0.45rem;
    width: 0.38rem;
    height: 0.38rem;
    border-radius: 50%;
    background: var(--over);
  }
  .k {
    font-weight: 700;
    font-size: 0.82rem;
  }
  .p {
    font-size: 0.72rem;
    color: var(--muted);
    min-height: 1em;
  }
  .k.ok {
    color: var(--ok);
  }
  .k.over {
    color: var(--over);
  }
  .k.under,
  .p.under {
    color: var(--under);
  }
  .k.empty {
    color: var(--muted);
  }
  .sel .k,
  .sel .p {
    color: inherit;
  }
  .sel .today {
    background: var(--bar-ink);
  }
  @media (max-width: 22rem) {
    .k {
      font-size: 0.72rem;
    }
  }
</style>
