<script lang="ts">
  import { store, showToast } from '../lib/store.svelte';
  import { foodById } from '../lib/calc';
  import { loadBasic } from '../lib/basicFoods';
  import { buildRecipe, fetchPhoto, fetchRecipe, matchRows, rowFor, type ImportRow, type WebRecipe } from '../lib/recipeImport';
  import { shrinkPhoto } from '../lib/photos';
  import { minutesText } from '../lib/recipes';
  import NumInput from './NumInput.svelte';
  import AmountInput from './AmountInput.svelte';
  import FoodSearch from './FoodSearch.svelte';

  interface Props {
    open: boolean;
    onimported: (id: string) => void;
  }
  let { open = $bindable(false), onimported }: Props = $props();

  const plan = $derived(store.plan!);
  let dialog: HTMLDialogElement | undefined = $state();
  let view = $state<'link' | 'loading' | 'review'>('link');
  let link = $state('');
  let error = $state('');

  let web = $state<WebRecipe | null>(null);
  let rows = $state<ImportRow[]>([]);
  let name = $state('');
  let servings = $state(1);
  let prepMin = $state<number | null>(null);
  let cookMin = $state<number | null>(null);
  let photo = $state<string | null>(null);
  let photoState = $state<'none' | 'loading' | 'ready' | 'failed'>('none');
  let usePhoto = $state(true);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      view = 'link';
      error = '';
      dialog.showModal();
      setTimeout(() => dialog?.querySelector<HTMLInputElement>('#import-link')?.focus(), 30);
    } else if (!open && dialog.open) dialog.close();
  });

  async function pasteLink() {
    try {
      link = (await navigator.clipboard.readText()).trim();
    } catch {
      error = 'Couldn’t read the clipboard here. Paste the link into the box instead.';
    }
  }

  async function getRecipe(e?: SubmitEvent) {
    e?.preventDefault();
    error = '';
    if (!/^https?:\/\//i.test(link.trim())) {
      error = 'Paste the whole link, starting with https://';
      return;
    }
    view = 'loading';
    try {
      const [w, basic] = await Promise.all([fetchRecipe(link), loadBasic().catch(() => null)]);
      web = w;
      rows = matchRows(plan, basic, w.ingredients);
      name = w.name;
      servings = w.servings && w.servings > 0 ? w.servings : 1;
      prepMin = w.prepMin;
      cookMin = w.cookMin;
      photo = null;
      usePhoto = true;
      view = 'review';
      if (w.image) loadPhoto(w.image);
      else photoState = 'none';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Couldn’t read that page.';
      view = 'link';
    }
  }

  async function loadPhoto(url: string) {
    photoState = 'loading';
    const blob = await fetchPhoto(url);
    try {
      photo = blob ? await shrinkPhoto(blob) : null;
    } catch {
      photo = null;
    }
    photoState = photo ? 'ready' : 'failed';
  }

  // ---------- changing a match ----------
  let searching = $state(false);
  let target = $state(-1);
  const targetRow = $derived(rows[target]);
  function change(i: number) {
    target = i;
    searching = true;
  }
  function picked(ref: string) {
    const food = foodById(plan, ref.slice(2));
    const r = rows[target];
    if (!food || !r) return;
    rows[target] = { ...rowFor(plan, r.parsed, food), skip: false };
  }

  const matched = $derived(rows.filter((r) => r.food && !r.skip).length);

  function save() {
    if (!web) return;
    const recipe = buildRecipe(plan, web, $state.snapshot(rows) as ImportRow[], {
      name,
      servings,
      prepMin,
      cookMin,
      steps: web.steps,
      photo: usePhoto ? photo : null,
    });
    open = false;
    showToast(`Imported ${recipe.name}`);
    onimported(recipe.id);
  }
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  aria-label="Import a recipe"
  onclose={() => (open = false)}
  onclick={(e) => {
    // A stray tap outside shouldn't throw away a half-checked import.
    if (e.target === dialog && view !== 'review') open = false;
  }}
