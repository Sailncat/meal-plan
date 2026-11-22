<script lang="ts" module>
  export type PlanTab = 'plan' | 'prep' | 'shop';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { store, ui } from '../lib/store.svelte';
  import { addDays, rangeText, today, weekDates } from '../lib/dates';

  interface Props {
    /** Which of Days / Prep / Shop is open; leave out for the week arrows alone. */
    tab?: PlanTab;
    /** Extra buttons at the end of the week row, like the week menu. */
    actions?: Snippet;
  }
  let { tab, actions }: Props = $props();

  const dates = $derived(weekDates(ui.date, store.plan!.settings.weekStart));
  const isThisWeek = $derived(dates.includes(today()));
  const TABS: { id: PlanTab; label: string }[] = [
    { id: 'plan', label: 'Days' },
    { id: 'prep', label: 'Prep' },
    { id: 'shop', label: 'Shop' },
  ];
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
  {#if tab}
    <nav class="tabs" aria-label="Plan views">
      {#each TABS as t (t.id)}
        <a href="#{t.id}" aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>
      {/each}
    </nav>
  {/if}
</div>

<style>
  .weeknav {
    display: grid;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
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
  .tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--surface);
  }
  .tabs a {
    text-align: center;
    padding: 0.45rem 0;
    font-weight: 600;
    color: var(--muted);
    text-decoration: none;
  }
  .tabs a + a {
    border-left: 1px solid var(--line);
  }
  .tabs a[aria-current='page'] {
    background: var(--bar);
    color: var(--bar-ink);
  }
</style>
