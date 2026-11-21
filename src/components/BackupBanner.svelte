<script lang="ts">
  import { backupReminder, exportBackup, snoozeBackup } from '../lib/backup';
  import { showToast, store } from '../lib/store.svelte';

  const days = $derived(store.plan ? backupReminder(store.plan) : null);
</script>

{#if days != null && store.plan}
  <div class="banner" role="region" aria-label="Backup reminder">
    <p>
      {#if days === Infinity}
        Your plan only lives on this device. Save a backup file so you can't lose it.
      {:else}
        Your last backup was {days} days ago.
      {/if}
    </p>
    <div class="actions">
      <button
        class="btn primary small"
        onclick={() => {
          exportBackup(store.plan!);
          showToast('Backup saved to your downloads');
        }}>Back up now</button
      >
      <button class="btn ghost small" onclick={() => snoozeBackup(store.plan!)}>Later</button>
    </div>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.9rem;
    border: 1px solid var(--band-edge);
    border-radius: 0.5rem;
    background: var(--band);
  }
  p {
    margin: 0;
    flex: 1 1 14rem;
    font-size: 0.92rem;
  }
</style>
