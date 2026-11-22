<script lang="ts">
  import type { AisleId } from '../lib/types';
  import { shoppingList, type ShopItem } from '../lib/shopping';
  import { AISLES, aisleName } from '../lib/aisles';
  import { money } from '../lib/money';
  import { amountOf } from '../lib/display';
  import { measureOf } from '../lib/units';
  import { rangeText, today as todayOf, weekDates } from '../lib/dates';
  import { store, ui, showToast } from '../lib/store.svelte';
  import WeekNav from '../components/WeekNav.svelte';

  const plan = $derived(store.plan!);
  const today = todayOf();
  const dates = $derived(weekDates(ui.date, plan.settings.weekStart));

  // The list covers what's left of this week by default, or the whole week when looking ahead.
  let from = $state('');
  let to = $state('');
  $effect(() => {
    const first = dates[0];
    const last = dates[6];
    from = today > first && today <= last ? today : first;
    to = last;
  });
  const valid = $derived(!!from && !!to && from <= to);
  const list = $derived(valid ? shoppingList(plan, from, to) : { items: [], batches: [] });
  const groups = $derived(
    AISLES.map((a) => ({ ...a, items: list.items.filter((i) => i.aisle === a.id) })).filter((g) => g.items.length),
  );
  const ticked = $derived(new Set(plan.shopping.ticked));
  const tickedCount = $derived(list.items.filter((i) => ticked.has(i.food.id)).length);
  const priced = $derived(list.items.filter((i) => i.cost != null));
  const total = $derived(priced.reduce((t, i) => t + (i.cost ?? 0), 0));
  const currency = $derived(plan.settings.currency);

  function toggle(id: string) {
    plan.shopping.ticked = ticked.has(id) ? plan.shopping.ticked.filter((x) => x !== id) : [...plan.shopping.ticked, id];
  }
  function clearTicks() {
    plan.shopping.ticked = [];
  }
  function moveTo(item: ShopItem, aisle: AisleId) {
    const food = plan.foods.find((f) => f.id === item.food.id);
    if (!food) return;
    if (aisle === 'other') delete food.aisle;
    else food.aisle = aisle;
  }

  /** "3 eggs", "450 g"; counted foods in whole pieces, rounded up, since you can't buy a third of an onion. */
  function amountText(i: ShopItem) {
    const m = i.food.countBy ? measureOf(i.food, i.food.countBy) : undefined;
    if (m) return amountOf(i.food, Math.ceil(i.base / m.size - 1e-6), m.id);
    return amountOf(i.food, i.base >= 10 ? Math.round(i.base) : Math.round(i.base * 10) / 10, null);
  }
  /** "Oatmeal ×7, Beef pot ×2": batches added up per recipe. */
  const batchText = $derived.by(() => {
    const by = new Map<string, number>();
    for (const b of list.batches) {
      const name = b.recipe.name || 'Unnamed recipe';
      by.set(name, (by.get(name) ?? 0) + b.batches);
    }
    return [...by]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
      .join(', ');
  });
  function packText(i: ShopItem) {
    if (i.packs == null || !i.food.pack) return '';
    return `${i.packs} pack${i.packs === 1 ? '' : 's'} (${amountOf(i.food, i.food.pack.size, null)})`;
  }

  const title = $derived(valid ? `Shopping for ${rangeText(from, to)}` : 'Shopping');
  function asText() {
    const lines = [title];
    for (const g of groups) {
      lines.push('', g.name);
      for (const i of g.items) lines.push(`- ${i.food.name || 'Unnamed food'}: ${amountText(i)}${packText(i) ? ` · ${packText(i)}` : ''}`);
    }
    return lines.join('\n');
  }
  async function share() {
    const text = asText();
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied the list. Paste it anywhere.');
    } catch {
      showToast('Couldn’t share or copy here. Try Print instead.');
    }
  }
</script>

<div class="no-print"><WeekNav tab="shop" /></div>

<h1 class="page-title print-title">{title}</h1>

<div class="range no-print">
  <label>
    <span class="label">From</span>
    <input class="field" type="date" bind:value={from} max={to} />
  </label>
  <label>
    <span class="label">To</span>
    <input class="field" type="date" bind:value={to} min={from} />
  </label>
