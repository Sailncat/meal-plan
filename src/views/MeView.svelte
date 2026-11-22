<script lang="ts">
  import type { Aim, MacroKey, Range, Stage } from '../lib/types';
  import { store, showToast, undoable } from '../lib/store.svelte';
  import { ACTIVITIES, KCAL_FLOOR, PACES, ageOf, isPregnantOrFeeding, profileGaps, targetsInUse } from '../lib/targets';
  import { KG_PER_LB, cmToFtIn, ftInToCm, kgToShown, shownToKg, weightText, weightUnit } from '../lib/units';
  import { STANDARD_NAMES } from '../lib/references';
  import { E, EU, fromE } from '../lib/display';
  import { fmt0 } from '../lib/num';
  import { longDate, shortDate, today } from '../lib/dates';
  import NumInput from '../components/NumInput.svelte';
  import WeightChart from '../components/WeightChart.svelte';

  const plan = $derived(store.plan!);
  const prof = $derived(plan.profile);
  const sys = $derived(plan.settings.system);
  const latest = $derived(plan.weights.at(-1) ?? null);
  const use = $derived(targetsInUse(plan));
  const gaps = $derived(profileGaps(prof, latest?.kg ?? null));
  const age = $derived(ageOf(prof.birthYear));
  const complete = $derived(!gaps.length);
  const special = $derived(prof.sex === 'female' && isPregnantOrFeeding(prof.stage));

  // ---------- weight log ----------
  let logging = $state(false);
  let logDate = $state(today());
  let logValue = $state<number | null>(null);
  let showAll = $state(false);

  function openLog() {
    logDate = today();
    logValue = latest ? Math.round(kgToShown(latest.kg, sys) * 10) / 10 : null;
    logging = true;
  }
  function saveWeight() {
    if (!logValue || logValue <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return;
    const kg = Math.round(shownToKg(logValue, sys) * 100) / 100;
    const same = plan.weights.find((w) => w.date === logDate);
    if (same) same.kg = kg;
    else {
      plan.weights.push({ date: logDate, kg });
      plan.weights.sort((a, b) => a.date.localeCompare(b.date));
    }
    logging = false;
    showToast(`Logged ${weightText(kg, sys)} for ${shortDate(logDate)}`);
  }
  function removeWeight(date: string) {
    undoable(`Removed the weight from ${shortDate(date)}`, (p) => {
      p.weights = p.weights.filter((w) => w.date !== date);
    });
  }
  const listed = $derived([...plan.weights].reverse().slice(0, showAll ? undefined : 5));
  const change = $derived.by(() => {
    if (plan.weights.length < 2) return null;
    const first = plan.weights.find((w) => Date.parse(latest!.date) - Date.parse(w.date) <= 30 * 864e5)!;
    if (first === latest) return null;
    return { kg: latest!.kg - first.kg, since: first.date };
  });

  // ---------- profile ----------
  let editing = $state(false);
  const showForm = $derived(editing || !complete);
  const ftIn = $derived(prof.heightCm ? cmToFtIn(prof.heightCm) : { ft: 0, inch: 0 });
  const activity = $derived(ACTIVITIES.find((a) => a.id === prof.activity)!);
  const paceText = (kg: number) => (sys === 'imperial' ? `${(kg / KG_PER_LB).toFixed(2).replace(/0$/, '')} lb` : `${kg} kg`);
  const aimText = $derived(
    special
      ? 'keep steady (pregnant or breastfeeding)'
      : prof.aim === 'maintain'
        ? 'stay the same weight'
        : `${prof.aim} ${paceText(prof.pace)} a week`,
  );
  const STAGES: { id: Stage; label: string }[] = [
    { id: 'none', label: 'Not pregnant or breastfeeding' },
    { id: 'pregnant1', label: 'Pregnant, first trimester' },
    { id: 'pregnant2', label: 'Pregnant, second trimester' },
    { id: 'pregnant3', label: 'Pregnant, third trimester' },
    { id: 'breastfeeding', label: 'Breastfeeding' },
  ];
  function setAim(a: Aim) {
    prof.aim = a;
    if (a === 'lose' && !(PACES.lose as readonly number[]).includes(prof.pace)) prof.pace = 0.5;
    if (a === 'gain' && !(PACES.gain as readonly number[]).includes(prof.pace)) prof.pace = 0.25;
  }

  // ---------- targets ----------
  const ROWS: { k: MacroKey; label: () => string; unit: () => string; show: (n: number) => number; back: (n: number) => number }[] = [
    { k: 'kcal', label: () => (EU() === 'kJ' ? 'Energy' : 'Calories'), unit: EU, show: E, back: fromE },
    { k: 'protein', label: () => 'Protein', unit: () => 'g', show: (n) => n, back: (n) => n },
    { k: 'carbs', label: () => 'Carbs', unit: () => 'g', show: (n) => n, back: (n) => n },
    { k: 'fat', label: () => 'Fat', unit: () => 'g', show: (n) => n, back: (n) => n },
  ];
  const rangeText = (r: Range, row: (typeof ROWS)[number]) => `${fmt0(row.show(r.low))}–${fmt0(row.show(r.high))} ${row.unit()}`;
  function typeOwn(k: MacroKey) {
    plan.targets[k] = { ...use.targets[k] };
    plan.targets.custom[k] = true;
  }
  const lowKcal = $derived(
    prof.sex && (use.targets.kcal.low + use.targets.kcal.high) / 2 < KCAL_FLOOR[prof.sex] ? KCAL_FLOOR[prof.sex] : null,
  );

  const GAP_TEXT: Record<string, string> = { sex: 'sex', age: 'age', height: 'height', weight: 'weight' };
  const missing = $derived(gaps.filter((g) => g !== 'under18').map((g) => GAP_TEXT[g]));
</script>

<h1 class="page-title">Me</h1>

<!-- ---------- weight ---------- -->
<section class="card block" aria-labelledby="weight-h">
  <div class="head">
    <h2 id="weight-h">Weight</h2>
    {#if !logging}<button class="btn primary small" onclick={openLog}>+ Log weight</button>{/if}
  </div>

  {#if latest}
    <p class="now">
      <span class="big tabular">{weightText(latest.kg, sys)}</span>
      <span class="muted">on {longDate(latest.date)}</span>
      {#if change}
        <span class="delta tabular">
          {change.kg > 0 ? '+' : change.kg < 0 ? '−' : '±'}{Math.abs(kgToShown(change.kg, sys)).toFixed(1)}
          {weightUnit(sys)} since {shortDate(change.since)}
        </span>
      {/if}
    </p>
  {/if}

  {#if logging}
    <form
      class="log"
      onsubmit={(e) => {
        e.preventDefault();
        saveWeight();
      }}
    >
      <label>
        <span class="label">Date</span>
        <input class="field" type="date" bind:value={logDate} max={today()} required />
      </label>
      <label>
        <span class="label">Weight ({weightUnit(sys)})</span>
        <NumInput value={logValue} label="Weight in {weightUnit(sys)}" onchange={(v) => (logValue = v)} />
      </label>
      <div class="actions">
        <button class="btn primary" type="submit" disabled={!logValue}>Save</button>
        <button class="btn ghost" type="button" onclick={() => (logging = false)}>Cancel</button>
      </div>
    </form>
  {/if}

  <WeightChart weights={plan.weights} system={sys} />

  {#if plan.weights.length}
    <ul class="history">
      {#each listed as w (w.date)}
        <li>
          <span>{longDate(w.date)}</span>
          <span class="tabular">{weightText(w.kg, sys)}</span>
          <button class="icon-btn x" aria-label="Remove the weight from {longDate(w.date)}" onclick={() => removeWeight(w.date)}>×</button>
        </li>
      {/each}
    </ul>
    {#if plan.weights.length > 5}
      <button class="btn ghost small" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${plan.weights.length}`}</button>
    {/if}
  {:else if !logging}
    <p class="note">Log your weight to work out your targets. Weigh yourself at the same time of day, like first thing in the morning.</p>
  {/if}
</section>

<!-- ---------- profile ---------- -->
<section class="card block" aria-labelledby="you-h">
  <div class="head">
    <h2 id="you-h">You</h2>
    {#if complete}<button class="btn small" onclick={() => (editing = !editing)}>{editing ? 'Done' : 'Edit'}</button>{/if}
  </div>

  {#if !showForm}
    <p class="summary">
      {prof.sex === 'male' ? 'Male' : 'Female'}, {age}, {sys === 'imperial' ? `${ftIn.ft} ft ${ftIn.inch} in` : `${prof.heightCm} cm`},
      {activity.label.toLowerCase()}.<br />Aim: {aimText}.
    </p>
    <p class="note">Vitamin and mineral goals: {STANDARD_NAMES[prof.standard]}.</p>
  {:else}
    {#if missing.length}
      <p class="note top">Fill in your {missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} to get targets that fit you.</p>
    {/if}
    <div class="form">
      <div class="row">
        <span class="label">Sex (for the formulas)</span>
        <div class="seg" role="radiogroup" aria-label="Sex">
          <button role="radio" aria-checked={prof.sex === 'male'} onclick={() => (prof.sex = 'male')}>Male</button>
          <button
            role="radio"
            aria-checked={prof.sex === 'female'}
            onclick={() => {
              prof.sex = 'female';
            }}>Female</button
          >
        </div>
      </div>

      <div class="pair">
        <label>
          <span class="label">Age</span>
          <NumInput
            value={age}
            label="Age in years"
            onchange={(v) => (prof.birthYear = v && v > 0 && v < 120 ? new Date().getFullYear() - Math.round(v) : null)}
          />
        </label>
        {#if sys === 'imperial'}
          <div class="height">
            <span class="label">Height</span>
            <span class="ftin">
              <NumInput value={prof.heightCm ? ftIn.ft : null} label="Height, feet" onchange={(v) => (prof.heightCm = ftInToCm(v ?? 0, ftIn.inch) || null)} />
              <span>ft</span>
              <NumInput value={prof.heightCm ? ftIn.inch : null} label="Height, inches" onchange={(v) => (prof.heightCm = ftInToCm(ftIn.ft, v ?? 0) || null)} />
              <span>in</span>
            </span>
          </div>
        {:else}
          <label>
            <span class="label">Height (cm)</span>
            <NumInput value={prof.heightCm} label="Height in cm" onchange={(v) => (prof.heightCm = v && v > 0 ? v : null)} />
          </label>
        {/if}
      </div>

      <label class="row">
        <span class="label">How active you are</span>
        <select class="field" value={prof.activity} onchange={(e) => (prof.activity = e.currentTarget.value as typeof prof.activity)}>
          {#each ACTIVITIES as a (a.id)}
            <option value={a.id}>{a.label}: {a.sub.toLowerCase()}</option>
          {/each}
        </select>
      </label>

      {#if prof.sex === 'female'}
        <label class="row">
          <span class="label">Pregnancy</span>
          <select class="field" value={prof.stage} onchange={(e) => (prof.stage = e.currentTarget.value as Stage)}>
            {#each STAGES as s (s.id)}
              <option value={s.id}>{s.label}</option>
            {/each}
          </select>
        </label>
      {/if}

      <div class="row">
        <span class="label">Aim</span>
        {#if special}
          <p class="note flat">While you're pregnant or breastfeeding, the app aims to keep your weight steady and adds the extra energy and protein you need. Check your targets with your midwife or doctor.</p>
        {:else}
          <div class="seg three" role="radiogroup" aria-label="Aim">
            <button role="radio" aria-checked={prof.aim === 'lose'} onclick={() => setAim('lose')}>Lose</button>
            <button role="radio" aria-checked={prof.aim === 'maintain'} onclick={() => setAim('maintain')}>Stay the same</button>
            <button role="radio" aria-checked={prof.aim === 'gain'} onclick={() => setAim('gain')}>Gain</button>
          </div>
          {#if prof.aim !== 'maintain'}
            <select class="field pace" value={String(prof.pace)} onchange={(e) => (prof.pace = Number(e.currentTarget.value))} aria-label="How fast">
              {#each PACES[prof.aim] as kg, i (kg)}
                <option value={String(kg)}>{paceText(kg)} a week{i === 0 ? ' (slow)' : i === 1 ? ' (steady)' : ' (fast)'}</option>
              {/each}
            </select>
          {/if}
        {/if}
      </div>

      <div class="row">
        <span class="label">Vitamin and mineral goals from</span>
        <div class="seg" role="radiogroup" aria-label="Reference values">
          <button role="radio" aria-checked={prof.standard === 'eu'} onclick={() => (prof.standard = 'eu')}>EU (EFSA)</button>
          <button role="radio" aria-checked={prof.standard === 'us'} onclick={() => (prof.standard = 'us')}>US</button>
        </div>
      </div>
    </div>
  {/if}

  {#if gaps.includes('under18')}
    <p class="warn" role="alert">
      This app works out targets for adults only. For anyone under 18, growing bodies need different amounts, so it's best to plan targets with
      a doctor or dietitian. You can still plan meals and type your own targets below.
    </p>
  {/if}
</section>

<!-- ---------- targets ---------- -->
<section class="card block" aria-labelledby="targets-h">
  <div class="head">
    <h2 id="targets-h">Daily targets</h2>
  </div>
  {#if !use.worked}
    <p class="note top">
      {gaps.includes('under18') ? 'Your own targets are used.' : 'Until your profile is complete, the targets you type here are used.'} Carbs and fat
      fit around your calories and protein unless you type your own.
    </p>
  {/if}

  <div class="targets">
    {#each ROWS as row (row.k)}
      {@const src = use.source[row.k]}
      {@const editable = src !== 'worked'}
      <div class="t-row">
        <div class="t-name">
          <b>{row.label()}</b>
          <span class="badge" class:yours={src !== 'worked'}>{src === 'worked' ? (use.worked ? 'worked out' : 'fitted') : 'yours'}</span>
        </div>
        {#if editable}
          <div class="t-inputs">
            <NumInput
              value={Math.round(row.show(plan.targets[row.k].low))}
              label="{row.label()}, lowest"
              onchange={(v) => {
                plan.targets[row.k].low = row.back(v ?? 0);
                if (row.k !== 'kcal' && row.k !== 'protein') plan.targets.custom[row.k] = true;
              }}
            />
            <span>–</span>
            <NumInput
              value={Math.round(row.show(plan.targets[row.k].high))}
              label="{row.label()}, highest"
              onchange={(v) => {
                plan.targets[row.k].high = row.back(v ?? 0);
              }}
            />
            <span class="u">{row.unit()}</span>
          </div>
          {#if use.worked && src === 'yours'}
            <button class="btn ghost small" onclick={() => (plan.targets.custom[row.k] = false)}>
              Use worked out ({rangeText(use.worked[row.k], row)})
            </button>
          {:else if !use.worked && plan.targets.custom[row.k] && (row.k === 'carbs' || row.k === 'fat')}
            <button class="btn ghost small" onclick={() => (plan.targets.custom[row.k] = false)}>Fit around calories again</button>
          {/if}
        {:else}
          <div class="t-value tabular">{rangeText(use.targets[row.k], row)}</div>
          <button class="btn ghost small" onclick={() => typeOwn(row.k)}>Type my own</button>
        {/if}
      </div>
    {/each}
  </div>

  {#if lowKcal}
    <p class="warn" role="alert">
      This calorie target is very low: under {fmt0(E(lowKcal))} {EU()} a day. Going this low is best done with a doctor or dietitian.
    </p>
  {/if}

  {#if use.worked}
    {@const s = use.worked.steps}
    <details>
      <summary>How these are worked out</summary>
      <ul class="how">
        <li>Resting energy: {fmt0(E(s.resting))} {EU()} a day (Mifflin-St Jeor formula, from your sex, age, height and weight).</li>
        <li>× {s.factor} for being {activity.label.toLowerCase()} = {fmt0(E(s.daily))} {EU()}.</li>
        {#if s.aimKcal}<li>{s.aimKcal < 0 ? '−' : '+'} {fmt0(E(Math.abs(s.aimKcal)))} {EU()} to {prof.aim} {paceText(prof.pace)} a week (about 7,700 kcal per kg).</li>{/if}
        {#if s.extraKcal}<li>+ {fmt0(E(s.extraKcal))} {EU()} for {prof.stage === 'breastfeeding' ? 'breastfeeding' : 'this stage of pregnancy'} (EFSA).</li>{/if}
        <li>Target: {fmt0(E(s.centre))} {EU()}, with {fmt0(E(100))} {EU()} either side.</li>
        <li>Protein: 1.6–2.2 g per kg of body weight, the range sports nutrition research supports for people who lift.</li>
        <li>Fat: 20–35% of your energy. Carbs: the energy left over.</li>
      </ul>
      <p class="note">Formulas give a starting point. If your weight isn't moving the way you want after two or three weeks, nudge your calories by about 100–200 kcal.</p>
    </details>
  {/if}
</section>

<a class="card settings-link" href="#options">
  <span>Settings</span>
  <small>Meals, units, backup, clearing the week</small>
  <span class="chev" aria-hidden="true">›</span>
</a>

<style>
  .block {
    padding: 0.85rem;
    margin-bottom: 0.85rem;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  h2 {
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.3rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .now {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem 0.75rem;
    margin: 0 0 0.6rem;
  }
  .big {
    font-family: var(--display);
    font-weight: 700;
    font-size: 2rem;
    line-height: 1;
  }
  .delta {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .log {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.6rem;
    align-items: end;
    padding: 0.7rem;
    margin-bottom: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.45rem;
    background: var(--bg);
  }
  .log .actions {
    grid-column: 1 / -1;
  }
  .history {
    list-style: none;
    margin: 0.5rem 0 0.25rem;
    padding: 0;
  }
  .history li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.2rem 0;
    border-top: 1px solid var(--line);
  }
  .summary {
    margin: 0 0 0.3rem;
    line-height: 1.5;
  }
  .form {
    display: grid;
    gap: 0.85rem;
  }
  .row {
    display: grid;
    gap: 0.3rem;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: 0.75rem;
  }
  .ftin {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.35rem;
    color: var(--muted);
    font-weight: 600;
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
  .seg.three {
    max-width: 30rem;
  }
  .seg button {
    min-height: 2.5rem;
    padding: 0.3rem 0.6rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    font-weight: 600;
    cursor: pointer;
  }
  .seg button[aria-checked='true'] {
    background: var(--bar);
    color: var(--bar-ink);
  }
  .pace {
    max-width: 18rem;
    margin-top: 0.4rem;
  }
  .flat {
    margin: 0;
  }
  .top {
    margin: 0 0 0.75rem;
  }
  .warn {
    margin: 0.75rem 0 0;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--over);
    border-radius: 0.45rem;
    color: var(--over);
    font-size: 0.92rem;
  }
  .targets {
    display: grid;
  }
  .t-row {
    display: grid;
    grid-template-columns: minmax(7rem, 1fr) auto;
    align-items: center;
    gap: 0.3rem 0.75rem;
    padding: 0.55rem 0;
    border-top: 1px solid var(--line);
  }
  .t-row:first-child {
    border-top: 0;
  }
  .t-name {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
  }
  .badge {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.05rem 0.4rem;
    border-radius: 0.3rem;
    background: var(--total);
    color: var(--muted);
  }
  .badge.yours {
    background: var(--pick);
    color: var(--pick-ink);
  }
  .t-value {
    font-weight: 700;
    text-align: right;
  }
  .t-inputs {
    display: grid;
    grid-template-columns: 5.25rem auto 5.25rem 2.5rem;
    align-items: center;
    gap: 0.3rem;
  }
  .t-inputs .u {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .t-row > .btn {
    grid-column: 1 / -1;
    justify-self: start;
    padding-left: 0;
    color: var(--bar);
  }
  :global(:root[data-mode='dark']) .t-row > .btn {
    color: var(--bar-ink);
  }
  @media (max-width: 26rem) {
    .t-row {
      grid-template-columns: 1fr;
    }
    .t-value {
      text-align: left;
    }
  }
  details {
    margin-top: 0.75rem;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  .how {
    margin: 0.5rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.3rem;
    font-size: 0.92rem;
  }
  .settings-link {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'name chev' 'sub chev';
    align-items: center;
    padding: 0.75rem 0.85rem;
    color: inherit;
    text-decoration: none;
  }
  .settings-link span:first-child {
    grid-area: name;
    font-weight: 700;
  }
  .settings-link small {
    grid-area: sub;
    color: var(--muted);
  }
  .settings-link .chev {
    grid-area: chev;
    font-size: 1.5rem;
    color: var(--muted);
  }
  .settings-link:hover {
    border-color: var(--bar);
  }
</style>
