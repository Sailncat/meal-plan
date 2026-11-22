<script lang="ts">
  import { NUTRIENTS, type NutrientDef } from '../lib/nutrients';
  import { dayNut, dayNutWhere, foodById, perServing, weekFoodIds, weekNut } from '../lib/calc';
  import { dailyCaps, dailyGoals, upperLimits, STANDARD_NAMES, type Person } from '../lib/references';
  import { ageOf, targetsInUse } from '../lib/targets';
  import { DAYS_SHORT } from '../lib/types';
  import { fmtN } from '../lib/num';
  import { store, undoable } from '../lib/store.svelte';
  import { blanksFilledBy, fillBlanks } from '../lib/foods';
  import type { Food, Nutrients } from '../lib/types';
  import FoodSearch from '../components/FoodSearch.svelte';

  const plan = $derived(store.plan!);
  const prof = $derived(plan.profile);
  const GROUPS = ['Macros', 'Vitamins', 'Minerals'] as const;

  // Goals fit the profile once it's complete; until then, a man of 25.
  const use = $derived(targetsInUse(plan));
  const kcalMid = $derived((use.targets.kcal.low + use.targets.kcal.high) / 2);
  const fitted = $derived(!!use.worked);
  const person = $derived<Person>(
    fitted
      ? { sex: prof.sex!, age: ageOf(prof.birthYear)!, stage: prof.sex === 'female' ? prof.stage : 'none', kcal: kcalMid }
      : { sex: 'male', age: 25, stage: 'none', kcal: kcalMid },
  );
  const goals = $derived(dailyGoals(prof.standard, person));
  const caps = $derived(dailyCaps(person));
  const limits = $derived(upperLimits(prof.standard, person));
  const who = $derived.by(() => {
    if (!fitted) return 'a man aged 25, until your profile on the Me tab is complete';
    const stage =
      person.stage === 'breastfeeding' ? ', breastfeeding' : person.stage !== 'none' ? `, pregnant (trimester ${person.stage.slice(-1)})` : '';
    return `a ${person.age}-year-old ${person.sex === 'male' ? 'man' : 'woman'}${stage}`;
  });

  // Foods in this week's plan with no values beyond calories and protein.
  const missing = $derived(
    [...weekFoodIds(plan)]
      .map((id) => foodById(plan, id))
      .filter((f): f is Food => !!f && !Object.keys(f.nut).some((k) => k !== 'kcal' && k !== 'protein')),
  );

  // Looking a food's values up in the databases.
  let lookingUp = $state<Food | null>(null);
  let searchOpen = $state(false);
  function lookUp(f: Food) {
    lookingUp = f;
    searchOpen = true;
  }
  function fill(nut: Nutrients, from: string) {
    const f = lookingUp;
    if (!f) return;
    const n = blanksFilledBy(f, nut).length;
    undoable(`Filled ${n} value${n === 1 ? '' : 's'} in ${f.name || 'this food'} from ${from}`, () => {
      fillBlanks(f, nut);
    });
  }
  const canLookUp = (f: Food) => f.unit === 'g' || f.unit === 'ml';

  /** A nutrient's daily goal: a band for carbs and fat, a maximum for salt, saturated fat and sugars, a minimum for the rest. */
  function daily(k: string): { lo: number | null; hi: number | null } {
    if (k === 'carbs' || k === 'fat') return { lo: use.targets[k].low, hi: use.targets[k].high };
    if (k in caps) return { lo: null, hi: caps[k] };
    return { lo: goals[k] ?? null, hi: null };
  }

  // Days that go over a safe upper limit. Limits that only cover supplements count only foods marked as supplements.
  const overs = $derived(
    Object.entries(limits)
      .map(([k, lim]) => {
        const vals = plan.week.map((d) => (lim.supplementsOnly ? dayNutWhere(plan, d, k, (f) => f.supplement) : dayNut(plan, d, k)));
        const days = vals.flatMap((v, i) => (v > lim.ul + 1e-9 ? [i] : []));
        return { k, lim, days, max: Math.max(...vals), def: NUTRIENTS.find((n) => n.k === k)! };
      })
      .filter((o) => o.days.length && o.def),
  );
  const overKeys = $derived(new Set(overs.map((o) => o.k)));
  const dayList = (days: number[]) => (days.length === 7 ? 'every day' : days.map((i) => DAYS_SHORT[i]).join(', '));

  function row(n: NutrientDef) {
    const wk = weekNut(plan, n.k);
    const d = daily(n.k);
    const lo = d.lo != null ? d.lo * 7 : null;
    const hi = d.hi != null ? d.hi * 7 : null;
    const scale = Math.max((hi ?? lo ?? 1) * 1.25, wk * 1.05, 0.0001);
    const pct = (x: number) => Math.max(0, Math.min(100, (x / scale) * 100));
    let cls = 'ok';
    if (lo != null && wk < lo) cls = 'under';
    if (hi != null && wk > hi) cls = 'over';
    if (overKeys.has(n.k)) cls = 'over';
    const goal = lo != null && hi != null ? `goal ${fmtN(lo)}–${fmtN(hi)}` : lo != null ? `goal ${fmtN(lo)}` : hi != null ? `limit ${fmtN(hi)}` : 'no goal';
    const ref = lo ?? hi;
    return {
      wk,
      cls,
      goal,
      pctOfRef: ref ? Math.round((wk / ref) * 100) : null,
      bandL: lo != null ? pct(lo) : 0,
      bandR: hi != null ? pct(hi) : 100,
      fill: pct(wk),
    };
  }