</div>

{#if !valid}
  <p class="note">Pick a start date before the end date.</p>
{:else if !list.items.length}
  <div class="card empty">
    <p>Nothing to buy for {rangeText(from, to)}.</p>
    <p class="note">The list adds up the meals planned in these dates. Supplements aren’t on it, since they aren’t bought week by week.</p>
  </div>
{:else}
  {#if list.batches.length}
    <p class="note">Recipes count whole batches cooked in these dates: {batchText}.</p>
  {/if}

  <div class="tools no-print">
    <span class="count">{tickedCount} of {list.items.length} ticked</span>
    {#if tickedCount}<button class="btn small ghost" onclick={clearTicks}>Untick all</button>{/if}
    <span class="spacer"></span>
    <button class="btn small" onclick={share}>Share</button>
    <button class="btn small" onclick={() => window.print()}>Print</button>
  </div>

  {#each groups as g (g.id)}
    <section class="card aisle">
      <h2>{g.name}</h2>
      {#each g.items as i (i.food.id)}
        {@const done = ticked.has(i.food.id)}
        <div class="item" class:done>
          <label>
            <input type="checkbox" checked={done} onchange={() => toggle(i.food.id)} />
            <span class="what">
              <span class="name">{i.food.name || 'Unnamed food'}</span>
              <small class="tabular">
                {amountText(i)}{#if packText(i)} · <b>{packText(i)}</b>{/if}{#if i.cost != null} · {money(i.cost, currency)}{/if}
              </small>
            </span>
          </label>
          {#if g.id === 'other'}
            <select class="field move no-print" aria-label="Move {i.food.name} to an aisle" value="other" onchange={(e) => moveTo(i, e.currentTarget.value as AisleId)}>
              <option value="other">Move to…</option>
              {#each AISLES.filter((a) => a.id !== 'other') as a (a.id)}
                <option value={a.id}>{a.name}</option>
              {/each}
            </select>
          {/if}
        </div>
      {/each}
    </section>
  {/each}

  {#if priced.length}
    <p class="note total">
      About <b class="tabular">{money(total, currency)}</b>
      {#if priced.length < list.items.length}
        for the {priced.length} item{priced.length === 1 ? '' : 's'} with a price. Add pack prices on the Foods tab to cover the rest.
      {:else}
        in whole packs.
      {/if}
    </p>
  {:else}
    <p class="note total no-print">Add pack sizes and prices to foods on the Foods tab to see packs to buy and what it costs.</p>
  {/if}
{/if}

<style>
  .range {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .range label {
    flex: 1;
    max-width: 12rem;
  }
  .empty {
    padding: 0.9rem;
  }
  .empty p {
    margin: 0 0 0.4rem;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.5rem 0 0.75rem;
  }
  .count {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .spacer {
    flex: 1;
  }
  .aisle {
    padding: 0.2rem 0 0.3rem;
    margin-bottom: 0.65rem;
  }
  .aisle h2 {
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.15rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    padding: 0.5rem 0.85rem 0.3rem;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-top: 1px solid var(--line);
    padding-right: 0.5rem;
  }
  .item label {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-height: 2.9rem;
    padding: 0.35rem 0.85rem;
    cursor: pointer;
  }
  .item input {
    width: 1.3rem;
    height: 1.3rem;
    accent-color: var(--ok);
    flex: none;
  }
  .what {
    display: grid;
  }
  .name {
    font-weight: 600;
  }
  .what small {
    color: var(--muted);
  }
  .what small b {
    color: var(--ink);
    font-weight: 600;
  }
  .done .name {
    text-decoration: line-through;
    color: var(--muted);
  }
  .move {
    width: auto;
    max-width: 7.5rem;
    font-size: 0.8rem;
    min-height: 2.1rem;
    padding-block: 0.2rem;
  }
  .total {
    margin-top: 0.5rem;
  }
  .print-title {
    display: none;
  }
  @media print {
    .print-title {
      display: block;
    }
    .aisle {
      break-inside: avoid;
      box-shadow: none;
    }
  }
</style>
