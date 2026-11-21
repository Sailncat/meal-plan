<script lang="ts">
  import { tick } from 'svelte';
  import { fold, uid } from '../lib/num';
  import { store } from '../lib/store.svelte';
  import FoodCard from '../components/FoodCard.svelte';

  const plan = $derived(store.plan!);
  let q = $state('');
  let openId = $state<string | null>(null);

  // A–Z; a food that's still unnamed sits on top so it's easy to find right after adding it.
  const shown = $derived.by(() => {
    const f = fold(q.trim());
    return plan.foods
      .filter((x) => !f || !x.name || fold(x.name).includes(f))
      .sort((a, b) => {
        if (!a.name.trim() || !b.name.trim()) return a.name.trim() ? 1 : b.name.trim() ? -1 : 0;
        return fold(a.name).localeCompare(fold(b.name));
      });
  });

  async function addFood() {
    const id = uid();
    plan.foods.push({ id, name: '', unit: 'g', per: 100, nut: {}, note: '', supplement: false, measures: [], countBy: null });
    q = '';
    openId = id;
    await tick();
    const input = document.querySelector<HTMLInputElement>(`#food-${id} .nm-in`);
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input?.focus();
  }
</script>

<div class="title-row">
  <h1 class="page-title">Foods</h1>
  <button class="btn primary" onclick={addFood}>+ Add food</button>
</div>
<p class="note">Tap a food to edit its label values, or how it’s counted, like 1 egg = 60 g.</p>

{#if plan.foods.length > 6}
  <input class="field search" type="search" placeholder="Search {plan.foods.length} foods" aria-label="Search foods" bind:value={q} />
{/if}

<div class="list">
  {#each shown as food (food.id)}
    <FoodCard {food} open={openId === food.id} ontoggle={() => (openId = openId === food.id ? null : food.id)} />
  {:else}
    {#if plan.foods.length}
      <p class="note">No food matches “{q}”.</p>
    {:else}
      <div class="card empty">
        <p>No foods yet. Add the things you eat, with the values from their labels.</p>
        <button class="btn primary" onclick={addFood}>Add your first food</button>
      </div>
    {/if}
  {/each}
</div>

<style>
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .search {
    margin-top: 0.9rem;
  }
  .list {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.9rem;
  }
  .empty {
    padding: 2rem 1rem;
    text-align: center;
  }
  .empty p {
    margin: 0 0 1rem;
  }
</style>
