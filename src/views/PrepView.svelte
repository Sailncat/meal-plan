<script lang="ts">
  import type { Batch, Use } from '../lib/batches';
  import { planBatches } from '../lib/batches';
  import { foodById, servingsOf } from '../lib/calc';
  import { dayCost, foodCost } from '../lib/shopping';
  import { money } from '../lib/money';
  import { fmtN } from '../lib/num';
  import { amountOf } from '../lib/display';
  import { baseAmount } from '../lib/units';
  import { daysBetween, dayShort, dayTitle, today as todayOf, weekDates } from '../lib/dates';
  import { WEEKDAYS } from '../lib/types';
  import { store, ui } from '../lib/store.svelte';
  import WeekNav from '../components/WeekNav.svelte';

  const plan = $derived(store.plan!);
  const today = todayOf();
  const dates = $derived(weekDates(ui.date, plan.settings.weekStart));
  const all = $derived(planBatches(plan, dates[0], dates[6]));
  // One-serving recipes (a shake, a bowl of porridge) are made fresh each time; only real batches get a cook day.
  const batches = $derived(all.filter((b) => servingsOf(b.recipe) > 1));
  const fresh = $derived.by(() => {
    const by = new Map<string, { name: string; servings: number }>();
    for (const b of all) {
      if (servingsOf(b.recipe) > 1) continue;
      const f = by.get(b.recipe.id) ?? { name: b.recipe.name || 'Unnamed recipe', servings: 0 };
      f.servings += b.uses.filter((u) => u.date >= dates[0] && u.date <= dates[6]).reduce((t, u) => t + u.servings, 0);
      by.set(b.recipe.id, f);
    }
    return [...by.values()].filter((f) => f.servings > 0).sort((a, b) => a.name.localeCompare(b.name));
  });
  const cookDays = $derived([...new Set(batches.map((b) => b.cookDate))]);
  const s = $derived(plan.settings);
  const prepNames = $derived(
    [...s.prepDays]
      .sort((a, b) => ((a - s.weekStart + 7) % 7) - ((b - s.weekStart + 7) % 7))
      .map((d) => WEEKDAYS[d]),
  );
  const keeps = $derived(`leftovers keep ${s.fridgeDays} day${s.fridgeDays === 1 ? '' : 's'}`);

  const weekCost = $derived.by(() => {
    let total = 0;
    let known = false;
    let partial = false;
    for (const d of dates) {
      const c = dayCost(plan, plan.days[d]);
      total += c.total;
      known ||= c.known;
      partial ||= c.partial;
    }
    return { total, known, partial };
  });

  const slotName = (id: string) => plan.slots.find((x) => x.id === id)?.name || 'meal';
  const useText = (u: Use) => `${dayShort(u.date)} ${slotName(u.slotId).toLowerCase()}${u.servings !== 1 ? ` (${fmtN(u.servings)})` : ''}`;
  const servingsText = (n: number) => `${fmtN(n)} serving${n === 1 ? '' : 's'}`;

  function batchCost(b: Batch) {
    let total = 0;
    let known = false;
    let partial = false;
    for (const l of b.recipe.lines) {
      const food = foodById(plan, l.food);
      if (!food) continue;
      const c = foodCost(food, (baseAmount(food, l.amount, l.measure) ?? 0) * b.batches);
      if (c == null) partial = true;
      else {
        total += c;
        known = true;
      }
    }
    return { total, known, partial };
  }
</script>

<WeekNav tab="prep" />

