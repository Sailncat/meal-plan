<script lang="ts">
  import { readBackup } from '../lib/backup';
  import { PlanFormatError } from '../lib/migrate';
  import { replacePlan, showToast, startEmpty, store, ui } from '../lib/store.svelte';
  import { loadBasic } from '../lib/basicFoods';
  import { addSamples } from '../lib/samples';

  let fileInput: HTMLInputElement | undefined = $state();
  let error = $state('');

  /** A new plan: first-run setup, and sample recipes so it doesn't start empty. */
  async function begin() {
    startEmpty();
    ui.setup = true;
    try {
      const basic = await loadBasic();
      if (store.plan && !store.plan.recipes.length) addSamples(store.plan, basic);
    } catch {
      // No sample recipes if the food list can't load; the plan works the same without them.
    }
  }

  async function load(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      replacePlan(await readBackup(file));
      showToast('Your plan is loaded');
    } catch (err) {
      error = err instanceof PlanFormatError ? err.message : 'Couldn’t read that file.';
    }
  }
</script>

<div class="welcome card">
  <img src="./icon.svg" alt="" width="72" height="72" />
  <h1>Plan your week of meals</h1>
  <p>Build recipes from your own foods, put them in your days, and see your calories, protein and nutrients add up.</p>
  {#if ui.shared}
    <p class="shared"><b>Someone shared a recipe with you.</b> Start a plan or load your backup, and you can add it straight after.</p>
  {/if}
  <div class="actions">
    <button class="btn primary" onclick={begin}>Start a new plan</button>
    <button class="btn" onclick={() => fileInput?.click()}>Load a backup file</button>
    <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={load} />
  </div>
  {#if error}<p class="err" role="alert">{error}</p>{/if}
  <p class="note">Your plan stays on this device. There’s no account.</p>
</div>

<style>
  .welcome {
    max-width: 30rem;
    margin: 2rem auto;
    padding: 2rem 1.25rem;
    text-align: center;
    display: grid;
    justify-items: center;
    gap: 0.75rem;
  }
  img {
    border-radius: 1rem;
  }
  h1 {
    font-family: var(--display);
    font-size: 2rem;
    line-height: 1.1;
  }
  p {
    margin: 0;
  }
  .actions {
    justify-content: center;
    margin-top: 0.5rem;
  }
  .err {
    color: var(--over);
    font-weight: 600;
  }
  .shared {
    padding: 0.6rem 0.8rem;
    border-radius: 0.5rem;
    background: var(--pick);
    color: var(--pick-ink);
  }
</style>