</script>

<h1 class="page-title">Nutrients</h1>
<p class="note">
  Your week from the Plan tab, against {STANDARD_NAMES[prof.standard]} goals for {who}. Carbs and fat use your daily targets; salt, saturated
  fat and sugars use WHO limits. Sugars counts all sugars, including the natural sugar in milk and fruit, so it reads higher than WHO's
  free-sugar limit would. Treat the totals as a good estimate.
</p>

{#if overs.length}
  <section class="ul" aria-labelledby="ul-h">
    <h2 id="ul-h">Over a safe upper limit</h2>
    <ul>
      {#each overs as o (o.k)}
        <li>
          <b>{o.def.l}:</b> up to {fmtN(o.max)} {o.def.u} a day ({dayList(o.days)}). The {prof.standard === 'eu' ? 'EU' : 'US'}
          {o.lim.safeLevel ? 'safe level' : 'upper limit'} is {fmtN(o.lim.ul)} {o.def.u} a day{o.lim.supplementsOnly ? ' from supplements' : ''}.
        </li>
      {/each}
    </ul>
    <p class="note">
      An upper limit is the most you can have every day, long term, without expecting harm. Going over now and then isn't a worry, but a
      supplement that does it every day is worth a look, ideally with a pharmacist or doctor.
      {#if overs.some((o) => o.lim.supplementsOnly)}Limits marked “from supplements” only count foods marked as supplements.{/if}
    </p>
  </section>
{/if}

{#if missing.length}
  <div class="missing">
    <p>No vitamin or mineral values yet for these, so they count as zero below:</p>
    <ul>
      {#each missing as f (f.id)}
        <li>
          <span>{f.name || 'Unnamed food'}</span>
          {#if canLookUp(f)}
            <button class="btn small" onclick={() => lookUp(f)}>Look it up</button>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="small">Looking it up fills only the blanks from basic or packaged foods. You can also type them in on the Foods tab, under “More nutrients”.</p>
  </div>
{/if}

{#if lookingUp}
  <FoodSearch bind:open={searchOpen} mode="fill" title="Find missing values" query={lookingUp.name} fillFood={lookingUp} onfill={fill} />
{/if}

{#each GROUPS as g (g)}
  <h2 class="bar">{g}, this week</h2>
  <div class="panel">
    {#each NUTRIENTS.filter((n) => n.g === g) as n (n.k)}
      {@const r = row(n)}
      <div class="nut">
        <div class="nm">
          {n.l}{#if r.pctOfRef != null}<small>{r.pctOfRef}%</small>{/if}
          {#if overKeys.has(n.k)}<span class="tag">over limit</span>{/if}
        </div>
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
  .ul {
    margin: 1rem 0 0;
    padding: 0.75rem 0.9rem;
    border: 1px solid var(--over);
    border-radius: 0.5rem;
    background: var(--surface);
  }
  .ul h2 {
    font-family: var(--display);
    font-size: 1.15rem;
    color: var(--over);
  }
  .ul ul {
    margin: 0.4rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.3rem;
  }
  .tag {
    display: inline-block;
    margin-left: 0.35rem;
    padding: 0 0.35rem;
    border-radius: 0.3rem;
    background: var(--over);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
    vertical-align: 0.1em;
  }
  .missing {
    margin: 1rem 0 0;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--under);
    border-radius: 0.4rem;
    font-size: 0.9rem;
  }
  .missing p {
    margin: 0;
    color: var(--under);
  }
  .missing ul {
    list-style: none;
    margin: 0.4rem 0;
    padding: 0;
  }
  .missing li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.3rem 0;
    border-top: 1px solid var(--line);
  }
  .missing li span {
    font-weight: 600;
  }
  .missing .small {
    color: var(--muted);
    font-size: 0.85rem;
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
