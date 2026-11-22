<script lang="ts">
  // Opened by a shared recipe link: shows what's in it, then adds it to your recipes.
  import { onMount } from 'svelte';
  import { showToast, store, ui } from '../lib/store.svelte';
  import { addShared, decodeShare, sameFood, type SharedRecipe } from '../lib/share';
  import { amountText } from '../lib/units';
  import { minutesText } from '../lib/recipes';

  interface Props {
    code: string;
    ondone: () => void;
  }
  let { code, ondone }: Props = $props();

  const plan = $derived(store.plan!);
  let dialog: HTMLDialogElement | undefined = $state();
  let shared = $state<SharedRecipe | null>(null);
  let error = $state('');

  onMount(() => {
    dialog?.showModal();
    decodeShare(code).then(
      (s) => (shared = s),
      (e) => (error = e instanceof Error ? e.message : 'Couldn’t read this recipe link.'),
    );
  });

  const rows = $derived(
    shared
      ? shared.recipe.lines.map((l) => {
          const f = shared!.foods.find((x) => x.id === l.food)!;
          return { name: f.name, amount: amountText(f, l.amount, l.measure, plan.settings.system), yours: !!sameFood(plan, f) };
        })
      : [],
  );
  const newFoods = $derived(shared ? shared.foods.filter((f) => !sameFood(plan, f)).length : 0);
  const times = $derived(
    shared ? [shared.recipe.prepMin ? `prep ${minutesText(shared.recipe.prepMin)}` : '', shared.recipe.cookMin ? `cook ${minutesText(shared.recipe.cookMin)}` : ''].filter(Boolean) : [],
  );

  function add() {
    if (!shared) return;
    const r = addShared(plan, shared);
    close();
    showToast(`Added ${r.name || 'the recipe'} to your recipes`);
    ui.showRecipe = r.id;
    location.hash = '#recipes';
  }
  function close() {
    dialog?.close();
    ondone();
  }
</script>

<dialog bind:this={dialog} class="sheet" aria-label="Add a shared recipe" oncancel={(e) => (e.preventDefault(), close())}>
  <div class="inner">
    <h2>A recipe for you</h2>
    {#if error}
      <p class="err">{error}</p>
      <div class="foot"><button class="btn" onclick={close}>Close</button></div>
    {:else if !shared}
      <p class="note">Opening the recipe…</p>
    {:else}
      <div class="body">
        <p class="name">{shared.recipe.name || 'Untitled recipe'}</p>
        <p class="note facts">Makes {shared.recipe.servings} serving{shared.recipe.servings === 1 ? '' : 's'}{times.length ? ` · ${times.join(' · ')}` : ''}</p>
        <ul class="ings">
          {#each rows as r, i (i)}
            <li>
              <span>{r.name}{r.amount ? `: ${r.amount}` : ''}</span>
              <small class:yours={r.yours}>{r.yours ? 'your food' : 'new food'}</small>
            </li>
          {/each}
        </ul>
        {#if shared.recipe.steps.length}<p class="note">{shared.recipe.steps.length} step{shared.recipe.steps.length === 1 ? '' : 's'} to cook it.</p>{/if}
        <p class="note">
          {#if newFoods}{newFoods} new food{newFoods === 1 ? '' : 's'} will be added to your Foods, with their nutrients.{:else}It uses only foods you already have.{/if}
          You can change anything once it’s added.
        </p>
      </div>
      <div class="foot">
        <button class="btn primary" onclick={add}>Add to my recipes</button>
        <button class="btn" onclick={close}>Not now</button>
      </div>
    {/if}
  </div>
</dialog>

<style>
  .sheet {
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
    color: var(--ink);
    width: min(32rem, calc(100% - 1.5rem));
    max-height: 88dvh;
    box-shadow: var(--shadow);
  }
  .sheet::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }
  .inner {
    display: flex;
    flex-direction: column;
    max-height: 88dvh;
    padding: 1rem 1rem 0.8rem;
  }
  h2 {
    font-family: var(--display);
    font-size: 1.4rem;
    margin: 0 0 0.4rem;
  }
  .body {
    overflow-y: auto;
  }
  .name {
    margin: 0;
    font-weight: 700;
    font-size: 1.15rem;
  }
  .facts {
    margin-top: 0.1rem;
  }
  .ings {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  .ings li {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--line);
  }
  .ings small {
    flex: none;
    color: var(--under);
    font-weight: 600;
  }
  .ings small.yours {
    color: var(--muted);
    font-weight: 400;
  }
  .err {
    color: var(--over);
  }
  .foot {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.75rem;
  }
</style>
