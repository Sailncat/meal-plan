<script lang="ts">
  import { NUTRIENTS, type NutrientDef } from '../lib/nutrients';
  import { foodById, perServing, weekFoodIds, weekNut } from '../lib/calc';
  import { fmtN } from '../lib/num';
  import { store } from '../lib/store.svelte';

  const plan = $derived(store.plan!);
  const GROUPS = ['Macros', 'Vitamins', 'Minerals'] as const;

  // Foods in this week's plan with no values beyond calories and protein.
  const missing = $derived(
    [...weekFoodIds(plan)]
      .map((id) => foodById(plan, id))
      .filter((f) => f && !Object.keys(f.nut).some((k) => k !== 'kcal' && k !== 'protein'))
      .map((f) => f!.name || 'Unnamed food'),
  );

  function row(n: NutrientDef) {
    const wk = weekNut(plan, n.k);
    const lo = n.min != null ? n.min * 7 : null;
    const hi = n.max != null ? n.max * 7 : null;
    const scale = Math.max((hi ?? lo ?? 1) * 1.25, wk * 1.05, 0.0001);
    const pct = (x: number) => Math.max(0, Math.min(100, (x / scale) * 100));
    let cls = 'ok';
    if (lo != null && wk < lo) cls = 'under';
    if (hi != null && wk > hi) cls = 'over';
    const goal = lo != null && hi != null ? `goal ${fmtN(lo)}–${fmtN(hi)}` : lo != null ? `goal ${fmtN(lo)}` : `limit ${fmtN(hi!)}`;
    const ref = (lo ?? hi)!;
    return { wk, cls, goal, pctOfRef: Math.round((wk / ref) * 100), bandL: lo != null ? pct(lo) : 0, bandR: hi != null ? pct(hi) : 100, fill: pct(wk) };
  }
</script>

<h1 class="page-title">Nutrients</h1>
<p class="note">
  Your week from the Plan tab, against weekly goals for a man aged 19–30 (US Dietary Reference Intakes; WHO limits for salt, saturated fat
  and sugar). Goals from your own age, body and aim arrive with the profile in a later update. Sugars counts all sugars, including the
  natural sugar in milk and fruit, so it reads higher than WHO's free-sugar limit would. Treat the totals as a good estimate.
</p>

{#if missing.length}
  <p class="missing">No vitamin or mineral values yet for {missing.join(', ')}, so they count as zero below. Fill them in on the Foods tab under “More nutrients”.</p>
{/if}

{#each GROUPS as g (g)}
  <h2 class="bar">{g}, this week</h2>
  <div class="panel">
    {#each NUTRIENTS.filter((n) => n.g === g) as n (n.k)}
      {@const r = row(n)}
      <div class="nut">
        <div class="nm">{n.l}<small>{r.pctOfRef}%</small></div>
        <div class="track" role="img" aria-label="{n.l}: {fmtN(r.wk)} {n.u} this week, {r.goal} {n.u}">
          <div class="band" style:left="{r.bandL}%" style:width="{r.bandR - r.bandL}%"></div>
          <div class="fill {r.cls}" style:width="{r.fill}%"></div>
        </div>
        <div class="val tabular"><b class={r.cls}>{fmtN(r.wk)} {n.u}</b> {r.goal} {n.u}<br />{fmtN(r.wk / 7)} {n.u} a day</div>
      </div>
    {/each}
  </div>
{/each}

<h2 class="bar">Recipes, per serving</h2>
<div class="panel scroll">
  <table>
    <thead>
      <tr>
        <th>Recipe</th>
        {#each NUTRIENTS as n (n.k)}<th>{n.s}<br />{n.u}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each plan.recipes as r (r.id)}
        <tr>
          <td title={r.name}>{r.name || 'Unnamed recipe'}</td>
          {#each NUTRIENTS as n (n.k)}<td class="tabular">{fmtN(perServing(plan, r, n.k))}</td>{/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .missing {
    margin: 1rem 0 0;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--under);
    border-radius: 0.4rem;
    color: var(--under);
    font-size: 0.9rem;
  }
  .nut {
    display: grid;
    grid-template-columns: 10rem minmax(0, 1fr) 14rem;
    gap: 0.35rem 1rem;
    align-items: center;
    padding: 0.55rem 0.9rem;
    border-top: 1px solid var(--line);
  }
  .nut:first-child {
    border-top: 0;
  }
  .nm {
    font-weight: 600;
  }
  .nm small {
    color: var(--muted);
    font-weight: 500;
    margin-left: 0.3rem;
  }
  .track {
    position: relative;
    height: 0.75rem;
    background: var(--track);
    border-radius: 0.4rem;
    overflow: hidden;
  }
  .band {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--band);
    border-left: 2px solid var(--band-edge);
    border-right: 2px solid var(--band-edge);
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0.16rem;
    bottom: 0.16rem;
    border-radius: 0.3rem;
  }
  .fill.ok {
    background: var(--ok);
  }
  .fill.over {
    background: var(--over);
  }
  .fill.under {
    background: var(--under);
  }
  .val {
    text-align: right;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .val b {
    font-size: 0.95rem;
  }
  @media (max-width: 40rem) {
    .nut {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .track {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    padding: 0.35rem 0.5rem;
    text-align: right;
    font-size: 0.82rem;
    white-space: nowrap;
  }
  th {
    color: var(--muted);
    font-weight: 600;
    vertical-align: bottom;
    border-bottom: 1px solid var(--line);
  }
  th:first-child,
  td:first-child {
    text-align: left;
    position: sticky;
    left: 0;
    background: var(--surface);
    max-width: 11rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  tbody tr + tr td {
    border-top: 1px solid var(--line);
  }
</style>
