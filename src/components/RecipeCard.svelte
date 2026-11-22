<script lang="ts">
  import type { Recipe } from '../lib/types';
  import { allDays, foodById, lineNut, perServing, recipeTotal, recipeUseCount, servingsOf } from '../lib/calc';
  import { fmt0, fmt1 } from '../lib/num';
  import { store, undoable } from '../lib/store.svelte';
  import { E, EU } from '../lib/display';
  import NumInput from './NumInput.svelte';
  import AmountInput from './AmountInput.svelte';
  import FoodSearch from './FoodSearch.svelte';
  import { measureOf } from '../lib/units';
  import { duplicateRecipe, minutesText, scaleRecipe, totalMinutes } from '../lib/recipes';
  import { shrinkPhoto } from '../lib/photos';
  import { showToast } from '../lib/store.svelte';
  import { fmtN } from '../lib/num';

  interface Props {
    recipe: Recipe;
    open: boolean;
    ontoggle: () => void;
    /** Opens another recipe, like a fresh copy. */
    onopen?: (id: string) => void;
  }
  let { recipe, open, ontoggle, onopen }: Props = $props();
  const plan = $derived(store.plan!);

  // Which line the food search is choosing for; -1 adds a new line.
  let searching = $state(false);
  let target = $state(-1);
  function chooseFood(j: number) {
    // "+ Ingredient" fills a line that's still waiting for a food before it adds another.
    target = j >= 0 ? j : recipe.lines.findIndex((l) => !foodById(plan, l.food));
    searching = true;
  }
  function picked(ref: string) {
    const food = foodById(plan, ref.slice(2));
    if (!food) return;
    // A new food starts in its own default unit.
    const measure = food.countBy && measureOf(food, food.countBy) ? food.countBy : null;
    const line = recipe.lines[target];
    if (line) {
      line.food = food.id;
      line.measure = measure;
    } else {
      recipe.lines.push({ food: food.id, amount: measure ? 1 : food.per, measure });
    }
  }
  const total = $derived({ kcal: recipeTotal(plan, recipe, 'kcal'), protein: recipeTotal(plan, recipe, 'protein') });
  const per = $derived({ kcal: perServing(plan, recipe, 'kcal'), protein: perServing(plan, recipe, 'protein') });

  // ---------- photo ----------
  let photoBusy = $state(false);
  async function pickPhoto(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    photoBusy = true;
    try {
      recipe.photo = await shrinkPhoto(file);
    } catch {
      showToast('Couldn’t read that picture. Try another one.');
    } finally {
      photoBusy = false;
    }
  }
  function removePhoto() {
    undoable(`Removed the photo of ${recipe.name || 'this recipe'}`, () => {
      delete recipe.photo;
    });
  }

  // ---------- steps ----------
  function addStep() {
    recipe.steps.push('');
    const n = recipe.steps.length - 1;
    queueMicrotask(() => document.querySelector<HTMLTextAreaElement>(`#step-${recipe.id}-${n}`)?.focus());
  }
  function moveStep(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= recipe.steps.length) return;
    const [x] = recipe.steps.splice(i, 1);
    recipe.steps.splice(j, 0, x);
  }
  /** Pasting several lines into a step splits them into steps, so a copied method comes in ready to use. */
  function pasteStep(e: ClipboardEvent, i: number) {
    const text = e.clipboardData?.getData('text') ?? '';
    const parts = text.split(/\r?\n/).map((x) => x.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
    if (parts.length < 2) return;
    e.preventDefault();
    const before = recipe.steps[i].trim();
    recipe.steps.splice(i, 1, ...(before ? [before, ...parts] : parts));
  }

  // ---------- scale and copy ----------
  let scaling = $state(false);
  let customFactor = $state<number | null>(null);
  function scale(f: number | null) {
    if (!f || !(f > 0) || f === 1) return;
    scaling = false;
    customFactor = null;
    const name = recipe.name || 'this recipe';
    undoable(`Scaled ${name} ×${fmtN(f)}: it now makes ${fmtN(recipe.servings * f)} serving${recipe.servings * f === 1 ? '' : 's'}`, () => scaleRecipe(recipe, f));
  }
  function duplicate() {
    const copy = duplicateRecipe(plan, recipe);
    onopen?.(copy.id);
  }
  const siteOf = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  function remove() {
    const uses = recipeUseCount(plan, recipe.id);
    const name = recipe.name || 'Unnamed recipe';
    undoable(`Deleted ${name}${uses ? ` and took it out of ${uses} meal${uses === 1 ? '' : 's'}` : ''}`, (p) => {
      p.recipes = p.recipes.filter((r) => r.id !== recipe.id);
      const ref = 'r:' + recipe.id;
      for (const d of allDays(p)) for (const k of Object.keys(d.meals)) d.meals[k] = d.meals[k].filter((e) => e.ref !== ref);
    });
  }
</script>

<article class="card recipe" class:open id="recipe-{recipe.id}">
  <button class="summary" class:with-photo={!!recipe.photo} aria-expanded={open} onclick={ontoggle}>
    {#if recipe.photo}<img class="thumb" src={recipe.photo} alt="" />{/if}
    <span class="nm">{recipe.name || 'Unnamed recipe'}</span>
    <span class="meta tabular">
      {fmt0(E(per.kcal))} {EU()} · {fmt0(per.protein)} g protein a serving{servingsOf(recipe) > 1 ? ` · batch makes ${fmtN(servingsOf(recipe))}` : ''}{totalMinutes(recipe) ? ` · ${minutesText(totalMinutes(recipe))}` : ''}
    </span>
    <span class="chev" aria-hidden="true">▾</span>
  </button>

  {#if open}
  {#if recipe.photo}
    <div class="photo">
      <img src={recipe.photo} alt="{recipe.name || 'Recipe'} photo" />
      <div class="photo-acts">
        <label class="btn small">Change photo<input type="file" accept="image/*" onchange={pickPhoto} /></label>
        <button class="btn small" onclick={removePhoto}>Remove</button>
      </div>
    </div>
  {/if}
  <div class="head">
    <input class="name" bind:value={recipe.name} placeholder="Recipe name" aria-label="Recipe name" />
    <label class="serv">
      <NumInput value={recipe.servings} label="Servings" onchange={(v) => (recipe.servings = v && v > 0 ? v : 1)} />
      <span>servings</span>
    </label>
  </div>

  <div class="facts">
    <label>
      <span class="label">Prep (min)</span>
      <NumInput value={recipe.prepMin} label="Prep time in minutes" onchange={(v) => (recipe.prepMin = v && v > 0 ? Math.round(v) : null)} />
    </label>
    <label>
      <span class="label">Cook (min)</span>
      <NumInput value={recipe.cookMin} label="Cook time in minutes" onchange={(v) => (recipe.cookMin = v && v > 0 ? Math.round(v) : null)} />
    </label>
    {#if !recipe.photo}
      <label class="btn small add-photo" class:busy={photoBusy}>
        {photoBusy ? 'Adding…' : '+ Photo'}<input type="file" accept="image/*" onchange={pickPhoto} />
      </label>
    {/if}
  </div>

  <div class="lines">
    {#each recipe.lines as l, j}
      {@const food = foodById(plan, l.food)}
      <div class="line">
        <button class="field pick" class:blank={!food} onclick={() => chooseFood(j)} aria-label="Ingredient {j + 1}: {food ? food.name || 'Unnamed food' : 'pick a food'}. Change">
          <span>{food ? food.name || 'Unnamed food' : 'Pick a food'}</span>
          <span class="pick-chev" aria-hidden="true">▾</span>
        </button>
        <div class="nums">
          {#if food}
            <AmountInput
              {food}
              amount={l.amount}
              measure={l.measure}
              label="Amount of {food.name || 'ingredient ' + (j + 1)}"
              onchange={(a, m) => {
                l.amount = a;
                l.measure = m;
              }}
            />
          {:else}
            <span class="amount-blank">
              <NumInput value={l.amount} label="Amount of ingredient {j + 1}" onchange={(v) => (l.amount = v)} />
            </span>
          {/if}
          <span class="mac tabular">{food && l.amount != null ? `${fmt0(E(lineNut(plan, l, 'kcal')))} ${EU()}` : ''}</span>
          <span class="mac tabular">{food && l.amount != null ? `${fmt1(lineNut(plan, l, 'protein'))} g` : ''}</span>
          <button class="icon-btn x" aria-label="Remove ingredient {j + 1}" onclick={() => recipe.lines.splice(j, 1)}>×</button>
        </div>
      </div>
    {/each}
  </div>

  <div class="totals tabular">
    <div><span>Whole batch</span><b>{fmt0(E(total.kcal))} {EU()} · {fmt0(total.protein)} g protein</b></div>
    {#if servingsOf(recipe) > 1}
      <div><span>Per serving</span><b>{fmt0(E(per.kcal))} {EU()} · {fmt0(per.protein)} g protein</b></div>
    {/if}
  </div>

  <section class="steps" aria-label="Steps">
    <span class="label">Steps</span>
    {#if recipe.steps.length}
      <ol>
        {#each recipe.steps as step, i (i)}
          <li>
            <span class="n">{i + 1}</span>
            <textarea
              class="field"
              id="step-{recipe.id}-{i}"
              rows="2"
              bind:value={recipe.steps[i]}
              placeholder="What to do"
              aria-label="Step {i + 1}"
              onpaste={(e) => pasteStep(e, i)}
            ></textarea>
            <span class="step-acts">
              <button class="icon-btn" aria-label="Move step {i + 1} up" disabled={i === 0} onclick={() => moveStep(i, -1)}>↑</button>
              <button class="icon-btn" aria-label="Move step {i + 1} down" disabled={i === recipe.steps.length - 1} onclick={() => moveStep(i, 1)}>↓</button>
              <button class="icon-btn x" aria-label="Remove step {i + 1}" onclick={() => recipe.steps.splice(i, 1)}>×</button>
            </span>
          </li>
        {/each}
      </ol>
    {/if}
    <button class="btn small" onclick={addStep}>+ Add a step</button>
    {#if !recipe.steps.length}<span class="note"> Pasting a whole method into a step splits it into steps.</span>{/if}
  </section>

  <label class="notes">
    <span class="label">Notes{#if recipe.source} · <a href={recipe.source} target="_blank" rel="noopener">from {siteOf(recipe.source)} ↗</a>{/if}</span>
    <textarea class="field" bind:value={recipe.notes} placeholder="Cooking notes, like water amounts or times" rows="2"></textarea>
  </label>

  <div class="actions foot">
    <button class="btn small" onclick={() => chooseFood(-1)}>+ Ingredient</button>
    <span class="scale-wrap">
      <button class="btn small" aria-expanded={scaling} onclick={() => (scaling = !scaling)}>Scale</button>
      {#if scaling}
        <div class="scale-menu card" role="group" aria-label="Scale the recipe">
          <p class="note">Multiplies every amount and the servings, so each serving stays the same.</p>
          <div class="row">
            <button class="btn small" onclick={() => scale(0.5)}>×½</button>
            <button class="btn small" onclick={() => scale(2)}>×2</button>
            <button class="btn small" onclick={() => scale(3)}>×3</button>
            <span class="custom">× <NumInput value={customFactor} label="Scale by" onchange={(v) => (customFactor = v)} /></span>
            <button class="btn small primary" disabled={!customFactor || customFactor <= 0} onclick={() => scale(customFactor)}>Scale</button>
          </div>
        </div>
      {/if}
    </span>
    <button class="btn small" onclick={duplicate}>Duplicate</button>
    <button class="btn small danger" onclick={remove}>Delete recipe</button>
  </div>
    <FoodSearch
      bind:open={searching}
      mode="line"
      title={foodById(plan, recipe.lines[target]?.food ?? '') ? 'Change ingredient' : `Add to ${recipe.name || 'recipe'}`}
      action={foodById(plan, recipe.lines[target]?.food ?? '') ? 'Use in recipe' : 'Add to recipe'}
      onpick={picked}
    />
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
  .summary.with-photo {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: 'thumb nm chev' 'thumb meta chev';
  }
  .thumb {
    grid-area: thumb;
    width: 3.25rem;
    height: 3.25rem;
    object-fit: cover;
    border-radius: 0.4rem;
  }



  .photo img {
    display: block;
    width: 100%;
    max-height: 15rem;
    object-fit: cover;
  }
  .photo-acts {
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem 0;
  }
  .photo-acts label,
  .add-photo {
    position: relative;
    overflow: hidden;
  }
  .photo-acts input,
  .add-photo input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 0.75rem;
    padding: 0.6rem 0.75rem 0;
  }
  .facts label:not(.btn) {
    width: 6.5rem;
  }



  .steps {
    display: block;
    padding: 0.7rem 0.75rem 0;
  }
  .steps ol {
    list-style: none;
    margin: 0.2rem 0 0.5rem;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .steps li {
    display: grid;
    grid-template-columns: 1.6rem minmax(0, 1fr) auto;
    gap: 0.4rem;
    align-items: start;
  }
  .steps .n {
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    margin-top: 0.35rem;
    border-radius: 50%;
    background: var(--bar);
    color: var(--bar-ink);
    font-weight: 700;
    font-size: 0.85rem;
  }
  /* ↑ and ↓ stacked beside ×, so the buttons are no taller than a two-line step. */
  .step-acts {
    display: grid;
    grid-template-rows: repeat(2, 1.85rem);
    grid-auto-flow: column;
    grid-auto-columns: 2.1rem;
  }
  .step-acts .icon-btn {
    width: 2.1rem;
    height: 1.85rem;
    padding: 0;
  }
  .notes a {
    color: inherit;
    font-weight: 600;
  }
  .scale-wrap {
    position: relative;
  }
  .scale-menu {
    position: absolute;
    bottom: calc(100% + 0.35rem);
    left: 0;
    z-index: 5;
    width: min(20rem, 80vw);
    padding: 0.6rem;
    box-shadow: var(--shadow);
  }
  .scale-menu .note {
    margin: 0 0 0.5rem;
  }
  .scale-menu .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }
  .custom {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .custom :global(.field) {
    width: 3.5rem;
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
  .pick {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
    cursor: pointer;
    font-weight: 500;
  }
  .pick span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick.blank {
    color: var(--muted);
  }
  .pick-chev {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .nums {
    display: grid;
    grid-template-columns: auto 4.6rem 3.6rem auto;
    align-items: center;
    gap: 0.4rem;
  }
  .amount-blank {
    display: inline-block;
    width: 11.3rem;
  }
  .amount-blank :global(.field) {
    width: 4.25rem;
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
      grid-template-columns: auto minmax(0, 1fr) auto auto;
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
  :global(:root[data-density='compact']) .summary {
    min-height: 2.75rem;
    padding: 0.35rem 0.7rem;
  }
  /* Large text on a phone: the amount gets its own row, with the numbers under it. */
  .lines {
    container: lines / inline-size;
  }
  @container lines (max-width: 20rem) {
    .nums {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: 'amt amt x' 'k p .';
      row-gap: 0.15rem;
    }
    .nums > :first-child {
      grid-area: amt;
    }
    .nums > .mac:nth-child(2) {
      grid-area: k;
      text-align: left;
    }
    .nums > .mac:nth-child(3) {
      grid-area: p;
      text-align: left;
    }
    .nums > .x {
      grid-area: x;
    }
  }
</style>
