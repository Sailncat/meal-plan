<script lang="ts">
  import { exportBackup, readBackup } from '../lib/backup';
  import { PlanFormatError, toPlan } from '../lib/migrate';
  import { uid } from '../lib/num';
  import { COUNTRIES } from '../lib/off';
  import { CURRENCIES } from '../lib/money';
  import { allDays } from '../lib/calc';
  import { showToast, store, undoable } from '../lib/store.svelte';
  import { GAUGE_KEYS, GAUGE_NAMES, MAX_GAUGES, PALETTES, TEXT_SIZES, cleanGauges, isDark, type GaugeKey } from '../lib/look';
  import { EU } from '../lib/display';

  const plan = $derived(store.plan!);
  let fileInput: HTMLInputElement | undefined = $state();

  const lastBackup = $derived(
    plan.meta.lastBackup
      ? new Date(plan.meta.lastBackup).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null,
  );

  // ---------- look ----------
  // Swatches show the colours of the mode the app is in now.
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const darkNow = $derived(isDark(plan.settings.theme, systemDark));

  // ---------- day screen gauges ----------
  const chosen = $derived(cleanGauges(plan.settings.gauges));
  function toggleGauge(k: GaugeKey) {
    const on = chosen.includes(k);
    if (on && chosen.length === 1) return;
    if (!on && chosen.length >= MAX_GAUGES) return;
    plan.settings.gauges = on ? chosen.filter((x) => x !== k) : GAUGE_KEYS.filter((x) => x === k || chosen.includes(x));
  }
  const gaugeName = (k: GaugeKey) => (k === 'kcal' && EU() === 'kJ' ? 'Energy' : GAUGE_NAMES[k]);

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

  // ---------- weeks ----------
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

<h2 class="bar">Day screen</h2>
<div class="panel pad">
  <p class="note top">The gauges at the top of the day screen, up to {MAX_GAUGES}. Meal cards show the same numbers.</p>
  <div class="gauge-picks" role="group" aria-label="Gauges on the day screen">
    {#each GAUGE_KEYS as k (k)}
      {@const on = chosen.includes(k)}
      <label class="gauge-pick" class:on>
        <input
          type="checkbox"
          checked={on}
          disabled={(on && chosen.length === 1) || (!on && chosen.length >= MAX_GAUGES)}
          onchange={() => toggleGauge(k)}
        />
        {gaugeName(k)}
      </label>
    {/each}
  </div>
  <p class="note">
    {#if chosen.length >= MAX_GAUGES}All {MAX_GAUGES} in use: untick one to pick another.{:else if chosen.length === 1}At least one gauge stays on.{:else}{chosen.length} of {MAX_GAUGES} in use.{/if}
    Fibre has a goal to reach; sugars, salt and saturated fat have a limit to stay under.
  </p>
</div>

<h2 class="bar">Look</h2>
<div class="panel pad">
  <div class="unit-row">
    <span class="label">Theme</span>
    <div class="seg" role="radiogroup" aria-label="Theme">
      <button role="radio" aria-checked={plan.settings.theme === 'light'} onclick={() => (plan.settings.theme = 'light')}>Light</button>
      <button role="radio" aria-checked={plan.settings.theme === 'dark'} onclick={() => (plan.settings.theme = 'dark')}>Dark</button>
      <button role="radio" aria-checked={plan.settings.theme === 'auto'} onclick={() => (plan.settings.theme = 'auto')}>
        Auto<small>like your device</small>
      </button>
    </div>
  </div>
  <div class="unit-row">
    <span class="label">Colours</span>
    <div class="swatches" role="radiogroup" aria-label="Colours">
      {#each PALETTES as p (p.id)}
        {@const pair = darkNow ? p.dark : p.light}
        <button role="radio" aria-checked={plan.settings.palette === p.id} onclick={() => (plan.settings.palette = p.id)}>
          <span class="sw" style:--a={pair[0]} style:--b={pair[1]} aria-hidden="true"></span>
          {p.name}
        </button>
      {/each}
    </div>
  </div>
  <div class="unit-row">
    <span class="label">Text size</span>
    <div class="seg" role="radiogroup" aria-label="Text size">
      {#each TEXT_SIZES as t (t.id)}
        <button role="radio" aria-checked={plan.settings.textSize === t.id} aria-label={t.name} onclick={() => (plan.settings.textSize = t.id)}>
          <span class="aa" style:font-size="{t.scale * 1.1}rem" aria-hidden="true">Aa</span><small>{t.name}</small>
        </button>
      {/each}
    </div>
  </div>
  <div class="unit-row">
    <span class="label">Spacing</span>
    <div class="seg" role="radiogroup" aria-label="Spacing">
      <button role="radio" aria-checked={plan.settings.density === 'roomy'} onclick={() => (plan.settings.density = 'roomy')}>
        Roomy<small>more space</small>
      </button>
      <button role="radio" aria-checked={plan.settings.density === 'compact'} onclick={() => (plan.settings.density = 'compact')}>
        Compact<small>fits more on screen</small>
      </button>
    </div>
  </div>
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

<h2 class="bar">Weeks</h2>
<div class="panel pad">
  <div class="unit-row">
    <span class="label">Weeks start on</span>
    <div class="seg" role="radiogroup" aria-label="Weeks start on">
      <button role="radio" aria-checked={plan.settings.weekStart === 1} onclick={() => (plan.settings.weekStart = 1)}>Monday</button>
      <button role="radio" aria-checked={plan.settings.weekStart === 0} onclick={() => (plan.settings.weekStart = 0)}>Sunday</button>
    </div>
  </div>
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
  <p class="note">Add what a pack costs to each food on the Foods tab, and meals and days on the Plan tab show what they cost.</p>
</div>

<a class="card help-link" href="#help">Help, your data and sending feedback <span aria-hidden="true">›</span></a>

<style>
  .pad {
    padding: 0.85rem;
  }
  .country {
    display: block;
    max-width: 22rem;
  }
  .saved-h {
    display: block;
    margin-top: 1rem;
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
  .help-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1.2rem;
    padding: 0.75rem 0.85rem;
    color: inherit;
    font-weight: 700;
    text-decoration: none;
  }
  .help-link span {
    font-size: 1.4rem;
    color: var(--muted);
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
    grid-template-columns: minmax(0, 1fr);
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
  .seg .aa {
    font-family: var(--display);
    font-weight: 700;
    line-height: 1.1;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(3.6rem, 1fr));
    gap: 0.35rem;
    max-width: 26rem;
  }
  .swatches button {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    padding: 0.5rem 0.2rem 0.4rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .swatches button[aria-checked='true'] {
    border: 2px solid var(--ink);
    padding: calc(0.5rem - 1px) calc(0.2rem - 1px) calc(0.4rem - 1px);
  }
  .sw {
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--a) 0 55%, var(--b) 55% 100%);
    border: 1px solid var(--line);
  }
  .gauge-picks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.35rem;
    margin-top: 0.6rem;
  }
  .gauge-pick {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.6rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 0.45rem;
    font-weight: 600;
    cursor: pointer;
  }
  .gauge-pick.on {
    background: var(--pick);
    color: var(--pick-ink);
    border-color: var(--band-edge);
  }
  .gauge-pick input {
    width: 1.15rem;
    height: 1.15rem;
    accent-color: var(--bar);
  }
  .gauge-pick:has(input:disabled:not(:checked)) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .last {
    font-weight: 600;
    margin: 0 0 0.6rem;
  }
  .preview {
    color: var(--under);
  }
</style>
