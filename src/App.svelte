<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { load, queueSave, store } from './lib/store.svelte';
  import PlanView from './views/PlanView.svelte';
  import RecipesView from './views/RecipesView.svelte';
  import FoodsView from './views/FoodsView.svelte';
  import NutrientsView from './views/NutrientsView.svelte';
  import SettingsView from './views/SettingsView.svelte';
  import Welcome from './views/Welcome.svelte';
  import Toast from './components/Toast.svelte';

  const VIEWS = [
    { id: 'plan', label: 'Plan', icon: 'M4 6h16M4 6v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1M8 3v4M16 3v4M8 11h3M8 15h3M13 11h3M13 15h3' },
    { id: 'recipes', label: 'Recipes', icon: 'M4 11h16M5 11a7 7 0 0 0 14 0M9 20h6M8.5 7c-1-1.2 1-2.2 0-3.5M12 7c-1-1.2 1-2.2 0-3.5M15.5 7c-1-1.2 1-2.2 0-3.5' },
    { id: 'foods', label: 'Foods', icon: 'M12 7c-3-2-8-1-8 5 0 5 3.5 9 6 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2.5 0 6-4 6-9 0-6-5-7-8-5zM12 7c0-2 1-4 3-4' },
    { id: 'nutrients', label: 'Nutrients', icon: 'M5 20V10M10 20V4M15 20v-7M20 20v-11M3 20h18' },
    { id: 'options', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.8 1.7 1l.4 2.5h4l.4-2.5c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.4z' },
  ] as const;
  type ViewId = (typeof VIEWS)[number]['id'];

  const fromHash = (): ViewId => {
    const h = location.hash.slice(1);
    return (VIEWS.find((v) => v.id === h)?.id ?? 'plan') as ViewId;
  };
  let view = $state<ViewId>(fromHash());

  onMount(() => {
    void load();
    const onHash = () => {
      view = fromHash();
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  // Save after every change.
  $effect(() => {
    const p = store.plan;
    if (!p) return;
    const json = JSON.stringify(p);
    untrack(() => queueSave(json));
  });

  const status = $derived(
    store.save === 'error'
      ? 'Can’t save on this device'
      : store.save === 'saving'
        ? 'Saving…'
        : store.save === 'saved'
          ? 'Saved'
          : '',
  );
</script>

<header class="top">
  <div class="top-inner">
    <a class="brand" href="#plan"><img src="./icon.svg" alt="" width="26" height="26" /> Meal plan</a>
    {#if store.plan}
      <nav class="tabs" aria-label="Sections">
        {#each VIEWS as v (v.id)}
          <a href="#{v.id}" aria-current={view === v.id ? 'page' : undefined}>{v.label}</a>
        {/each}
      </nav>
    {/if}
    <span class="status" class:bad={store.save === 'error'} role="status" aria-live="polite">{status}</span>
  </div>
</header>

<main class:with-nav={!!store.plan}>
  {#if !store.loaded}
    <p class="note loading">Loading your plan…</p>
  {:else if !store.plan}
    <Welcome />
  {:else if view === 'plan'}
    <PlanView />
  {:else if view === 'recipes'}
    <RecipesView />
  {:else if view === 'foods'}
    <FoodsView />
  {:else if view === 'nutrients'}
    <NutrientsView />
  {:else}
    <SettingsView />
  {/if}
</main>

{#if store.plan}
  <nav class="bottom" aria-label="Sections">
    {#each VIEWS as v (v.id)}
      <a href="#{v.id}" aria-current={view === v.id ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={v.icon} /></svg>
        <span>{v.label}</span>
      </a>
    {/each}
  </nav>
{/if}

<Toast />

<style>
  .top {
    position: sticky;
    top: 0;
    z-index: 10;
    padding-top: var(--safe-t);
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  .top-inner {
    max-width: 60rem;
    margin: 0 auto;
    height: 3.25rem;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.4rem;
    color: inherit;
    text-decoration: none;
  }
  .brand img {
    border-radius: 0.4rem;
  }
  .tabs {
    display: none;
    gap: 0.2rem;
  }
  .tabs a {
    text-decoration: none;
    color: var(--muted);
    font-weight: 600;
    padding: 0.35rem 0.75rem;
    border-radius: 0.4rem;
  }
  .tabs a:hover {
    color: var(--ink);
  }
  .tabs a[aria-current='page'] {
    background: var(--bar);
    color: var(--bar-ink);
  }
  .status {
    margin-left: auto;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .status.bad {
    color: var(--over);
    font-weight: 600;
  }
  main {
    max-width: 46rem;
    margin: 0 auto;
    padding: 0.75rem 1rem 2rem;
  }
  main.with-nav {
    padding-bottom: calc(var(--nav-h) + var(--safe-b) + 5rem);
  }
  .loading {
    text-align: center;
    margin-top: 3rem;
  }
  .bottom {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    height: calc(var(--nav-h) + var(--safe-b));
    padding-bottom: var(--safe-b);
    background: var(--surface);
    border-top: 1px solid var(--line);
  }
  .bottom a {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.15rem;
    color: var(--muted);
    text-decoration: none;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .bottom svg {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .bottom a[aria-current='page'] {
    color: var(--bar);
  }
  @media (prefers-color-scheme: dark) {
    .bottom a[aria-current='page'] {
      color: var(--bar-ink);
    }
  }
  @media (min-width: 52rem) {
    .tabs {
      display: flex;
    }
    .bottom {
      display: none;
    }
    main.with-nav {
      padding-bottom: 4rem;
    }
  }
</style>
