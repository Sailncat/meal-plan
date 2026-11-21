<script lang="ts">
  import { readBackup } from '../lib/backup';
  import { PlanFormatError } from '../lib/migrate';
  import { replacePlan, showToast, startEmpty } from '../lib/store.svelte';

  let fileInput: HTMLInputElement | undefined = $state();
  let error = $state('');

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
  <div class="actions">
    <button class="btn primary" onclick={startEmpty}>Start an empty plan</button>
    <button class="btn" onclick={() => fileInput?.click()}>Load a backup file</button>
    <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={load} />
  </div>
  {#if error}<p class="err" role="alert">{error}</p>{/if}
  <p class="note">Everything stays on this device. Nothing is sent anywhere.</p>
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
</style>
