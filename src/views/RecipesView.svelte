<script lang="ts">
  import { tick } from 'svelte';
  import { blankRecipe, findRecipes } from '../lib/recipes';
  import { store } from '../lib/store.svelte';
  import RecipeCard from '../components/RecipeCard.svelte';
  import ImportRecipe from '../components/ImportRecipe.svelte';

  const plan = $derived(store.plan!);
  let openId = $state<string | null>(null);
  let q = $state('');
  let chosen = $state<string[]>([]);
  let importing = $state(false);

  const usedTags = $derived([...new Set(plan.recipes.flatMap((r) => r.tags))].sort());
  const shown = $derived(findRecipes(plan, q, chosen));
  const filtering = $derived(!!q.trim() || chosen.length > 0);

  function toggleTag(t: string) {
    chosen = chosen.includes(t) ? chosen.filter((x) => x !== t) : [...chosen, t];
  }

  async function show(id: string) {
    q = '';
    chosen = [];
    openId = id;
    await tick();
    const el = document.querySelector<HTMLElement>(`#recipe-${id}`);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return el;
  }

  async function addRecipe() {
    const r = blankRecipe();
    plan.recipes.unshift(r);
    const el = await show(r.id);
    el?.querySelector<HTMLInputElement>('.name')?.focus();
  }
</script>

<div class="title-row">
  <h1 class="page-title">Recipes</h1>
  <div class="btns">
    <button class="btn" onclick={() => (importing = true)}>Import</button>
    <button class="btn primary" onclick={addRecipe}>+ New recipe</button>
  </div>
</div>
<p class="note">Tap a recipe to edit it. Servings is how many meals one batch makes; your day uses the batch total divided by servings.</p>

{#if plan.recipes.length > 3}
  <div class="find">
    <input class="field" type="search" bind:value={q} placeholder="Search recipes, tags or ingredients" aria-label="Search recipes" />
    {#if usedTags.length}
      <div class="filters" role="group" aria-label="Filter by tag">
        {#each usedTags as t (t)}
          <button class="filter" class:on={chosen.includes(t)} aria-pressed={chosen.includes(t)} onclick={() => toggleTag(t)}>{t}</button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<div class="list">
  {#each shown as recipe (recipe.id)}
    <RecipeCard {recipe} open={openId === recipe.id} ontoggle={() => (openId = openId === recipe.id ? null : recipe.id)} onopen={show} />
  {:else}
    {#if filtering}
      <p class="note none">
        No recipe matches{q.trim() ? ` “${q.trim()}”` : ''}{chosen.length ? ` with ${chosen.join(' + ')}` : ''}.
        <button class="btn small ghost" onclick={() => ((q = ''), (chosen = []))}>Show all</button>
      </p>
    {:else}
      <div class="card empty">
        <p>No recipes yet.</p>
        <div class="actions centre">
          <button class="btn primary" onclick={addRecipe}>Make your first recipe</button>
          <button class="btn" onclick={() => (importing = true)}>Import one from a link</button>
        </div>
      </div>
    {/if}
  {/each}
</div>

<ImportRecipe bind:open={importing} onimported={show} />

<style>
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .btns {
    display: flex;
    gap: 0.4rem;
  }
  .find {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .filter {
    min-height: 2rem;
    padding: 0.15rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 1rem;
    background: var(--surface);
    font-size: 0.85rem;
    cursor: pointer;
  }
  .filter.on {
    background: var(--pick);
    border-color: var(--band-edge);
    color: var(--pick-ink);
    font-weight: 600;
  }
  .list {
    display: grid;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .none {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .empty {
    padding: 2rem 1rem;
    text-align: center;
  }
  .empty p {
    margin: 0 0 1rem;
  }
  .centre {
    justify-content: center;
  }
</style>
