<script lang="ts">
  // The week laid out for paper: each day's meals with amounts and totals, then every recipe used.
  // Shown full screen as a preview; printing hides the rest of the app (see app.css).
  import { onMount } from 'svelte';
  import { store } from '../lib/store.svelte';
  import { dayNut, entryTarget, foodById, perServing } from '../lib/calc';
  import { dayCost } from '../lib/costs';
  import { money } from '../lib/money';
  import { amountText, energyUnit, toEnergy } from '../lib/units';
  import { dayTitle, rangeText } from '../lib/dates';
  import { cleanGauges, gaugeShort, type GaugeKey } from '../lib/look';
  import { minutesText } from '../lib/recipes';
  import { fmt0, fmt1 } from '../lib/num';
  import type { Entry, Recipe } from '../lib/types';

  interface Props {
    dates: string[];
    onclose: () => void;
  }
  let { dates, onclose }: Props = $props();

  const plan = $derived(store.plan!);
  const st = $derived(plan.settings);
  const keys = $derived(cleanGauges(st.gauges));

  const nutText = (value: (k: GaugeKey) => number) =>
    keys.map((k) => (k === 'kcal' ? `${fmt0(toEnergy(value(k), st))} ${energyUnit(st)}` : `${k === 'salt' ? fmt1(value(k)) : fmt0(value(k))} g ${gaugeShort(k)}`)).join(' · ');

  /** What was planned: swaps record what was eaten instead, which isn't part of the plan. */
  const planned = (list: Entry[] | undefined) => (list ?? []).filter((e) => !e.extra);

  function line(e: Entry): { name: string; amount: string } {
    const t = entryTarget(plan, e);
    if (!t) return { name: 'Deleted item', amount: '' };
    if (t.kind === 'recipe') {
      const n = e.amount ?? 0;
      return { name: t.recipe.name || 'Unnamed recipe', amount: `${fmt1(n).replace(/\.0$/, '')} serving${n === 1 ? '' : 's'}` };
    }
    return { name: t.food.name || 'Unnamed food', amount: amountText(t.food, e.amount, e.measure, st.system) };
  }

  const days = $derived(
    dates.map((iso) => {
      const day = plan.days[iso];
      const meals = plan.slots
        .map((s) => ({ name: s.name || 'Meal', lines: planned(day?.meals[s.id]).map(line) }))
        .filter((m) => m.lines.length);
      const supps = (day?.supps ?? []).map((id) => foodById(plan, id)?.name).filter(Boolean) as string[];
      const cost = dayCost(plan, day);
      return {
        iso,
        meals,
        supps,
        empty: !meals.length && !supps.length,
        totals: nutText((k) => dayNut(plan, day, k)),
        cost: cost.known ? `${cost.partial ? '≥ ' : ''}${money(cost.total, st.currency)}` : '',
      };
    }),
  );

  // Every recipe in the week, in the order it first comes up.
  const recipes = $derived.by(() => {
    const seen = new Map<string, Recipe>();
    for (const iso of dates) {
      const day = plan.days[iso];
      for (const s of plan.slots)
        for (const e of planned(day?.meals[s.id])) {
          const t = entryTarget(plan, e);
          if (t?.kind === 'recipe' && !seen.has(t.recipe.id)) seen.set(t.recipe.id, t.recipe);
        }
    }
    return [...seen.values()];
  });

  function ingredients(r: Recipe) {
    return r.lines
      .map((l) => ({ food: foodById(plan, l.food), l }))
      .filter((x) => x.food)
      .map(({ food, l }) => ({ name: food!.name, amount: amountText(food!, l.amount, l.measure, st.system) }));
  }
  const timeText = (r: Recipe) => [r.prepMin ? `prep ${minutesText(r.prepMin)}` : '', r.cookMin ? `cook ${minutesText(r.cookMin)}` : ''].filter(Boolean);

  function print() {
    window.print();
  }

  onMount(() => {
    document.body.classList.add('printing');
    const t = setTimeout(print, 250);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onclose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('printing');
    };
  });
</script>

