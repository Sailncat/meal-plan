<script lang="ts">
  // The profile fields, on the Me tab and in first-run setup.
  import type { Aim, Stage } from '../lib/types';
  import { store } from '../lib/store.svelte';
  import { ACTIVITIES, PACES, ageOf, isPregnantOrFeeding } from '../lib/targets';
  import { KG_PER_LB, cmToFtIn, ftInToCm, kgToShown, shownToKg, weightUnit } from '../lib/units';
  import { today } from '../lib/dates';
  import NumInput from './NumInput.svelte';

  interface Props {
    /** Ask for today's weight too (first-run setup); on the Me tab it comes from the weight log. */
    withWeight?: boolean;
    /** Leave out the vitamin and mineral standard (first-run setup keeps it short). */
    short?: boolean;
  }
  let { withWeight = false, short = false }: Props = $props();

  const plan = $derived(store.plan!);
  const prof = $derived(plan.profile);
  const sys = $derived(plan.settings.system);
  const age = $derived(ageOf(prof.birthYear));
  const special = $derived(prof.sex === 'female' && isPregnantOrFeeding(prof.stage));
  const ftIn = $derived(prof.heightCm ? cmToFtIn(prof.heightCm) : { ft: 0, inch: 0 });
  const paceText = (kg: number) => (sys === 'imperial' ? `${(kg / KG_PER_LB).toFixed(2).replace(/0$/, '')} lb` : `${kg} kg`);
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

  // Today's weight, as an entry in the weight log.
  const weightToday = $derived(plan.weights.find((w) => w.date === today()) ?? plan.weights.at(-1) ?? null);
  function setWeight(v: number | null) {
    const date = today();
    plan.weights = plan.weights.filter((w) => w.date !== date);
    if (v && v > 0) {
      plan.weights.push({ date, kg: Math.round(shownToKg(v, sys) * 100) / 100 });
      plan.weights.sort((a, b) => a.date.localeCompare(b.date));
    }
  }
</script>

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
    {#if withWeight}
      <label>
        <span class="label">Weight ({weightUnit(sys)})</span>
        <NumInput
          value={weightToday ? Math.round(kgToShown(weightToday.kg, sys) * 10) / 10 : null}
          label="Weight in {weightUnit(sys)}"
          onchange={setWeight}
        />
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

  {#if !short}
    <div class="row">
      <span class="label">Vitamin and mineral goals from</span>
      <div class="seg" role="radiogroup" aria-label="Reference values">
        <button role="radio" aria-checked={prof.standard === 'eu'} onclick={() => (prof.standard = 'eu')}>EU (EFSA)</button>
        <button role="radio" aria-checked={prof.standard === 'us'} onclick={() => (prof.standard = 'us')}>US</button>
      </div>
    </div>
  {/if}
</div>

<style>
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
</style>
