<script lang="ts">
  import { exportBackup, readBackup } from '../lib/backup';
  import { PlanFormatError, toPlan } from '../lib/migrate';
  import { uid } from '../lib/num';
  import { COUNTRIES } from '../lib/off';
  import { CURRENCIES } from '../lib/money';
  import { allDays } from '../lib/calc';
  import { WEEKDAYS_SHORT } from '../lib/types';
  import { showToast, store, undoable } from '../lib/store.svelte';
  import NumInput from '../components/NumInput.svelte';

  const plan = $derived(store.plan!);
  let fileInput: HTMLInputElement | undefined = $state();

  const lastBackup = $derived(
    plan.meta.lastBackup
      ? new Date(plan.meta.lastBackup).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null,
  );

  // ---------- meals ----------
  function addSlot() {
    const id = uid();
    plan.slots.push({ id, name: '' });
    for (const d of allDays(plan)) d.meals[id] = [];
    queueMicrotask(() => document.querySelector<HTMLInputElement>(`#slot-name-${id}`)?.focus());
  }
  function moveSlot(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= plan.slots.length) return;
    const [s] = plan.slots.splice(i, 1);
    plan.slots.splice(j, 0, s);
  }
  function removeSlot(i: number) {
    const s = plan.slots[i];
    const count = Object.values(plan.days).reduce((t, d) => t + (d.meals[s.id]?.length ?? 0), 0);
    undoable(`Removed ${s.name || 'the meal'}${count ? ` and the ${count} thing${count === 1 ? '' : 's'} planned in it` : ''}`, (p) => {
      p.slots.splice(i, 1);
      for (const d of allDays(p)) delete d.meals[s.id];
    });
  }

  // ---------- backup ----------
  function backUp() {
    exportBackup(plan);
    showToast('Backup saved to your downloads');
  }
  async function restore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const incoming = await readBackup(file);
      const before = JSON.stringify(store.plan);
      store.plan = incoming;
      showToast(`Loaded ${file.name}`, () => {
        store.plan = toPlan(JSON.parse(before));
      });
    } catch (err) {
      showToast(err instanceof PlanFormatError ? err.message : 'Couldn’t read that file.');
    }
  }

  // ---------- weeks and cooking ----------
  const order = $derived(Array.from({ length: 7 }, (_, i) => (i + plan.settings.weekStart) % 7));
  function cookOnPrepDays(on: boolean) {
    plan.settings.prepDays = on ? [0] : [];
  }
  function togglePrepDay(d: number) {
    const days = plan.settings.prepDays;
    if (days.includes(d)) {
      if (days.length > 1) plan.settings.prepDays = days.filter((x) => x !== d);
    } else plan.settings.prepDays = [...days, d].sort();
  }
  function removeTemplate(id: string) {
    const t = plan.templates.find((x) => x.id === id);
    undoable(`Deleted the saved week “${t?.name ?? ''}”`, (p) => {
      p.templates = p.templates.filter((x) => x.id !== id);
    });
  }
</script>

<a class="back" href="#me">‹ Me</a>
<h1 class="page-title">Settings</h1>

