<script lang="ts">
  import { DAYS } from '../lib/types';
  import { dayNut, foodById, foodNut, perServing, suppsNut } from '../lib/calc';
  import { fmt0, fold, uid } from '../lib/num';
  import { E, EU, amountOf } from '../lib/display';
  import { baseAmount, measureOf } from '../lib/units';
  import { targetsInUse } from '../lib/targets';
  import type { Food } from '../lib/types';
  import { store } from '../lib/store.svelte';
  import WeekStrip from '../components/WeekStrip.svelte';
  import Gauge from '../components/Gauge.svelte';
  import SlotCard from '../components/SlotCard.svelte';
  import Picker, { type PickGroup } from '../components/Picker.svelte';
  import BackupBanner from '../components/BackupBanner.svelte';

  const plan = $derived(store.plan!);
  const today = (new Date().getDay() + 6) % 7; // Monday = 0
  let selected = $state(today);
  const day = $derived(plan.week[selected]);

  const kcalByDay = $derived(plan.week.map((d) => dayNut(plan, d, 'kcal')));
  const proteinByDay = $derived(plan.week.map((d) => dayNut(plan, d, 'protein')));
  const t = $derived(targetsInUse(plan).targets);
  const carbs = $derived(dayNut(plan, day, 'carbs'));
  const fat = $derived(dayNut(plan, day, 'fat'));

  const supplements = $derived(
    plan.foods.filter((f) => f.supplement).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
  );

  // ---------- adding to a meal ----------
  let addTo = $state<string | null>(null);
  let pickerOpen = $state(false);
  const addSlot = $derived(plan.slots.find((s) => s.id === addTo));

  const byName = <T extends { name: string }>(a: T, b: T) => fold(a.name).localeCompare(fold(b.name));
  const groups = $derived<PickGroup[]>([
    {
      label: 'Recipes',
      items: [...plan.recipes].sort(byName).map((r) => ({
        value: 'r:' + r.id,
        label: r.name || 'Unnamed recipe',
        sub: `${fmt0(E(perServing(plan, r, 'kcal')))} ${EU()} a serving`,
      })),
    },
    {
      label: 'Foods',
      items: plan.foods
        .filter((f) => !f.supplement)
        .sort(byName)
        .map((f) => ({ value: 'f:' + f.id, label: f.name || 'Unnamed food', sub: startSub(f) })),
    },
  ]);

  /** What a food starts at when added: one of its default piece, or one label amount. */
  const startAmount = (f: Food) => (f.countBy && measureOf(f, f.countBy) ? 1 : f.per);
  const startMeasure = (f: Food) => (f.countBy && measureOf(f, f.countBy) ? f.countBy : null);
  function startSub(f: Food) {
    const amount = startAmount(f);
    const measure = startMeasure(f);
    const kcal = foodNut(f, baseAmount(f, amount, measure), 'kcal');
    return `${fmt0(E(kcal))} ${EU()} per ${amountOf(f, amount, measure).replace(/^1 /, '')}`;
  }

  function openPicker(slotId: string) {
    addTo = slotId;
    pickerOpen = true;
  }

  function add(ref: string) {
    if (!addTo) return;
    const food = ref.startsWith('f:') ? foodById(plan, ref.slice(2)) : undefined;
    const amount = food ? startAmount(food) : 1;
    const measure = food ? startMeasure(food) : null;
    (day.meals[addTo] ??= []).push({ id: uid(), ref, amount, measure });
  }

  function toggleSupp(id: string, on: boolean) {
    day.supps = day.supps.filter((x) => x !== id);
    if (on) day.supps.push(id);
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
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) {
      selected = (selected + (dx < 0 ? 1 : 6)) % 7;
    }
  }
</script>

<BackupBanner />

<div class="sticky">
  <WeekStrip {selected} {today} kcal={kcalByDay} protein={proteinByDay} onselect={(i) => (selected = i)} />
</div>

<div class="day" ontouchstart={touchStart} ontouchend={touchEnd} role="region" aria-label={DAYS[selected]}>
  <h1 class="page-title">
    {DAYS[selected]}{#if selected === today}<span class="today">Today</span>{/if}
  </h1>

  <div class="gauges">
    <Gauge name={EU() === 'kJ' ? 'Energy' : 'Calories'} value={E(kcalByDay[selected])} unit={EU()} low={E(t.kcal.low)} high={E(t.kcal.high)} />
    <Gauge name="Protein" value={proteinByDay[selected]} unit="g" low={t.protein.low} high={t.protein.high} overOk />
    <Gauge name="Carbs" value={carbs} unit="g" low={t.carbs.low} high={t.carbs.high} />
    <Gauge name="Fat" value={fat} unit="g" low={t.fat.low} high={t.fat.high} />
  </div>

  <div class="slots">
    {#each plan.slots as slot (slot.id)}
      <SlotCard {day} {slot} onadd={() => openPicker(slot.id)} />
    {/each}

    <section class="card supps" aria-labelledby="supps-h">
      <header>
        <h2 id="supps-h">Supplements</h2>
        {#if day.supps.length}
          <span class="sum tabular">{fmt0(E(suppsNut(plan, day, 'kcal')))} {EU()}</span>
        {/if}
      </header>
      {#if supplements.length}
        <div class="supp-list">
          {#each supplements as s (s.id)}
            <label class="supp">
              <input type="checkbox" checked={day.supps.includes(s.id)} onchange={(e) => toggleSupp(s.id, e.currentTarget.checked)} />
              <span>{s.name || 'Unnamed supplement'}</span>
              <small>{amountOf(s, s.per, null)}</small>
            </label>
          {/each}
        </div>
      {:else}
        <p class="note pad">Turn on “Supplement” for a food on the Foods tab and it shows up here to tick off each day.</p>
      {/if}
    </section>
  </div>
</div>

<Picker
  bind:open={pickerOpen}
  title="Add to {addSlot?.name || 'meal'}"
  {groups}
  empty="Add some foods or recipes first, on the Foods and Recipes tabs."
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
    gap: 0.6rem;
    min-height: 2.75rem;
    padding: 0.3rem 0.4rem;
    border-top: 1px solid var(--line);
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
  .pad {
    padding: 0 0.85rem 0.75rem;
    margin: 0;
  }
</style>
