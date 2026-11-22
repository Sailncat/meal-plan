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
  const TABS: { id: PlanTab; label: string; icon: string }[] = [
    { id: 'plan', label: 'Days', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
    { id: 'prep', label: 'Prep', icon: 'M4 11h16M5 11a7 7 0 0 0 14 0M9 20h6M9 7c-1-1.2 1-2.2 0-3.5M15 7c-1-1.2 1-2.2 0-3.5' },
    { id: 'shop', label: 'Shop', icon: 'M5 9h14l-1.5 10h-11zM9 9l3-5 3 5' },
  ];
</script>

<div class="weeknav">
  {#if tab}
    <!-- The view switcher sits on top, in gold, so it doesn't read as part of the red-and-white week below. -->
    <nav class="tabs" aria-label="Plan views">
      {#each TABS as t (t.id)}
        <a href="#{t.id}" aria-current={tab === t.id ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>
          {t.label}
        </a>
      {/each}
    </nav>
  {/if}
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
    display: grid;
    gap: 0.5rem;
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
  .tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem;
    padding: 0.25rem;
    margin-bottom: 0.35rem;
    border: 1px solid var(--band-edge);
    border-radius: 0.7rem;
    background: var(--pick);
  }
  .tabs a {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.6rem;
    border-radius: 0.5rem;
    font-family: var(--display);
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--pick-ink);
    opacity: 0.75;
    text-decoration: none;
  }
  .tabs a:hover {
    opacity: 1;
  }
  .tabs a[aria-current='page'] {
    opacity: 1;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  }
  .tabs svg {
    width: 1.15rem;
    height: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