<h2 class="bar">Meals</h2>
<div class="panel pad">
  <p class="note top">The meals in your day, in order. Rename them, move them, or add your own, like Pre-workout or Shakes.</p>
  <ul class="slots">
    {#each plan.slots as slot, i (slot.id)}
      <li>
        <input class="field" id="slot-name-{slot.id}" bind:value={slot.name} placeholder="Meal name" aria-label="Meal {i + 1} name" />
        <button class="icon-btn" aria-label="Move {slot.name || 'meal'} up" disabled={i === 0} onclick={() => moveSlot(i, -1)}>↑</button>
        <button class="icon-btn" aria-label="Move {slot.name || 'meal'} down" disabled={i === plan.slots.length - 1} onclick={() => moveSlot(i, 1)}
          >↓</button
        >
        <button class="icon-btn x" aria-label="Remove {slot.name || 'meal'}" disabled={plan.slots.length === 1} onclick={() => removeSlot(i)}>×</button>
      </li>
    {/each}
  </ul>
  <button class="btn small" onclick={addSlot}>+ Add a meal</button>
</div>

<h2 class="bar">Units</h2>
<div class="panel pad">
  <div class="unit-row">
    <span class="label">Measurements</span>
    <div class="seg" role="radiogroup" aria-label="Measurements">
      <button role="radio" aria-checked={plan.settings.system === 'metric'} onclick={() => (plan.settings.system = 'metric')}>
        Metric<small>g · ml</small>
      </button>
      <button role="radio" aria-checked={plan.settings.system === 'imperial'} onclick={() => (plan.settings.system = 'imperial')}>
        US<small>oz · fl oz · lb</small>
      </button>
    </div>
  </div>
  <div class="unit-row">
    <span class="label">Energy</span>
    <div class="seg" role="radiogroup" aria-label="Energy">
      <button role="radio" aria-checked={plan.settings.energy === 'kcal'} onclick={() => (plan.settings.energy = 'kcal')}>
        Calories<small>kcal</small>
      </button>
      <button role="radio" aria-checked={plan.settings.energy === 'kJ'} onclick={() => (plan.settings.energy = 'kJ')}>
        Kilojoules<small>kJ</small>
      </button>
    </div>
  </div>
  <p class="note">
    Switching only changes how amounts are shown; your plan is always saved in metric. Food labels on the Foods tab stay in grams and
    millilitres, like on the packet. Pieces and spoons (3 eggs, 1 tbsp) look the same either way.
  </p>
</div>

<h2 class="bar">Food search</h2>
<div class="panel pad">
  <label class="country">
    <span class="label">Search packaged foods sold in</span>
    <select class="field" bind:value={plan.settings.country}>
      {#each COUNTRIES as c (c.tag)}
        <option value={c.tag}>{c.name}</option>
      {/each}
      <option value="">All countries</option>
    </select>
  </label>
  <p class="note">
    Packaged foods come from Open Food Facts, a free database anyone can add to. Limiting search to where you shop keeps the results
    relevant; you can still search everywhere from the results. Basic foods like eggs or rice don’t depend on this.
  </p>
</div>

<h2 class="bar">Backup</h2>
<div class="panel pad">
  <p class="note top">
    Your plan is saved on this device only. A backup file keeps it safe if the browser's data gets cleared, and moves it to another
    phone or computer.
  </p>
  <p class="last">{lastBackup ? `Last backup: ${lastBackup}` : 'No backup yet.'}</p>
  <div class="actions">
    <button class="btn primary" onclick={backUp}>Save a backup file</button>
    <button class="btn" onclick={() => fileInput?.click()}>Load a backup file</button>
    <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={restore} />
  </div>
  <p class="note">Loading a file replaces the plan on this device. Files from the old Claude meal plan work too.</p>
  {#if import.meta.env.VITE_PREVIEW}
    <p class="note preview">This preview runs inside Claude, which blocks downloads, so saving a backup file does nothing here. It works on the real site.</p>
  {/if}
</div>

<h2 class="bar">Weeks and cooking</h2>
<div class="panel pad">
  <div class="unit-row">
    <span class="label">Weeks start on</span>
    <div class="seg" role="radiogroup" aria-label="Weeks start on">
      <button role="radio" aria-checked={plan.settings.weekStart === 1} onclick={() => (plan.settings.weekStart = 1)}>Monday</button>
      <button role="radio" aria-checked={plan.settings.weekStart === 0} onclick={() => (plan.settings.weekStart = 0)}>Sunday</button>
    </div>
  </div>
  <div class="unit-row">
    <span class="label">Batches get cooked</span>
    <div class="seg" role="radiogroup" aria-label="Batches get cooked">
      <button role="radio" aria-checked={!plan.settings.prepDays.length} onclick={() => cookOnPrepDays(false)}>
        When first eaten<small>leftovers fill the next meals</small>
      </button>
      <button role="radio" aria-checked={!!plan.settings.prepDays.length} onclick={() => cookOnPrepDays(true)}>
        On prep days<small>cook ahead for the week</small>
      </button>
    </div>
  </div>
  {#if plan.settings.prepDays.length}
    <div class="days" role="group" aria-label="Prep days">
      {#each order as d (d)}
        {@const on = plan.settings.prepDays.includes(d)}
        <button class="day-chip" class:on aria-pressed={on} onclick={() => togglePrepDay(d)}>{WEEKDAYS_SHORT[d]}</button>
      {/each}
    </div>
  {/if}
  <label class="keep">
    <span class="label">Leftovers keep for</span>
    <span class="keep-row">
      <NumInput
        value={plan.settings.fridgeDays}
        label="Days leftovers keep"
        onchange={(v) => (plan.settings.fridgeDays = Math.min(14, Math.max(1, Math.round(v ?? 3))))}
      />
      <span>days in the fridge</span>
    </span>
  </label>
  <p class="note">
    The Prep tab works out what to cook from this. Food safety agencies generally say cooked leftovers keep 3 to 4 days in the fridge;
    freeze anything for later than that.
  </p>

  <span class="label saved-h">Saved weeks</span>
  {#if plan.templates.length}
    <ul class="slots saved">
      {#each plan.templates as t (t.id)}
        <li>
          <input class="field" bind:value={t.name} aria-label="Saved week name" />
          <button class="icon-btn x" aria-label="Delete {t.name}" onclick={() => removeTemplate(t.id)}>×</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="note">None yet. Save a week from the ⋯ menu on the Plan tab to start other weeks from it.</p>
  {/if}
</div>

<h2 class="bar">Prices</h2>
<div class="panel pad">
  <label class="country">
    <span class="label">Currency</span>
    <select class="field" bind:value={plan.settings.currency}>
      {#each CURRENCIES as c (c.code)}
        <option value={c.code}>{c.name} ({c.symbol})</option>
      {/each}
    </select>
  </label>
  <p class="note">Add what a pack costs to each food on the Foods tab, and the app adds up what meals, days and the shopping list cost.</p>
</div>

<h2 class="bar">About</h2>
<div class="panel pad about">
  <p>Meal plan · test build{import.meta.env.VITE_PREVIEW ? ' (preview)' : ''}</p>
  <p class="note">
    {#if store.storage === 'memory'}
      This browser won't let the app save, so changes are lost when you close it. Save a backup file before you go.
    {:else}
      Your plan is stored on this device and never uploaded. The only things sent anywhere are packaged-food searches and barcode
      lookups, which go to Open Food Facts. Searches pass through the app’s own relay on Cloudflare, which keeps no record of them.
    {/if}
  </p>
  <p class="note">
    Packaged food data © <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> contributors,
    under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">Open Database License</a>.
    Basic food data from <a href="https://fdc.nal.usda.gov" target="_blank" rel="noopener">USDA FoodData Central</a> (SR Legacy, public
    domain).
  </p>
</div>

<style>
  .pad {
    padding: 0.85rem;
  }
  .country {
    display: block;
    max-width: 22rem;
  }
  .days {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0 0 0.9rem;
  }
  .day-chip {
    min-width: 3rem;
    min-height: 2.4rem;
    border: 1px solid var(--line);
    border-radius: 0.4rem;
    background: var(--surface);
    font-weight: 600;
    cursor: pointer;
  }
  .day-chip.on {
    background: var(--bar);
    border-color: var(--bar);
    color: var(--bar-ink);
  }
  .keep {
    display: block;
  }
  .keep-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .keep-row :global(.field) {
    width: 4.5rem;
  }
  .saved-h {
    display: block;
    margin-top: 1rem;
  }
  .about a {
    color: inherit;
  }
  .top {
    margin-top: 0;
    margin-bottom: 0.75rem;
  }
  .slots {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .slots li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .slots .field {
    flex: 1;
    font-weight: 600;
  }
  .back {
    display: inline-block;
    margin-top: 0.25rem;
    color: var(--muted);
    font-weight: 600;
    text-decoration: none;
  }
  .back:hover {
    color: var(--ink);
  }
  .unit-row {
    display: grid;
    gap: 0.3rem;
    margin-bottom: 0.8rem;
  }
  .seg {
    display: inline-grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    max-width: 24rem;
    padding: 0.2rem;
    gap: 0.2rem;
    border: 1px solid var(--line);
    border-radius: 0.55rem;
    background: var(--bg);
  }
  .seg button {
    display: grid;
    min-height: 2.75rem;
    padding: 0.35rem 0.6rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    font-weight: 600;
    cursor: pointer;
  }
  .seg button small {
    font-weight: 500;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .seg button[aria-checked='true'] {
    background: var(--bar);
    color: var(--bar-ink);
  }
  .seg button[aria-checked='true'] small {
    color: inherit;
    opacity: 0.85;
  }
  .last {
    font-weight: 600;
    margin: 0 0 0.6rem;
  }
  .preview {
    color: var(--under);
  }
  .about p:first-child {
    margin: 0;
    font-weight: 600;
  }
</style>