<p class="note how">
  {#if s.prepDays.length}
    Cooking on prep days: {prepNames.join(' and ')}. Each one cooks for the meals up to the next; {keeps}.
  {:else}
    Each batch is cooked the day it’s first eaten, and its leftovers fill the next meals; {keeps}.
  {/if}
  <a href="#options">Change this</a>
</p>

{#if !batches.length}
  <div class="card empty">
    <p>No batch recipes planned this week, so there’s nothing to cook ahead.</p>
    <p class="note">
      A recipe that makes more than one serving, like a pot that covers two dinners, shows up here with the day to cook it.
    </p>
  </div>
{:else}
  {#each cookDays as date (date)}
    <h2 class="cook-day">
      {dayTitle(date)}
      {#if date === today}<span class="tag">Today</span>{:else if date < dates[0]}<span class="tag muted">Last week</span>{:else if date < today}<span class="tag muted">Done</span>{/if}
    </h2>
    {#each batches.filter((b) => b.cookDate === date) as b (b.recipe.id + b.cookDate)}
      {@const cost = batchCost(b)}
      <article class="card batch">
        <header>
          <h3>{b.recipe.name || 'Unnamed recipe'}</h3>
          <span class="made tabular">
            {b.batches === 1 ? '1 batch' : `${b.batches} batches`} · {servingsText(b.made)}{#if cost.known} · {cost.partial ? '≥ ' : ''}{money(cost.total, s.currency)}{/if}
          </span>
        </header>
        <p class="covers">
          <span class="label-inline">For</span>
          {#each b.uses as u, i (u.entryId + i)}<span class="chip" class:late={b.late.includes(u)}>{useText(u)}</span>{/each}
        </p>
        {#if b.spare > 0}
          <p class="note">{servingsText(b.spare)} spare. Plan {b.spare === 1 ? 'it' : 'them'} in, or freeze for later.</p>
        {/if}
        {#each b.late as u (u.entryId)}
          <p class="warn">
            {useText(u)} is {daysBetween(b.cookDate, u.date)} days after cooking, longer than leftovers keep. Freeze that portion, or add a prep day closer to it.
          </p>
        {/each}
        <details>
          <summary>What goes in{b.batches > 1 ? ` (×${b.batches})` : ''}</summary>
          <ul class="lines">
            {#each b.recipe.lines as l, i (i)}
              {@const food = foodById(plan, l.food)}
              {#if food}
                <li>
                  <span>{food.name || 'Unnamed food'}</span>
                  <span class="tabular">{amountOf(food, l.amount == null ? null : l.amount * b.batches, l.measure)}</span>
                </li>
              {/if}
            {/each}
          </ul>
        </details>
      </article>
    {/each}
  {/each}
{/if}

{#if fresh.length}
  <section class="card fresh">
    <h2>Made fresh each time</h2>
    <p class="note">One-serving recipes this week, made when you eat them:</p>
    <ul>
      {#each fresh as f (f.name)}
        <li><span>{f.name}</span><span class="tabular">{servingsText(f.servings)}</span></li>
      {/each}
    </ul>
  </section>
{/if}

{#if weekCost.known}
  <p class="note week-cost">
    Food for the whole week: <b class="tabular">{weekCost.partial ? 'at least ' : ''}{money(weekCost.total, s.currency)}</b>{#if weekCost.partial}, as some foods have no price yet{/if}.
  </p>
{/if}

<style>
  .how {
    margin: 0 0 0.75rem;
  }
  .how a {
    color: inherit;
    font-weight: 600;
  }
  .empty {
    padding: 0.9rem;
  }
  .empty p {
    margin: 0 0 0.4rem;
  }
  .cook-day {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-family: var(--display);
    font-size: 1.35rem;
    margin: 1rem 0 0.4rem;
  }
  .tag {
    font-family: var(--body);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--bar-ink);
    background: var(--bar);
    padding: 0.12rem 0.45rem;
    border-radius: 0.3rem;
  }
  .tag.muted {
    background: var(--track);
    color: var(--muted);
  }
  .batch {
    padding: 0.7rem 0.85rem;
    margin-bottom: 0.6rem;
  }
  .batch header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.2rem 0.75rem;
  }
  h3 {
    font-size: 1.05rem;
    margin: 0;
  }
  .made {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
  }
  .covers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin: 0.5rem 0 0;
  }
  .label-inline {
    font-size: 0.85rem;
    color: var(--muted);
    margin-right: 0.1rem;
  }
  .chip {
    font-size: 0.85rem;
    padding: 0.15rem 0.5rem;
    border-radius: 1rem;
    background: var(--pale);
  }
  .chip.late {
    background: transparent;
    border: 1px dashed var(--over);
    color: var(--over);
  }
  .batch .note {
    margin: 0.45rem 0 0;
  }
  .warn {
    margin: 0.45rem 0 0;
    font-size: 0.9rem;
    color: var(--over);
  }
  details {
    margin-top: 0.5rem;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .lines {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0;
  }
  .lines li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--line);
    font-size: 0.92rem;
  }
  .fresh {
    padding: 0.7rem 0.85rem;
    margin-top: 1rem;
  }
  .fresh h2 {
    font-family: var(--display);
    font-size: 1.2rem;
    margin: 0;
  }
  .fresh .note {
    margin: 0.2rem 0 0.3rem;
  }
  .fresh ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .fresh li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.3rem 0;
    border-top: 1px solid var(--line);
  }
  .week-cost {
    margin-top: 1rem;
  }
</style>
