<script lang="ts">
  // An amount of a food plus a menu of the ways to count it (eggs, g…). Switching the menu
  // re-expresses the same amount, so 4 eggs becomes 240 g rather than 4 g.
  import type { Food } from '../lib/types';
  import { baseUnitLabel, convertAmount, fromShown, measureOf, measuresOf, plural, toShown } from '../lib/units';
  import { system } from '../lib/display';
  import NumInput from './NumInput.svelte';

  interface Props {
    food: Food;
    amount: number | null;
    measure: string | null;
    label: string;
    onchange: (amount: number | null, measure: string | null) => void;
  }
  let { food, amount, measure, label, onchange }: Props = $props();

  const sys = $derived(system());
  const m = $derived(measureOf(food, measure, sys));
  // Base amounts (always metric) are shown in ounces or fluid ounces in imperial.
  const shown = $derived(m || amount == null ? amount : Math.round(toShown(food.unit, amount, sys) * 100) / 100);
  const n = $derived(shown ?? 2);
  const options = $derived([
    { value: '', label: baseUnitLabel(food.unit, sys, n) },
    ...measuresOf(food, sys).map((x) => ({ value: x.id, label: plural(x.name, n) })),
    // An amount saved in the other system's cup keeps it, shown by its full name.
    ...(m && !measuresOf(food, sys).some((x) => x.id === m.id) ? [{ value: m.id, label: plural(m.name, n) }] : []),
  ]);
</script>

<span class="amount">
  <NumInput value={shown} {label} onchange={(v) => onchange(v == null || m ? v : fromShown(food.unit, v, sys), m ? measure : null)} />
  {#if options.length > 1}
    <select
      class="field unit"
      value={m ? measure : ''}
      aria-label="{label}, unit"
      onchange={(e) => {
        const to = e.currentTarget.value || null;
        onchange(convertAmount(food, amount, m ? measure : null, to), to);
      }}
    >
      {#each options as o (o.value)}
        <option value={o.value}>{o.label}</option>
      {/each}
    </select>
  {:else}
    <span class="unit-text">{options[0].label}</span>
  {/if}
</span>

<style>
  .amount {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }
  .amount :global(.field.num) {
    width: 4.25rem;
    flex: none;
  }
  .unit {
    width: 6.75rem;
    min-height: 2.5rem;
    padding: 0.3rem 0.35rem;
    font-size: 0.9rem;
    background: var(--pale);
    border-color: var(--line);
    text-overflow: ellipsis;
  }
  .unit-text {
    width: 6.75rem;
    padding-left: 0.4rem;
    font-size: 0.9rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
