<script lang="ts">
  import type { Entry, Food } from '../lib/types';
  import { anyEaten, dayNut, foodById, suppsNut } from '../lib/calc';
  import { dayCost } from '../lib/shopping';
  import { money } from '../lib/money';
  import { fmt0, uid } from '../lib/num';
  import { E, EU, amountOf } from '../lib/display';
  import { measureOf } from '../lib/units';
  import { targetsInUse } from '../lib/targets';
  import { addDays, dayTitle, rangeText, today as todayOf, weekDates } from '../lib/dates';
  import { applyTemplate, clearDates, copyWeek, ensureDay, saveTemplate, weekIsEmpty } from '../lib/weeks';
  import { store, ui, undoable, showToast } from '../lib/store.svelte';
  import WeekNav from '../components/WeekNav.svelte';
  import WeekStrip from '../components/WeekStrip.svelte';
  import Gauge from '../components/Gauge.svelte';
  import SlotCard from '../components/SlotCard.svelte';
  import FoodSearch from '../components/FoodSearch.svelte';
  import BackupBanner from '../components/BackupBanner.svelte';

  const plan = $derived(store.plan!);
  const today = todayOf();
  const dates = $derived(weekDates(ui.date, plan.settings.weekStart));
  const lastWeek = $derived(dates.map((d) => addDays(d, -7)));
  const day = $derived(plan.days[ui.date]);
  const canTick = $derived(ui.date <= today);

  const kcalByDay = $derived(dates.map((d) => dayNut(plan, plan.days[d], 'kcal')));
  const proteinByDay = $derived(dates.map((d) => dayNut(plan, plan.days[d], 'protein')));
  const t = $derived(targetsInUse(plan).targets);
  const selIndex = $derived(dates.indexOf(ui.date));
  const carbs = $derived(dayNut(plan, day, 'carbs'));
  const fat = $derived(dayNut(plan, day, 'fat'));
  const showEaten = $derived(canTick && anyEaten(day));
  const eaten = (key: string) => (showEaten ? dayNut(plan, day, key, 'eaten') : null);
  const cost = $derived(dayCost(plan, day));

  const empty = $derived(weekIsEmpty(plan, dates));
  const lastEmpty = $derived(weekIsEmpty(plan, lastWeek));

  const supplements = $derived(
    plan.foods.filter((f) => f.supplement).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
  );

  // ---------- adding to a meal, and swapping ----------
  let addTo = $state<string | null>(null);
  let swapping = $state<Entry | null>(null);
  let pickerOpen = $state(false);
  const addSlot = $derived(plan.slots.find((s) => s.id === addTo));

  /** What a food starts at when added: one of its default piece, or one label amount. */
  const startAmount = (f: Food) => (f.countBy && measureOf(f, f.countBy) ? 1 : f.per);
  const startMeasure = (f: Food) => (f.countBy && measureOf(f, f.countBy) ? f.countBy : null);
  function openPicker(slotId: string, swap: Entry | null = null) {
    addTo = slotId;
    swapping = swap;
    pickerOpen = true;
  }

  function add(ref: string) {
    if (!addTo) return;
    const food = ref.startsWith('f:') ? foodById(plan, ref.slice(2)) : undefined;
    const amount = food ? startAmount(food) : 1;
    const measure = food ? startMeasure(food) : null;
    const d = ensureDay(plan, ui.date);
    const list = d.meals[addTo];
    if (swapping) {
      // The planned meal stays, crossed out; what was eaten instead goes in right after it.
      const planned = list.find((e) => e.id === swapping!.id);
      if (!planned) return;
      planned.skipped = true;
      planned.eaten = false;
      list.splice(list.indexOf(planned) + 1, 0, { id: uid(), ref, amount, measure, extra: true, eaten: true, swapOf: planned.id });
      return;
    }
    list.push({ id: uid(), ref, amount, measure });
  }

  function toggleSupp(id: string, on: boolean) {
    const d = ensureDay(plan, ui.date);
    d.supps = d.supps.filter((x) => x !== id);
    d.suppsTaken = d.suppsTaken.filter((x) => x !== id);
    if (on) d.supps.push(id);
  }
  function toggleTaken(id: string) {
    const d = ensureDay(plan, ui.date);
    d.suppsTaken = d.suppsTaken.includes(id) ? d.suppsTaken.filter((x) => x !== id) : [...d.suppsTaken, id];
  }

  // ---------- the week menu ----------
  let menu = $state(false);
  let naming = $state(false);
  let templateName = $state('');
  const range = $derived(rangeText(dates[0], dates[6]));

  function copyLast() {
    menu = false;
    undoable(`Copied last week into ${range}`, (p) => copyWeek(p, lastWeek, dates));
  }
  function useTemplate(id: string) {
    menu = false;
    const tpl = plan.templates.find((x) => x.id === id);
    if (tpl) undoable(`Filled ${range} from “${tpl.name}”`, (p) => applyTemplate(p, tpl, dates));
  }
  function saveAsTemplate(e: SubmitEvent) {
    e.preventDefault();
    const saved = saveTemplate(plan, templateName, dates);
    naming = false;
    menu = false;
    templateName = '';
    showToast(`Saved this week as “${saved.name}”`);
  }
  function clearWeek() {
    menu = false;
    undoable(`Cleared ${range}`, (p) => clearDates(p, dates));
  }

  // ---------- swipe between days ----------
  let startX = 0;
  let startY = 0;
  function touchStart(e: TouchEvent) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }
  function touchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) ui.date = addDays(ui.date, dx < 0 ? 1 : -1);
  }
