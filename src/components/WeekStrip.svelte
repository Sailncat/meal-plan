<script lang="ts">
  import { fmt0 } from '../lib/num';
  import { bandStatus } from '../lib/calc';
  import { store } from '../lib/store.svelte';
  import { E, EU } from '../lib/display';
  import { targetsInUse } from '../lib/targets';
  import { dayShort, dayTitle } from '../lib/dates';

  interface Props {
    /** The week's seven dates. */
    dates: string[];
    selected: string;
    today: string;
    kcal: number[];
    protein: number[];
    onselect: (date: string) => void;
  }
  let { dates, selected, today, kcal, protein, onselect }: Props = $props();
  const t = $derived(targetsInUse(store.plan!).targets);
</script>

<div class="strip" role="group" aria-label="Days of the week">
  {#each dates as date, i (date)}
    {@const ks = bandStatus(kcal[i], t.kcal.low, t.kcal.high)}
    {@const ps = protein[i] < t.protein.low ? 'under' : ''}
    <button
      class="day"
      class:sel={date === selected}
      class:past={date < today}
      aria-pressed={date === selected}
      aria-label="{dayTitle(date)}: {fmt0(E(kcal[i]))} {EU()}, {fmt0(protein[i])} g protein{date === today ? ', today' : ''}"
      onclick={() => onselect(date)}
    >
      <span class="d">{dayShort(date)}{#if date === today}<span class="today" aria-hidden="true"></span>{/if}</span>
      <span class="n tabular">{Number(date.slice(8))}</span>
      <span class="k tabular {kcal[i] ? ks : 'empty'}">{kcal[i] ? fmt0(E(kcal[i])) : '–'}</span>
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
  .n {
    font-size: 0.72rem;
    color: var(--muted);
    margin-top: -0.15rem;
  }
  .past:not(.sel) .d {
    color: var(--muted);
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
  .sel .p,
  .sel .n {
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
