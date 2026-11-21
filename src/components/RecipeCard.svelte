<script lang="ts">
  import type { Recipe } from '../lib/types';
  import { foodById, lineNut, perServing, recipeTotal, recipeUseCount, servingsOf } from '../lib/calc';
  import { fmt0, fmt1, fold } from '../lib/num';
  import { store, undoable } from '../lib/store.svelte';
  import NumInput from './NumInput.svelte';

  interface Props {
    recipe: Recipe;
    open: boolean;
    ontoggle: () => void;
  }
  let { recipe, open, ontoggle }: Props = $props();
  const plan = $derived(store.plan!);

  const foods = $derived([...plan.foods].sort((a, b) => fold(a.name).localeCompare(fold(b.name))));
  const total = $derived({ kcal: recipeTotal(plan, recipe, 'kcal'), protein: recipeTotal(plan, recipe, 'protein') });
  const per = $derived({ kcal: perServing(plan, recipe, 'kcal'), protein: perServing(plan, recipe, 'protein') });

  function remove() {
    const uses = recipeUseCount(plan, recipe.id);
    const name = recipe.name || 'Unnamed recipe';
    undoable(`Deleted ${name}${uses ? ` and took it out of ${uses} meal${uses === 1 ? '' : 's'}` : ''}`, (p) => {
      p.recipes = p.recipes.filter((r) => r.id !== recipe.id);
      const ref = 'r:' + recipe.id;
      for (const d of p.week) for (const k of Object.keys(d.meals)) d.meals[k] = d.meals[k].filter((e) => e.ref !== ref);
    });
  }
</script>

<article class="card recipe" class:open id="recipe-{recipe.id}">
  <button class="summary" aria-expanded={open} onclick={ontoggle}>
    <span class="nm">{recipe.name || 'Unnamed recipe'}</span>
    <span class="meta tabular">
      {fmt0(per.kcal)} kcal · {fmt0(per.protein)} g protein a serving{servingsOf(recipe) > 1 ? ` · batch makes ${servingsOf(recipe)}` : ''}
    </span>
    <span class="chev" aria-hidden="true">▾</span>
  </button>

  {#if open}
  <div class="head">
    <input class="name" bind:value={recipe.name} placeholder="Recipe name" aria-label="Recipe name" />
    <label class="serv">
      <NumInput value={recipe.servings} label="Servings" onchange={(v) => (recipe.servings = v && v > 0 ? v : 1)} />
      <span>servings</span>
    </label>
  </div>

  <div class="lines">
    {#each recipe.lines as l, j}
      {@const food = foodById(plan, l.food)}
      <div class="line">
        <select class="field pick" value={l.food} onchange={(e) => (l.food = e.currentTarget.value)} aria-label="Ingredient {j + 1}">
          <option value="">Pick a food</option>
          {#each foods as f (f.id)}
            <option value={f.id}>{f.name || 'Unnamed food'}</option>
          {/each}
        </select>
        <div class="nums">
          <NumInput value={l.amount} label="Amount of ingredient {j + 1}" onchange={(v) => (l.amount = v)} />
          <span class="unit">{food?.unit ?? ''}</span>
          <span class="mac tabular">{food && l.amount != null ? `${fmt0(lineNut(plan, l, 'kcal'))} kcal` : ''}</span>
          <span class="mac tabular">{food && l.amount != null ? `${fmt1(lineNut(plan, l, 'protein'))} g` : ''}</span>
          <button class="icon-btn x" aria-label="Remove ingredient {j + 1}" onclick={() => recipe.lines.splice(j, 1)}>×</button>
        </div>
      </div>
    {/each}
  </div>

  <div class="totals tabular">
    <div><span>Whole batch</span><b>{fmt0(total.kcal)} kcal · {fmt0(total.protein)} g protein</b></div>
    {#if servingsOf(recipe) > 1}
      <div><span>Per serving</span><b>{fmt0(per.kcal)} kcal · {fmt0(per.protein)} g protein</b></div>
    {/if}
  </div>

  <label class="notes">
    <span class="label">Notes</span>
    <textarea class="field" bind:value={recipe.notes} placeholder="Cooking notes, like water amounts or times" rows="2"></textarea>
  </label>

  <div class="actions foot">
    <button class="btn small" onclick={() => recipe.lines.push({ food: '', amount: null })}>+ Ingredient</button>
    <button class="btn small danger" onclick={remove}>Delete recipe</button>
  </div>
  {/if}
</article>

<style>
  .recipe {
    overflow: hidden;
  }
  .summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'nm chev' 'meta chev';
    gap: 0.1rem 0.75rem;
    align-items: center;
    width: 100%;
    min-height: 3.5rem;
    padding: 0.55rem 0.8rem;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .summary:hover {
    background: var(--pale);
  }
  .summary .nm {
    grid-area: nm;
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.25rem;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .summary .meta {
    grid-area: meta;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .chev {
    grid-area: chev;
    color: var(--muted);
    transition: transform 0.15s;
  }
  .open .chev {
    transform: rotate(180deg);
  }
  .open .summary {
    border-bottom: 1px solid var(--line);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--pale);
  }
  .name {
    flex: 1 1 12rem;
    min-width: 0;
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.35rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.35rem;
    padding: 0.15rem 0.35rem;
  }
  .name:hover,
  .name:focus {
    border-color: var(--line);
    background: var(--surface);
  }
  .serv {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--muted);
  }
  .serv :global(.field) {
    width: 3.75rem;
  }
  .lines {
    padding: 0.25rem 0.75rem 0;
  }
  .line {
    display: grid;
    grid-template-columns: minmax(10rem, 1fr) auto;
    gap: 0.4rem 0.6rem;
    align-items: center;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--line);
  }
  .nums {
    display: grid;
    grid-template-columns: 4.5rem 3.5rem 4.6rem 3.6rem auto;
    align-items: center;
    gap: 0.4rem;
  }
  .unit {
    font-size: 0.85rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mac {
    text-align: right;
    font-size: 0.85rem;
    color: var(--muted);
    white-space: nowrap;
  }
  @media (max-width: 40rem) {
    .line {
      grid-template-columns: minmax(0, 1fr);
    }
    .nums {
      grid-template-columns: 4.5rem minmax(2.5rem, 1fr) auto auto auto;
    }
  }
  .totals {
    display: grid;
    gap: 0.2rem;
    padding: 0.55rem 0.75rem;
    background: var(--total);
    margin-top: 0.5rem;
  }
  .totals div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .totals span {
    color: var(--muted);
    font-weight: 600;
  }
  .notes {
    display: block;
    padding: 0.6rem 0.75rem 0;
  }
  .foot {
    padding: 0.6rem 0.75rem 0.75rem;
  }
</style>