</script>

<!-- composedPath, not closest(): a click that swaps the menu's contents has a target that's no longer in the page. -->
<svelte:window onclick={(e) => menu && !e.composedPath().some((el) => (el as HTMLElement).classList?.contains('week-menu')) && ((menu = false), (naming = false))} />

<BackupBanner />

{#snippet weekActions()}
  <div class="week-menu">
    <button class="icon-btn" aria-label="Week options" aria-expanded={menu} aria-haspopup="menu" onclick={() => (menu = !menu)}>⋯</button>
    {#if menu}
      <div class="menu card" role="menu">
        {#if naming}
          <form class="name-form" onsubmit={saveAsTemplate}>
            <label class="label" for="tpl-name">Name for this week</label>
            <input id="tpl-name" class="field" bind:value={templateName} placeholder="e.g. Cutting week" />
            <div class="row">
              <button class="btn primary small" type="submit">Save</button>
              <button class="btn small" type="button" onclick={() => (naming = false)}>Cancel</button>
            </div>
          </form>
        {:else}
          <button role="menuitem" disabled={lastEmpty} onclick={copyLast}><b>Copy last week here</b><small>{lastEmpty ? 'Last week is empty' : 'Replaces what’s planned this week'}</small></button>
          {#each plan.templates as tpl (tpl.id)}
            <button role="menuitem" onclick={() => useTemplate(tpl.id)}><b>Use “{tpl.name}”</b><small>A saved week</small></button>
          {/each}
          <button role="menuitem" disabled={empty} onclick={() => (naming = true)}><b>Save this week</b><small>To start other weeks from</small></button>
          <button role="menuitem" disabled={empty} onclick={clearWeek}><b>Clear this week</b><small>You can undo it</small></button>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<WeekNav tab="plan" actions={weekActions} />

<div class="sticky">
  <WeekStrip {dates} selected={ui.date} {today} kcal={kcalByDay} protein={proteinByDay} onselect={(d) => (ui.date = d)} />
</div>

{#if empty}
  <section class="card empty-week">
    <p>Nothing planned for {range} yet.</p>
    <div class="actions">
      {#if !lastEmpty}<button class="btn primary" onclick={copyLast}>Copy last week</button>{/if}
      {#each plan.templates as tpl (tpl.id)}
        <button class="btn" onclick={() => useTemplate(tpl.id)}>Use “{tpl.name}”</button>
      {/each}
    </div>
    {#if lastEmpty && !plan.templates.length}
      <p class="note">Add meals below. Once a week is planned you can copy it forward, or save it to start other weeks from.</p>
    {/if}
  </section>
{/if}

<div class="day" ontouchstart={touchStart} ontouchend={touchEnd} role="region" aria-label={dayTitle(ui.date)}>
  <h1 class="page-title">
    {dayTitle(ui.date)}{#if ui.date === today}<span class="today">Today</span>{/if}
  </h1>

  <div class="gauges">
    <Gauge name={EU() === 'kJ' ? 'Energy' : 'Calories'} value={E(kcalByDay[selIndex])} unit={EU()} low={E(t.kcal.low)} high={E(t.kcal.high)} eaten={showEaten ? E(eaten('kcal')!) : null} />
    <Gauge name="Protein" value={proteinByDay[selIndex]} unit="g" low={t.protein.low} high={t.protein.high} overOk eaten={eaten('protein')} />
    <Gauge name="Carbs" value={carbs} unit="g" low={t.carbs.low} high={t.carbs.high} eaten={eaten('carbs')} />
    <Gauge name="Fat" value={fat} unit="g" low={t.fat.low} high={t.fat.high} eaten={eaten('fat')} />
  </div>
  {#if cost.known}
    <p class="cost note">
      Food for the day: <b class="tabular">{cost.partial ? 'at least ' : ''}{money(cost.total, plan.settings.currency)}</b>{#if cost.partial} · some foods have no price yet{/if}
    </p>
  {/if}
  {#if canTick && !showEaten && day}
    <p class="note hint">Tick meals off as you eat them, or tap ⇄ to swap one for what you had instead.</p>
  {/if}

  <div class="slots">
    {#each plan.slots as slot (slot.id)}
      <SlotCard {day} {slot} {canTick} onadd={() => openPicker(slot.id)} onswap={(e) => openPicker(slot.id, e)} />
    {/each}

    <section class="card supps" aria-labelledby="supps-h">
      <header>
        <h2 id="supps-h">Supplements</h2>
        {#if day?.supps.length}
          <span class="sum tabular">{fmt0(E(suppsNut(plan, day, 'kcal')))} {EU()}</span>
        {/if}
      </header>
      {#if supplements.length}
        <div class="supp-list">
          {#each supplements as s (s.id)}
            {@const planned = !!day?.supps.includes(s.id)}
            {@const taken = !!day?.suppsTaken.includes(s.id)}
            <div class="supp">
              <label>
                <input type="checkbox" checked={planned} onchange={(e) => toggleSupp(s.id, e.currentTarget.checked)} />
                <span>{s.name || 'Unnamed supplement'}</span>
                <small>{amountOf(s, s.per, null)}</small>
              </label>
              {#if canTick && planned}
                <button class="btn small taken" class:on={taken} aria-pressed={taken} onclick={() => toggleTaken(s.id)}>{taken ? 'Taken ✓' : 'Mark taken'}</button>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <p class="note pad">Turn on “Supplement” for a food on the Foods tab and it shows up here to plan for each day.</p>
      {/if}
    </section>
  </div>
</div>

<FoodSearch
  bind:open={pickerOpen}
  mode="meal"
  title={swapping ? 'What did you have instead?' : `Add to ${addSlot?.name || 'meal'}`}
  action={swapping ? 'Swap it in' : `Add to ${addSlot?.name || 'meal'}`}
  onpick={add}
/>

<style>
  .sticky {
    position: sticky;
    top: calc(var(--top-h, 3.25rem) + var(--safe-t));
    z-index: 4;
    padding: 0.35rem 0 0.5rem;
    margin-top: -0.35rem;
    background: var(--bg);
  }
  .week-menu {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.3rem);
    z-index: 12;
    display: grid;
    width: min(17rem, 85vw);
    padding: 0.3rem;
    box-shadow: var(--shadow);
  }
  .menu button[role='menuitem'] {
    display: grid;
    gap: 0.1rem;
    text-align: left;
    padding: 0.5rem 0.65rem;
    border: 0;
    border-radius: 0.35rem;
    background: transparent;
    cursor: pointer;
  }
  .menu button[role='menuitem']:hover:not(:disabled) {
    background: var(--pale);
  }
  .menu button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .menu small {
    color: var(--muted);
  }
  .name-form {
    display: grid;
    gap: 0.4rem;
    padding: 0.4rem;
  }
  .name-form .row {
    display: flex;
    gap: 0.4rem;
  }
  .empty-week {
    padding: 0.85rem;
    margin-bottom: 0.9rem;
  }
  .empty-week p {
    margin: 0 0 0.6rem;
  }
  .empty-week .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .empty-week .note {
    margin: 0.6rem 0 0;
  }
  .page-title {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  .today {
    font-family: var(--body);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--bar-ink);
    background: var(--bar);
    padding: 0.15rem 0.45rem;
    border-radius: 0.3rem;
  }
  .gauges {
    display: grid;
    gap: 0.9rem;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    margin-bottom: 1rem;
  }
  .cost {
    margin: -0.4rem 0 0.8rem;
  }
  .hint {
    margin: -0.4rem 0 0.8rem;
  }
  .slots {
    display: grid;
    gap: 0.75rem;
  }
  .supps header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0.55rem 0.85rem 0.35rem;
  }
  .supps h2 {
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.2rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .sum {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
  }
  .supp-list {
    padding: 0 0.5rem 0.4rem;
  }
  .supp {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-top: 1px solid var(--line);
  }
  .supp label {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.75rem;
    padding: 0.3rem 0.4rem;
    cursor: pointer;
  }
  .supp input {
    width: 1.2rem;
    height: 1.2rem;
    accent-color: var(--bar);
  }
  .supp span {
    flex: 1;
    font-weight: 600;
  }
  .supp small {
    color: var(--muted);
  }
  .taken.on {
    background: var(--ok);
    border-color: var(--ok);
    color: #fff;
  }
  .pad {
    padding: 0 0.85rem 0.75rem;
    margin: 0;
  }
</style>
