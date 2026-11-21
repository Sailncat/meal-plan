<script lang="ts">
  import { exportBackup, readBackup } from '../lib/backup';
  import { PlanFormatError, toPlan } from '../lib/migrate';
  import { uid } from '../lib/num';
  import { showToast, store, undoable } from '../lib/store.svelte';
  import NumInput from '../components/NumInput.svelte';

  const plan = $derived(store.plan!);
  let fileInput: HTMLInputElement | undefined = $state();

  const lastBackup = $derived(
    plan.meta.lastBackup
      ? new Date(plan.meta.lastBackup).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null,
  );

  // ---------- meals ----------
  function addSlot() {
    const id = uid();
    plan.slots.push({ id, name: '' });
    for (const d of plan.week) d.meals[id] = [];
    queueMicrotask(() => document.querySelector<HTMLInputElement>(`#slot-name-${id}`)?.focus());
  }
  function moveSlot(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= plan.slots.length) return;
    const [s] = plan.slots.splice(i, 1);
    plan.slots.splice(j, 0, s);
  }
  function removeSlot(i: number) {
    const s = plan.slots[i];
    const count = plan.week.reduce((t, d) => t + (d.meals[s.id]?.length ?? 0), 0);
    undoable(`Removed ${s.name || 'the meal'}${count ? ` and the ${count} thing${count === 1 ? '' : 's'} in it` : ''}`, (p) => {
      p.slots.splice(i, 1);
      for (const d of p.week) delete d.meals[s.id];
    });
  }

  // ---------- backup ----------
  function backUp() {
    exportBackup(plan);
    showToast('Backup saved to your downloads');
  }
  async function restore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const incoming = await readBackup(file);
      const before = JSON.stringify(store.plan);
      store.plan = incoming;
      showToast(`Loaded ${file.name}`, () => {
        store.plan = toPlan(JSON.parse(before));
      });
    } catch (err) {
      showToast(err instanceof PlanFormatError ? err.message : 'Couldn’t read that file.');
    }
  }

  function clearWeek() {
    undoable('Cleared the week', (p) => {
      for (const d of p.week) {
        for (const k of Object.keys(d.meals)) d.meals[k] = [];
        d.supps = [];
      }
    });
  }
</script>

<h1 class="page-title">Settings</h1>

<h2 class="bar">Meals</h2>
<div class="panel pad">
  <p class="note top">The meals in your day, in order. Rename them, move them, or add your own, like Pre-workout or Shakes.</p>
  <ul class="slots">
    {#each plan.slots as slot, i (slot.id)}
      <li>
        <input class="field" id="slot-name-{slot.id}" bind:value={slot.name} placeholder="Meal name" aria-label="Meal {i + 1} name" />
        <button class="icon-btn" aria-label="Move {slot.name || 'meal'} up" disabled={i === 0} onclick={() => moveSlot(i, -1)}>↑</button>
        <button class="icon-btn" aria-label="Move {slot.name || 'meal'} down" disabled={i === plan.slots.length - 1} onclick={() => moveSlot(i, 1)}
          >↓</button
        >
        <button class="icon-btn x" aria-label="Remove {slot.name || 'meal'}" disabled={plan.slots.length === 1} onclick={() => removeSlot(i)}>×</button>
      </li>
    {/each}
  </ul>
  <button class="btn small" onclick={addSlot}>+ Add a meal</button>
</div>

<h2 class="bar">Daily targets</h2>
<div class="panel pad">
  <div class="targets">
    <span></span><span class="label">Low</span><span class="label">High</span>
    <span>Calories (kcal)</span>
    <NumInput value={plan.targets.kcalLow} label="Lowest daily calories" onchange={(v) => (plan.targets.kcalLow = v ?? 0)} />
    <NumInput value={plan.targets.kcalHigh} label="Highest daily calories" onchange={(v) => (plan.targets.kcalHigh = v ?? 0)} />
    <span>Protein (g)</span>
    <NumInput value={plan.targets.proteinLow} label="Lowest daily protein" onchange={(v) => (plan.targets.proteinLow = v ?? 0)} />
    <NumInput value={plan.targets.proteinHigh} label="Highest daily protein" onchange={(v) => (plan.targets.proteinHigh = v ?? 0)} />
  </div>
  <p class="note">A day's calories show green inside this range, red above it and gold below. Protein shows gold below your low target.</p>
</div>

<h2 class="bar">Backup</h2>
<div class="panel pad">
  <p class="note top">
    Your plan is saved on this device only. A backup file keeps it safe if the browser's data gets cleared, and moves it to another
    phone or computer.
  </p>
  <p class="last">{lastBackup ? `Last backup: ${lastBackup}` : 'No backup yet.'}</p>
  <div class="actions">
    <button class="btn primary" onclick={backUp}>Save a backup file</button>
    <button class="btn" onclick={() => fileInput?.click()}>Load a backup file</button>
    <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={restore} />
  </div>
  <p class="note">Loading a file replaces the plan on this device. Files from the old Claude meal plan work too.</p>
</div>

<h2 class="bar">Week</h2>
<div class="panel pad">
  <p class="note top">Empties every meal and supplement for all seven days. Your recipes and foods stay.</p>
  <button class="btn danger" onclick={clearWeek}>Clear the week</button>
</div>

<h2 class="bar">About</h2>
<div class="panel pad about">
  <p>Meal plan · test build</p>
  <p class="note">
    {#if store.storage === 'memory'}
      This browser won't let the app save, so changes are lost when you close it. Save a backup file before you go.
    {:else}
      Everything is stored on this device. Nothing is sent anywhere.
    {/if}
  </p>
</div>

<style>
  .pad {
    padding: 0.85rem;
  }
  .top {
    margin-top: 0;
    margin-bottom: 0.75rem;
  }
  .slots {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .slots li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .slots .field {
    flex: 1;
    font-weight: 600;
  }
  .targets {
    display: grid;
    grid-template-columns: auto minmax(0, 7rem) minmax(0, 7rem);
    gap: 0.5rem 0.75rem;
    align-items: center;
    max-width: 26rem;
  }
  .last {
    font-weight: 600;
    margin: 0 0 0.6rem;
  }
  .about p:first-child {
    margin: 0;
    font-weight: 600;
  }
</style>
