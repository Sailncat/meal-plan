<script lang="ts">
  import type { Food, Nutrients } from '../lib/types';
  import { foodById, foodNut, perServing, recipeById } from '../lib/calc';
  import { fmt0, fmtN, fold } from '../lib/num';
  import { E, EU, amountOf, system } from '../lib/display';
  import { baseAmount, measureOf, toShown, baseUnitLabel } from '../lib/units';
  import { ALL_NUTRIENTS } from '../lib/nutrients';
  import { store } from '../lib/store.svelte';
  import { blanksFilledBy, foodFromDraft, labelDraft, libraryMatch, pushRecent, toggleFavourite, type FoodDraft } from '../lib/foods';
  import { basicDraft, loadBasic, searchBasic, type BasicFood } from '../lib/basicFoods';
  import { countryName, offDraft, offNutrients, offProduct, offSearch, OffError, offBrand, offName, type OffProduct } from '../lib/off';
  import { looksLikeBarcode } from '../lib/scan';
  import FoodCheck from './FoodCheck.svelte';
  import Scanner from './Scanner.svelte';

  type Mode = 'meal' | 'line' | 'library' | 'fill';
  interface Props {
    open: boolean;
    mode: Mode;
    title: string;
    /** Main button on the check card: "Add to Breakfast", "Add to recipe", "Save to my foods". */
    action?: string;
    /** Open straight into the scanner. */
    scan?: boolean;
    query?: string;
    /** The food whose blanks are being filled, in fill mode. */
    fillFood?: Food;
    onpick?: (ref: string) => void;
    onfill?: (nut: Nutrients, from: string) => void;
  }
  let { open = $bindable(false), mode, title, action = 'Add', scan = false, query = '', fillFood, onpick, onfill }: Props = $props();

  const plan = $derived(store.plan!);
  let dialog: HTMLDialogElement | undefined = $state();
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();

  type View = 'search' | 'scan' | 'looking' | 'notfound' | 'check' | 'fill';
  let view = $state<View>('search');
  let q = $state('');
  let draft = $state<FoodDraft | null>(null);
  let lookError = $state('');
  let notFoundCode = $state('');

  // ---------- opening and closing ----------
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      q = query;
      view = scan ? 'scan' : 'search';
      draft = null;
      basicShown = 8;
      resetPackaged();
      dialog.showModal();
      ensureBasic();
      if (!scan && window.matchMedia('(pointer: fine)').matches) setTimeout(() => input?.focus(), 20);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  function done(ref: string) {
    if (mode === 'meal' || mode === 'line') pushRecent(plan, ref);
    onpick?.(ref);
    open = false;
  }

  // ---------- your own foods and recipes ----------
  interface Row {
    ref: string;
    label: string;
    sub: string;
  }
  const allowsRecipes = $derived(mode === 'meal');
  const foodAllowed = (f: Food) => mode !== 'meal' || !f.supplement;

  function startOf(f: Food) {
    const measure = f.countBy && measureOf(f, f.countBy) ? f.countBy : null;
    return { amount: measure ? 1 : f.per, measure };
  }
  function foodSub(f: Food) {
    const { amount, measure } = startOf(f);
    const kcal = foodNut(f, baseAmount(f, amount, measure), 'kcal');
    return `${fmt0(E(kcal))} ${EU()} per ${amountOf(f, amount, measure).replace(/^1 /, '')}`;
  }
  function rowOf(ref: string): Row | null {
    if (ref.startsWith('r:')) {
      const r = recipeById(plan, ref.slice(2));
      if (!r || !allowsRecipes) return null;
      return { ref, label: r.name || 'Unnamed recipe', sub: `${fmt0(E(perServing(plan, r, 'kcal')))} ${EU()} a serving` };
    }
    const f = foodById(plan, ref.slice(2));
    if (!f || !foodAllowed(f)) return null;
    return { ref, label: f.name || 'Unnamed food', sub: foodSub(f) };
  }
  const rows = (refs: string[]) => refs.map(rowOf).filter((r): r is Row => !!r);
  const byLabel = (a: Row, b: Row) => fold(a.label).localeCompare(fold(b.label));

  const term = $derived(fold(q.trim()));
  const ownRecipes = $derived(
    allowsRecipes && mode !== 'fill'
      ? rows(plan.recipes.map((r) => 'r:' + r.id))
          .filter((r) => !term || fold(r.label).includes(term))
          .sort(byLabel)
      : [],
  );
  const ownFoods = $derived(
    mode === 'fill'
      ? []
      : rows(plan.foods.map((f) => 'f:' + f.id))
          .filter((r) => !term || fold(r.label).includes(term))
          .sort(byLabel),
  );
  const favourites = $derived(mode === 'meal' || mode === 'line' ? rows(plan.favourites) : []);
  const recent = $derived(mode === 'meal' || mode === 'line' ? rows(plan.recent).slice(0, 6) : []);

  // ---------- basic foods (offline) ----------
  let basic = $state<BasicFood[] | null>(null);
  let basicError = $state('');
  let basicShown = $state(8);
  async function ensureBasic() {
    if (basic) return;
    try {
      basic = await loadBasic();
      basicError = '';
    } catch {
      basicError = 'Basic foods couldn’t load. Check your connection; once loaded they work offline.';
    }
  }
  const basicHits = $derived(basic && term ? searchBasic(basic, q, 30) : []);

  // ---------- packaged foods (Open Food Facts) ----------
  interface Packaged {
    q: string;
    country: string;
    products: OffProduct[];
    count: number;
    page: number;
    loading: boolean;
    error: string;
  }
  let pk = $state<Packaged>({ q: '', country: '', products: [], count: 0, page: 0, loading: false, error: '' });
  function resetPackaged() {
    pk = { q: '', country: '', products: [], count: 0, page: 0, loading: false, error: '' };
  }
  const country = $derived(plan.settings.country);
  const barcodeTyped = $derived(looksLikeBarcode(q.trim()));
  const searchedThis = $derived(pk.q === q.trim() && pk.page > 0);

  async function searchPackaged(inCountry: string, more = false) {
    const text = q.trim();
    if (!text || pk.loading) return;
    const page = more ? pk.page + 1 : 1;
    pk = { ...pk, q: text, country: inCountry, loading: true, error: '', ...(more ? {} : { products: [], count: 0, page: 0 }) };
    try {
      const r = await offSearch(text, inCountry, page);
      if (q.trim() !== text) return; // typed on while it loaded
      pk = { ...pk, products: more ? [...pk.products, ...r.products] : r.products, count: r.count, page, loading: false };
    } catch (e) {
      pk = { ...pk, loading: false, error: e instanceof OffError ? e.message : 'Something went wrong searching Open Food Facts.' };
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (barcodeTyped) lookup(q.replace(/\s/g, ''));
    else if (q.trim()) searchPackaged(country);
  }

  async function lookup(code: string) {
    view = 'looking';
    lookError = '';
    try {
      const p = await offProduct(code);
      const existing = libraryMatch(plan, { db: 'off', id: p.code });
      if (existing && mode !== 'fill') return done('f:' + existing.id);
      openDraft(offDraft(p));
    } catch (e) {
      if (e instanceof OffError && e.kind === 'notfound') {
        notFoundCode = code;
        view = 'notfound';
      } else {
        lookError = e instanceof OffError ? e.message : 'Something went wrong looking that up.';
        view = 'search';
      }
    }
  }

  // ---------- picking from a database ----------
  function openDraft(d: FoodDraft) {
    draft = d;
    view = mode === 'fill' ? 'fill' : 'check';
    list?.scrollTo({ top: 0 });
  }
  function pickBasic(f: BasicFood) {
    const existing = libraryMatch(plan, { db: 'usda', id: String(f.id) });
    if (existing && mode !== 'fill') return done('f:' + existing.id);
    openDraft(basicDraft(f));
  }
  /** Search results carry only the main values; the full product (vitamins, serving size, brand as written) comes by barcode. */
  async function pickProduct(p: OffProduct) {
    const existing = libraryMatch(plan, { db: 'off', id: p.code });
    if (existing && mode !== 'fill') return done('f:' + existing.id);
    view = 'looking';
    let full = p;
    try {
      full = await offProduct(p.code);
    } catch {
      // the search result will do
    }
    if (view === 'looking') openDraft(offDraft(full));
  }
  function addDraft(d: FoodDraft, name: string) {
    const food = foodFromDraft(d, name);
    plan.foods.push(food);
    done('f:' + food.id);
  }
  const inLibrary = (db: 'off' | 'usda', id: string) => !!libraryMatch(plan, { db, id });

  // ---------- filling blanks ----------
  const fillKeys = $derived(fillFood && draft ? blanksFilledBy(fillFood, draft.nut) : []);
  const fillScale = $derived(fillFood ? fillFood.per / 100 : 1);
  function nutLabel(k: string) {
    const n = ALL_NUTRIENTS.find((x) => x.k === k);
    return n ? `${n.l}` : k;
  }
  function nutValue(k: string, v: number) {
    if (k === 'kcal') return `${fmtN(E(v))} ${EU()}`;
    const n = ALL_NUTRIENTS.find((x) => x.k === k);
    return `${fmtN(v)} ${n?.u ?? ''}`;
  }
  function applyFill() {
    if (!draft || !fillKeys.length) return;
    onfill?.(draft.nut, draft.source?.db === 'off' ? 'Open Food Facts' : 'USDA basic foods');
    open = false;
  }

  function per100(nut: Nutrients, unit: 'g' | 'ml' = 'g') {
    const sys = system();
    const kcal = nut.kcal != null ? `${fmt0(E(nut.kcal))} ${EU()}` : 'no calories listed';
    const amount = sys === 'imperial' ? `${fmtN(toShown(unit, 100, sys))} ${baseUnitLabel(unit, sys, 2)}` : `100 ${unit}`;
    return `${kcal} per ${amount}`;
  }
</script>

{#snippet own(r: Row)}
  <div class="row">
    <button class="item" onclick={() => done(r.ref)}>
      <span class="nm">{r.label}</span>
      <small>{r.sub}</small>
    </button>
    {#if mode === 'meal' || mode === 'line'}
      {@const fav = plan.favourites.includes(r.ref)}
      <button class="icon-btn star" class:on={fav} aria-pressed={fav} aria-label="{fav ? 'Unstar' : 'Star'} {r.label}" onclick={() => toggleFavourite(plan, r.ref)}>
        {fav ? '★' : '☆'}
      </button>
    {/if}
  </div>
{/snippet}

<dialog
  bind:this={dialog}
  class="sheet"
  aria-label={title}
  onclose={() => (open = false)}
  onclick={(e) => {
    if (e.target === dialog) open = false;
  }}
>
  <div class="inner">
    <div class="head">
      <h2>{title}</h2>
      <button class="icon-btn" onclick={() => (open = false)} aria-label="Close">×</button>
    </div>

    {#if view === 'search'}
      <div class="searchbar">
        <input
          class="field"
          type="search"
          enterkeyhint="search"
          placeholder={mode === 'meal' ? 'Search your foods, recipes and food databases' : 'Search foods, or type a barcode'}
          aria-label="Search"
          bind:value={q}
          bind:this={input}
          onkeydown={onKey}
          oninput={() => (lookError = '')}
        />
        <button class="btn scan" onclick={() => (view = 'scan')} aria-label="Scan a barcode" title="Scan a barcode">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 5h2v14H3zm3 0h1v14H6zm2 0h2v14H8zm3 0h1v14h-1zm3 0h2v14h-2zm3 0h1v14h-1zm2 0h2v14h-2z"/></svg>
        </button>
      </div>
      {#if lookError}<p class="note err">{lookError}</p>{/if}
    {/if}

    <div class="list" bind:this={list}>
      {#if view === 'search'}
        {#if !term}
          {#if favourites.length}
            <h3>Starred</h3>
            {#each favourites as r (r.ref)}{@render own(r)}{/each}
          {/if}
          {#if recent.length}
            <h3>Recent</h3>
            {#each recent as r (r.ref)}{@render own(r)}{/each}
          {/if}
          {#if mode === 'library' || mode === 'fill'}
            <p class="note hint">
              Search basic foods like eggs, rice or chicken breast, or packaged foods by name. Or scan a barcode.
            </p>
          {:else}
            {#if ownRecipes.length}
              <h3>Your recipes</h3>
              {#each ownRecipes as r (r.ref)}{@render own(r)}{/each}
            {/if}
            {#if ownFoods.length}
              <h3>Your foods</h3>
              {#each ownFoods as r (r.ref)}{@render own(r)}{/each}
            {/if}
            {#if !ownRecipes.length && !ownFoods.length}
              <p class="note hint">Search for a food to add it, like eggs or oats, or scan a barcode.</p>
            {/if}
          {/if}
        {:else}
          {#if mode !== 'library' && mode !== 'fill'}
            {#if ownRecipes.length}
              <h3>Your recipes</h3>
              {#each ownRecipes as r (r.ref)}{@render own(r)}{/each}
            {/if}
            {#if ownFoods.length}
              <h3>Your foods</h3>
              {#each ownFoods as r (r.ref)}{@render own(r)}{/each}
            {/if}
          {:else if mode === 'library' && ownFoods.length}
            <h3>Already in your foods</h3>
            {#each ownFoods as r (r.ref)}{@render own(r)}{/each}
          {/if}

          <h3>Basic foods</h3>
          {#if basicError}
            <p class="note err">{basicError}</p>
          {:else if !basic}
            <p class="note">Loading…</p>
          {:else if !basicHits.length}
            <p class="note">No basic food matches “{q.trim()}”.</p>
          {:else}
            {#each basicHits.slice(0, basicShown) as f (f.id)}
              <button class="item db" onclick={() => pickBasic(f)}>
                <span class="nm">{f.name}</span>
                <small>{per100(f.nut)}{#if inLibrary('usda', String(f.id))} · <b>in your foods</b>{/if}</small>
              </button>
            {/each}
            {#if basicHits.length > basicShown}
              <button class="btn ghost small more" onclick={() => (basicShown = 30)}>More basic foods</button>
            {/if}
          {/if}

          <h3>Packaged foods</h3>
          {#if barcodeTyped}
            <button class="btn small" onclick={() => lookup(q.replace(/\s/g, ''))}>Look up barcode {q.replace(/\s/g, '')}</button>
          {:else if !searchedThis && !pk.loading}
            <button class="btn small" onclick={() => searchPackaged(country)}>
              Search packaged foods{country ? ` in ${countryName(country)}` : ''}
            </button>
          {/if}
          {#if pk.loading}
            <p class="note">Searching Open Food Facts…</p>
          {/if}
          {#if pk.error}
            <p class="note err">{pk.error}</p>
          {/if}
          {#if searchedThis && !pk.loading}
            {#if !pk.products.length}
              <p class="note">Nothing found for “{pk.q}”{pk.country ? ` in ${countryName(pk.country)}` : ''}.</p>
            {/if}
            {#each pk.products as p (p.code)}
              {@const nut = offNutrients(p.nutriments)}
              <button class="item db" onclick={() => pickProduct(p)}>
                <span class="nm">{offName(p)}</span>
                <small>
                  {[offBrand(p), p.quantity].filter(Boolean).join(' · ')}{offBrand(p) || p.quantity ? ' · ' : ''}{per100(nut)}{#if inLibrary('off', p.code)} · <b>in your foods</b>{/if}
                </small>
              </button>
            {/each}
            <div class="pk-foot">
              {#if pk.products.length < pk.count}
                <button class="btn ghost small" onclick={() => searchPackaged(pk.country, true)}>More results</button>
              {/if}
              {#if pk.country}
                <button class="btn ghost small" onclick={() => searchPackaged('')}>Search all countries</button>
              {/if}
            </div>
          {/if}
          <p class="credit">Packaged foods from <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL) · basic foods from USDA FoodData Central</p>
        {/if}
      {:else if view === 'scan'}
        <button class="btn ghost small back" onclick={() => (view = 'search')}>‹ Back to search</button>
        <Scanner onresult={lookup} />
      {:else if view === 'looking'}
        <button class="btn ghost small back" onclick={() => (view = 'search')}>‹ Back to search</button>
        <p class="note centre">Looking it up on Open Food Facts…</p>
      {:else if view === 'notfound'}
        <button class="btn ghost small back" onclick={() => (view = 'search')}>‹ Back to search</button>
        <p>Barcode <b>{notFoundCode}</b> isn’t in Open Food Facts yet.</p>
        <div class="actions">
          {#if mode !== 'fill'}
            <button class="btn primary" onclick={() => openDraft(labelDraft(notFoundCode))}>Type it in from the label</button>
          {/if}
          <button class="btn" onclick={() => (view = 'scan')}>Scan another</button>
        </div>
        <p class="note">
          You can also add it to Open Food Facts with their app, so it’s there for everyone next time.
        </p>
      {:else if view === 'check' && draft}
        <FoodCheck bind:draft {action} onadd={addDraft} onback={() => (view = 'search')} />
      {:else if view === 'fill' && draft && fillFood}
        <button class="btn ghost small back" onclick={() => (view = 'search')}>‹ Back to results</button>
        <h3 class="fill-title">Fill in what {fillFood.name || 'this food'} is missing</h3>
        <p class="note">From {draft.name}. Only blanks get filled; values you typed stay as they are.</p>
        {#if fillKeys.length}
          <div class="fill-list">
            {#each fillKeys as k (k)}
              <div><span>{nutLabel(k)}</span><b class="tabular">{nutValue(k, draft.nut[k] * fillScale)}</b></div>
            {/each}
          </div>
          <p class="note">Per {amountOf(fillFood, fillFood.per, null)}, the amount your label values are for.</p>
          <div class="actions">
            <button class="btn primary" onclick={applyFill}>Fill {fillKeys.length} value{fillKeys.length === 1 ? '' : 's'}</button>
            <button class="btn" onclick={() => (view = 'search')}>Cancel</button>
          </div>
        {:else}
          <p>This one has nothing your food is missing.</p>
        {/if}
      {/if}
    </div>
  </div>
</dialog>

<style>
  .sheet {
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 0.75rem 0.75rem 0 0;
    background: var(--surface);
    color: var(--ink);
    width: 100%;
    max-width: 36rem;
    height: min(88dvh, 46rem);
    max-height: 88dvh;
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
    gap: 0.6rem;
    padding: 0.9rem 0.9rem calc(0.9rem + var(--safe-b));
    height: 100%;
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
  .searchbar {
    display: flex;
    gap: 0.5rem;
  }
  .scan {
    padding: 0 0.6rem;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    margin: 0 -0.3rem;
    padding: 0 0.3rem 0.5rem;
  }
  h3 {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0.8rem 0 0.25rem;
  }
  .row {
    display: flex;
    align-items: center;
  }
  .item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.05rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.45rem 0.6rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .item:hover,
  .item:focus-visible {
    background: var(--pale);
  }
  .item .nm {
    font-weight: 600;
  }
  .item.db .nm {
    font-weight: 500;
  }
  .item small {
    color: var(--muted);
  }
  .item small b {
    color: var(--ok);
    font-weight: 600;
  }
  .star {
    color: var(--muted);
  }
  .star.on {
    color: var(--band-edge);
  }
  .more {
    margin-top: 0.2rem;
  }
  .pk-foot {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }
  .credit {
    margin: 1.2rem 0 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .credit a {
    color: inherit;
  }
  .hint {
    margin-top: 1rem;
  }
  .err {
    color: var(--over);
  }
  .back {
    margin: 0 0 0.5rem -0.6rem;
  }
  .centre {
    text-align: center;
    margin-top: 2rem;
  }
  .fill-title {
    text-transform: none;
    letter-spacing: 0;
    font-family: var(--display);
    font-size: 1.25rem;
    color: var(--ink);
    margin: 0;
  }
  .fill-list {
    margin: 0.6rem 0;
    border-top: 1px solid var(--line);
  }
  .fill-list div {
    display: flex;
    justify-content: space-between;
    padding: 0.35rem 0.2rem;
    border-bottom: 1px solid var(--line);
  }
</style>
