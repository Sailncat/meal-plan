<script lang="ts">
  import type { Snippet } from 'svelte';
  import { store, ui } from '../lib/store.svelte';
  import { addDays, rangeText, today, weekDates } from '../lib/dates';

  interface Props {
    /** Extra buttons at the end of the week row, like the week menu. */
    actions?: Snippet;
  }
  let { actions }: Props = $props();

  const dates = $derived(weekDates(ui.date, store.plan!.settings.weekStart));
  const isThisWeek = $derived(dates.includes(today()));
</script>

<div class="weeknav">
  <div class="row">
    <button class="icon-btn" aria-label="Previous week" onclick={() => (ui.date = addDays(ui.date, -7))}>‹</button>
    <span class="range" aria-live="polite">{rangeText(dates[0], dates[6])}</span>
    <button class="icon-btn" aria-label="Next week" onclick={() => (ui.date = addDays(ui.date, 7))}>›</button>
    {#if !isThisWeek}
      <button class="btn small ghost" onclick={() => (ui.date = today())}>This week</button>
    {/if}
    <span class="spacer"></span>
    {@render actions?.()}
  </div>
</div>

<style>
  .weeknav {
    margin-bottom: 0.4rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .range {
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.25rem;
    min-width: 7.5rem;
    text-align: center;
  }
  .spacer {
    flex: 1;
  }
</style>
