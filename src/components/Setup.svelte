<script lang="ts">
  // First-run setup for a new plan: units, then the profile, then the targets it gives.
  // Every step can be skipped; the same settings live on the Me tab and in Settings.
  import { onMount } from 'svelte';
  import { store, ui } from '../lib/store.svelte';
  import { profileGaps, targetsInUse } from '../lib/targets';
  import { E, EU } from '../lib/display';
  import { fmt0 } from '../lib/num';
  import ProfileForm from './ProfileForm.svelte';

  const plan = $derived(store.plan!);
  const st = $derived(plan.settings);
  let dialog: HTMLDialogElement | undefined = $state();
  let step = $state(0);
  const STEPS = ['Units', 'About you', 'Your targets'];

  const latest = $derived(plan.weights.at(-1)?.kg ?? null);
  const gaps = $derived(profileGaps(plan.profile, latest));
  const use = $derived(targetsInUse(plan));
  const rows = $derived([
    { name: EU() === 'kJ' ? 'Energy' : 'Calories', r: use.targets.kcal, show: E, unit: EU() },
    { name: 'Protein', r: use.targets.protein, show: (n: number) => n, unit: 'g' },
    { name: 'Carbs', r: use.targets.carbs, show: (n: number) => n, unit: 'g' },
    { name: 'Fat', r: use.targets.fat, show: (n: number) => n, unit: 'g' },
  ]);

  onMount(() => dialog?.showModal());

  function done() {
    dialog?.close();
    ui.setup = false;
    location.hash = '#plan';
  }
</script>

<dialog bind:this={dialog} class="sheet" aria-labelledby="setup-h" oncancel={(e) => (e.preventDefault(), done())}>
  <div class="inner">
    <div class="steps" aria-hidden="true">
      {#each STEPS as s, i (s)}<span class:on={i <= step}></span>{/each}
    </div>
    <p class="count">Step {step + 1} of {STEPS.length}</p>

    <div class="body">
      {#if step === 0}
        <h2 id="setup-h">Welcome</h2>
        <p>Three quick steps to set your daily targets. You can skip any of it and fill it in later on the Me tab.</p>
        <div class="row">
          <span class="label">Measurements</span>
          <div class="seg" role="radiogroup" aria-label="Measurements">
            <button role="radio" aria-checked={st.system === 'metric'} onclick={() => (st.system = 'metric')}>Metric<small>g · ml · kg · cm</small></button>
            <button role="radio" aria-checked={st.system === 'imperial'} onclick={() => (st.system = 'imperial')}>US<small>oz · lb · ft · in</small></button>
          </div>
        </div>
        <div class="row">
          <span class="label">Energy</span>
          <div class="seg" role="radiogroup" aria-label="Energy">
            <button role="radio" aria-checked={st.energy === 'kcal'} onclick={() => (st.energy = 'kcal')}>Calories<small>kcal</small></button>
            <button role="radio" aria-checked={st.energy === 'kJ'} onclick={() => (st.energy = 'kJ')}>Kilojoules<small>kJ</small></button>
          </div>
        </div>
      {:else if step === 1}
        <h2 id="setup-h">About you</h2>
        <p>Used only to work out your targets, and kept on this device.</p>
        <ProfileForm withWeight short />
        {#if gaps.includes('under18')}
          <p class="warn">This app works out targets for adults only. For anyone under 18, it's best to plan targets with a doctor or dietitian.</p>
        {/if}
      {:else}
        <h2 id="setup-h">Your daily targets</h2>
        {#if use.worked}
          <p>Worked out from what you filled in. You can change any of them on the Me tab.</p>
        {:else}
          <p>
            These are general targets for now. Fill in your {gaps
              .filter((g) => g !== 'under18')
              .join(', ')
              .replace(/, ([^,]*)$/, ' and $1')} on the Me tab to get ones that fit you.
          </p>
        {/if}
        <div class="targets">
          {#each rows as t (t.name)}
            <div class="t"><span>{t.name}</span><b class="tabular">{fmt0(t.show(t.r.low))}–{fmt0(t.show(t.r.high))} {t.unit}</b></div>
          {/each}
        </div>
        {#if plan.recipes.length}
          <p class="note">
            There are {plan.recipes.length} sample recipes in the Recipes tab to get you started. Change them or delete them as you like.
          </p>
        {/if}
        <p class="note">Next: pick a day on the Plan tab and add your meals.</p>
      {/if}
    </div>

    <div class="foot">
      {#if step > 0}<button class="btn" onclick={() => step--}>Back</button>{/if}
      {#if step < STEPS.length - 1}
        <button class="btn primary" onclick={() => step++}>Next</button>
        <button class="btn ghost skip" onclick={done}>Skip setup</button>
      {:else}
        <button class="btn primary" onclick={done}>Start planning</button>
      {/if}
    </div>
  </div>
</dialog>

<style>
  .sheet {
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
    color: var(--ink);
    width: min(34rem, calc(100% - 1.5rem));
    max-height: 92dvh;
    box-shadow: var(--shadow);
  }
  .sheet::backdrop {
    background: rgba(0, 0, 0, 0.55);
  }
  .inner {
    display: flex;
    flex-direction: column;
    max-height: 92dvh;
    padding: 1rem 1.1rem 0.9rem;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.3rem;
  }
  .steps span {
    height: 0.3rem;
    border-radius: 0.2rem;
    background: var(--track);
  }
  .steps span.on {
    background: var(--bar);
  }
  .count {
    margin: 0.4rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
    font-weight: 600;
  }
  .body {
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 0.8rem;
    padding: 0.2rem 0 0.6rem;
  }
  h2 {
    font-family: var(--display);
    font-size: 1.6rem;
    margin: 0;
  }
  .body > p {
    margin: 0;
    line-height: 1.5;
  }
  .row {
    display: grid;
    gap: 0.3rem;
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
    padding: 0.3rem 0.6rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    font-weight: 600;
    cursor: pointer;
  }
  .seg small {
    font-weight: 400;
    font-size: 0.75rem;
    opacity: 0.8;
  }
  .seg button[aria-checked='true'] {
    background: var(--bar);
    color: var(--bar-ink);
  }
  .targets {
    display: grid;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }
  .t {
    display: flex;
    justify-content: space-between;
    padding: 0.55rem 0.75rem;
    border-top: 1px solid var(--line);
  }
  .t:first-child {
    border-top: 0;
  }
  .warn {
    color: var(--over);
  }
  .foot {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
  }
  .skip {
    margin-left: auto;
  }
</style>
