<script lang="ts">
  import { tick } from 'svelte';
  import { fold, uid } from '../lib/num';
  import { store } from '../lib/store.svelte';
  import { blankFood } from '../lib/foods';
  import FoodCard from '../components/FoodCard.svelte';
  import FoodSearch from '../components/FoodSearch.svelte';

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
    menu = false;
    const id = uid();
    plan.foods.push(blankFood({ id }));
    q = '';
    openId = id;
    await tick();
    const input = document.querySelector<HTMLInputElement>(`#food-${id} .nm-in`);
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input?.focus();
  }

  // ---------- adding from a database ----------
  let menu = $state(false);
  let searching = $state(false);
  let scanFirst = $state(false);
  function openSearch(scan: boolean) {
    menu = false;
    scanFirst = scan;
    searching = true;
  }
  /** After adding (or picking one already there), show it opened in the list. */
  async function show(ref: string) {
    const id = ref.slice(2);
    q = '';
    openId = id;
    await tick();
    document.querySelector(`#food-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
</script>

<svelte:window onclick={(e) => menu && !(e.target as HTMLElement).closest('.add') && (menu = false)} />

<div class="title-row">
  <h1 class="page-title">Foods</h1>
  <div class="add">
    <button class="btn primary" aria-expanded={menu} aria-haspopup="menu" onclick={() => (menu = !menu)}>+ Add food</button>
    {#if menu}
      <div class="menu card" role="menu">
        <button role="menuitem" onclick={() => openSearch(false)}><b>Search foods</b><small>Basic foods and packaged foods by name</small></button>
        <button role="menuitem" onclick={() => openSearch(true)}><b>Scan a barcode</b><small>Look a packaged food up by its barcode</small></button>
        <button role="menuitem" onclick={addFood}><b>Type it in</b><small>Copy the values from a label yourself</small></button>
      </div>
    {/if}
  </div>
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
        <p>No foods yet. Find the things you eat, or type them in from their labels.</p>
        <div class="actions centre">
          <button class="btn primary" onclick={() => openSearch(false)}>Search foods</button>
          <button class="btn" onclick={() => openSearch(true)}>Scan a barcode</button>
          <button class="btn" onclick={addFood}>Type one in</button>
        </div>
      </div>
    {/if}
  {/each}
</div>

<FoodSearch bind:open={searching} mode="library" title="Add a food" action="Save to my foods" scan={scanFirst} onpick={show} />

<style>
  .add {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.35rem);
    z-index: 10;
    display: grid;
    width: min(18rem, 85vw);
    padding: 0.3rem;
    box-shadow: var(--shadow);
  }
  .menu button {
    display: grid;
    gap: 0.1rem;
    text-align: left;
    padding: 0.55rem 0.65rem;
    border: 0;
    border-radius: 0.35rem;
    background: transparent;
    cursor: pointer;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--pale);
  }
  .menu small {
    color: var(--muted);
  }
  .centre {
    justify-content: center;
  }
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