>
  <div class="inner">
    <div class="head">
      <h2>Import a recipe</h2>
      <button class="icon-btn" onclick={() => (open = false)} aria-label="Close">×</button>
    </div>

    <div class="body">
      {#if view === 'link'}
        <form class="link" novalidate onsubmit={getRecipe}>
          <label class="label" for="import-link">Link to a recipe page</label>
          <div class="row">
            <input id="import-link" class="field" type="url" inputmode="url" bind:value={link} placeholder="https://…" oninput={() => (error = '')} />
            <button class="btn" type="button" onclick={pasteLink}>Paste</button>
          </div>
          {#if error}<p class="note err">{error}</p>{/if}
          <button class="btn primary" type="submit" disabled={!link.trim()}>Get the recipe</button>
          <p class="note">
            Works with most big recipe sites, which publish their recipes in a standard form. You check every ingredient before it’s
            saved.
          </p>
        </form>
      {:else if view === 'loading'}
        <p class="note centre">Reading the page…</p>
      {:else if web}
        <p class="src">From <a href={web.url} target="_blank" rel="noopener">{web.site} ↗</a></p>

        {#if photoState === 'loading'}
          <p class="note">Getting the photo…</p>
        {:else if photo}
          <div class="photo" class:off={!usePhoto}>
            <img src={photo} alt="" />
            <label class="use"><input type="checkbox" bind:checked={usePhoto} /> Use this photo</label>
          </div>
        {/if}

        <label class="nm">
          <span class="label">Name</span>
          <input class="field" bind:value={name} />
        </label>
        <div class="facts">
          <label><span class="label">Servings</span><NumInput value={servings} label="Servings" onchange={(v) => (servings = v && v > 0 ? v : 1)} /></label>
          <label><span class="label">Prep (min)</span><NumInput value={prepMin} label="Prep time in minutes" onchange={(v) => (prepMin = v && v > 0 ? Math.round(v) : null)} /></label>
          <label><span class="label">Cook (min)</span><NumInput value={cookMin} label="Cook time in minutes" onchange={(v) => (cookMin = v && v > 0 ? Math.round(v) : null)} /></label>
        </div>

        <h3>Ingredients <span class="count">{matched} of {rows.length} matched</span></h3>
        <p class="note">Check each one. Tap a food to change it, or × to leave a line out; lines left out go in the recipe’s notes.</p>
        <div class="rows">
          {#each rows as r, i (i)}
            <div class="ing" class:skip={r.skip} class:none={!r.food && !r.skip}>
              <p class="orig">{r.parsed.text}</p>
              {#if !r.skip}
                <div class="match">
                  <button class="field pick" class:blank={!r.food} onclick={() => change(i)}>
                    <span>{r.food ? r.food.name : 'Pick a food'}</span><span class="chev" aria-hidden="true">▾</span>
                  </button>
                  {#if r.food}
                    <AmountInput
                      food={r.food}
                      amount={r.amount}
                      measure={r.measure}
                      label="Amount of {r.food.name}"
                      onchange={(a, m) => {
                        r.amount = a;
                        r.measure = m;
                        r.approx = false;
                      }}
                    />
                  {/if}
                  <button class="icon-btn x" aria-label="Leave out {r.parsed.text}" onclick={() => (r.skip = true)}>×</button>
                </div>
                {#if r.food && r.amount == null}<small class="warn">How much? Fill in the amount.</small>{/if}
                {#if r.approx}<small class="warn">Converted from {r.parsed.unit}: check it.</small>{/if}
                {#if r.pending}<small>A basic food; it’s added to your foods when you save.</small>{/if}
              {:else}
                <button class="btn small ghost" onclick={() => (r.skip = false)}>Add it back</button>
              {/if}
            </div>
          {/each}
        </div>

        {#if web.steps.length}
          <details>
            <summary>{web.steps.length} step{web.steps.length === 1 ? '' : 's'}{prepMin || cookMin ? ` · ${minutesText((prepMin ?? 0) + (cookMin ?? 0))}` : ''}</summary>
            <ol class="steps">
              {#each web.steps as s, i (i)}<li>{s}</li>{/each}
            </ol>
          </details>
        {/if}

        <div class="foot">
          <button class="btn primary" onclick={save}>Save recipe</button>
          <button class="btn" onclick={() => (view = 'link')}>Back</button>
        </div>
      {/if}
    </div>
  </div>
</dialog>

<FoodSearch
  bind:open={searching}
  mode="line"
  title={targetRow ? `Match “${targetRow.parsed.text}”` : 'Pick a food'}
  action="Use it"
  query={targetRow?.parsed.name ?? ''}
  onpick={picked}
/>

<style>
  .sheet {
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 0.75rem 0.75rem 0 0;
    background: var(--surface);
    color: var(--ink);
    width: 100%;
    max-width: 38rem;
    height: min(92dvh, 50rem);
    max-height: 92dvh;
    margin: auto auto 0;
    box-shadow: var(--shadow);
  }
  @media (min-width: 40rem) {
    .sheet {
      border-radius: 0.75rem;
      margin: auto;
    }
  }
  .sheet::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }
  .inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 0.9rem 0.9rem calc(0.6rem + var(--safe-b));
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    font-family: var(--display);
    font-size: 1.4rem;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 0.6rem;
    margin: 0.4rem -0.3rem 0;
    padding: 0 0.3rem 0.4rem;
  }
  .link {
    display: grid;
    gap: 0.5rem;
  }
  .link .row {
    display: flex;
    gap: 0.4rem;
  }
  .link .primary {
    justify-self: start;
  }
  .err,
  .warn {
    color: var(--over);
  }
  .centre {
    text-align: center;
    margin-top: 2rem;
  }
  .src {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .src a {
    color: inherit;
    font-weight: 600;
  }
  .photo img {
    width: 100%;
    max-height: 12rem;
    object-fit: cover;
    border-radius: 0.5rem;
    display: block;
  }
  .photo.off img {
    opacity: 0.35;
  }
  .use {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.3rem;
    font-weight: 600;
  }
  .facts {
    display: flex;
    gap: 0.6rem;
  }
  .facts label {
    width: 6.5rem;
  }



  h3 {
    margin: 0.5rem 0 0;
    font-size: 1.05rem;
  }
  .count {
    font-weight: 400;
    font-size: 0.85rem;
    color: var(--muted);
  }
  h3 + .note {
    margin: 0;
  }
  .rows {
    display: grid;
  }
  .ing {
    display: grid;
    gap: 0.25rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--line);
  }
  .ing.none .pick {
    border-color: var(--under);
    border-style: dashed;
  }
  .orig {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .skip .orig {
    text-decoration: line-through;
  }
  .match {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }
  .pick {
    flex: 1 1 11rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    text-align: left;
    cursor: pointer;
    font-weight: 600;
    min-width: 0;
  }
  .pick span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick.blank {
    color: var(--muted);
    font-weight: 400;
  }
  .chev {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .ing small {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .ing small.warn {
    color: var(--under);
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  .steps {
    margin: 0.4rem 0 0;
    padding-left: 1.4rem;
    display: grid;
    gap: 0.3rem;
  }
  .foot {
    position: sticky;
    bottom: -0.4rem;
    display: flex;
    gap: 0.5rem;
    padding: 0.6rem 0 0.4rem;
    background: var(--surface);
    border-top: 1px solid var(--line);
  }
</style>
