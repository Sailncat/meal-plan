<script lang="ts">
  import { tick } from 'svelte';
  import { uid } from '../lib/num';
  import { store } from '../lib/store.svelte';
  import RecipeCard from '../components/RecipeCard.svelte';

  const plan = $derived(store.plan!);
  let openId = $state<string | null>(null);

  async function addRecipe() {
    const id = uid();
    plan.recipes.unshift({ id, name: '', servings: 1, lines: [{ food: '', amount: null }], notes: '' });
    openId = id;
    await tick();
    const input = document.querySelector<HTMLInputElement>(`#recipe-${id} .name`);
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input?.focus();
  }
</script>

<div class="title-row">
  <h1 class="page-title">Recipes</h1>
  <button class="btn primary" onclick={addRecipe}>+ New recipe</button>
</div>
<p class="note">Tap a recipe to edit it. Servings is how many meals one batch makes; your day uses the batch total divided by servings.</p>

<div class="list">
  {#each plan.recipes as recipe (recipe.id)}
    <RecipeCard {recipe} open={openId === recipe.id} ontoggle={() => (openId = openId === recipe.id ? null : recipe.id)} />
  {:else}
    <div class="card empty">
      <p>No recipes yet.</p>
      <button class="btn primary" onclick={addRecipe}>Make your first recipe</button>
    </div>
  {/each}
</div>

<style>
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .list {
    display: grid;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .empty {
    padding: 2rem 1rem;
    text-align: center;
  }
  .empty p {
    margin: 0 0 1rem;
  }
</style>