<div class="print-sheet" role="dialog" aria-modal="true" aria-label="Print this week">
  <div class="toolbar">
    <button class="btn primary" onclick={print}>Print or save as PDF</button>
    <button class="btn" onclick={onclose}>Close</button>
    <span class="note">To get a file, pick “Save as PDF” as the printer.</span>
  </div>

  <article class="paper">
    <header>
      <h1>Meal plan</h1>
      <p>{rangeText(dates[0], dates[6])}</p>
    </header>

    {#each days as d (d.iso)}
      <section class="day" class:empty={d.empty}>
        <h2>{dayTitle(d.iso)}</h2>
        {#if d.empty}
          <p class="muted">Nothing planned.</p>
        {:else}
          {#each d.meals as m, i (i)}
            <div class="meal">
              <h3>{m.name}</h3>
              <ul>
                {#each m.lines as l, j (j)}
                  <li><span>{l.name}</span><span class="amt">{l.amount}</span></li>
                {/each}
              </ul>
            </div>
          {/each}
          {#if d.supps.length}<p class="supps"><b>Supplements:</b> {d.supps.join(', ')}</p>{/if}
          <p class="total"><b>Day total:</b> {d.totals}{d.cost ? ` · ${d.cost}` : ''}</p>
        {/if}
      </section>
    {/each}

    {#if recipes.length}
      <h1 class="recipes-h">Recipes</h1>
      {#each recipes as r (r.id)}
        {@const ings = ingredients(r)}
        {@const time = timeText(r)}
        <section class="recipe">
          <h2>{r.name || 'Unnamed recipe'}</h2>
          <p class="facts">
            Makes {r.servings} serving{r.servings === 1 ? '' : 's'}{time.length ? ` · ${time.join(' · ')}` : ''} · per serving {nutText((k) => perServing(plan, r, k))}
          </p>
          <div class="cols">
            <div>
              <h3>Ingredients</h3>
              <ul>
                {#each ings as x, i (i)}<li><span>{x.name}</span><span class="amt">{x.amount}</span></li>{/each}
              </ul>
            </div>
            {#if r.steps.some((s) => s.trim())}
              <div>
                <h3>Method</h3>
                <ol>
                  {#each r.steps.filter((s) => s.trim()) as s, i (i)}<li>{s}</li>{/each}
                </ol>
              </div>
            {/if}
          </div>
          {#if r.notes.trim()}<p class="notes"><b>Notes:</b> {r.notes.trim()}</p>{/if}
        </section>
      {/each}
    {/if}
  </article>
</div>

<style>
  .print-sheet {
    position: fixed;
    inset: 0;
    z-index: 50;
    overflow-y: auto;
    background: #e9e6e1;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.9rem calc(0.6rem);
    padding-top: calc(0.6rem + var(--safe-t, 0px));
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  .toolbar .note {
    margin: 0;
  }
  /* The page itself is always black on white, whatever the app's colours. */
  .paper {
    max-width: 48rem;
    margin: 1rem auto 3rem;
    padding: 1.5rem 1.6rem;
    background: #fff;
    color: #111;
    font-size: 0.85rem;
    line-height: 1.4;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 2px solid #111;
    margin-bottom: 0.6rem;
  }
  h1 {
    font-family: var(--display);
    font-size: 1.6rem;
    margin: 0;
  }
  header p {
    margin: 0;
    font-weight: 600;
  }
  h2 {
    font-family: var(--display);
    font-size: 1.15rem;
    margin: 0 0 0.25rem;
  }
  h3 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0.35rem 0 0.1rem;
    color: #444;
  }
  .day,
  .recipe {
    padding: 0.55rem 0;
    border-bottom: 1px solid #ccc;
    break-inside: avoid;
  }
  .day.empty h2 {
    display: inline;
    margin-right: 0.5rem;
  }
  .day.empty p {
    display: inline;
  }
  .meal {
    break-inside: avoid;
  }
  ul,
  ol {
    margin: 0;
    padding: 0;
  }
  ul {
    list-style: none;
  }
  ol {
    padding-left: 1.2rem;
  }
  li {
    padding: 0.05rem 0;
  }
  ul li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px dotted #ddd;
  }
  .amt {
    flex: none;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: #666;
  }
  p {
    margin: 0.3rem 0 0;
  }
  .total {
    font-variant-numeric: tabular-nums;
  }
  .recipes-h {
    margin-top: 1.2rem;
    padding-bottom: 0.2rem;
    border-bottom: 2px solid #111;
    break-before: page;
  }
  .facts {
    margin: 0 0 0.2rem;
    color: #444;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.2rem 1.5rem;
  }
  @media print {
    .print-sheet {
      position: static;
      overflow: visible;
      background: #fff;
    }
    .toolbar {
      display: none;
    }
    .paper {
      max-width: none;
      margin: 0;
      padding: 0;
      box-shadow: none;
      font-size: 10pt;
    }
  }
</style>
