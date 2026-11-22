<script lang="ts">
  import { hideToast, runUndo, toast } from '../lib/store.svelte';
</script>

<div class="toast-wrap" aria-live="polite">
  {#if toast.msg}
    {#key toast.key}
      <div class="toast" role="status">
        <span>{toast.msg}</span>
        {#if toast.canUndo}
          <button class="undo" onclick={runUndo}>Undo</button>
        {/if}
        <button class="close" onclick={hideToast} aria-label="Dismiss">×</button>
      </div>
    {/key}
  {/if}
</div>

<style>
  .toast-wrap {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--nav-h) + var(--safe-b) + 0.75rem);
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 30;
    padding: 0 0.75rem;
  }
  @media (min-width: 52rem) {
    .toast-wrap {
      bottom: 1.25rem;
    }
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 32rem;
    padding: 0.5rem 0.5rem 0.5rem 0.9rem;
    border-radius: 0.6rem;
    background: var(--ink);
    color: var(--bg);
    box-shadow: var(--shadow);
    animation: rise 0.2s ease-out;
  }
  .toast span {
    flex: 1;
  }
  .undo {
    border: 0;
    background: transparent;
    color: var(--pick);
    font-weight: 700;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    border-radius: 0.35rem;
  }
  :global(:root[data-mode='dark']) .undo {
    color: var(--bar);
  }
  .close {
    border: 0;
    background: transparent;
    color: inherit;
    opacity: 0.7;
    font-size: 1.2rem;
    width: 2rem;
    height: 2rem;
    cursor: pointer;
  }
  @keyframes rise {
    from {
      transform: translateY(0.5rem);
      opacity: 0;
    }
  }
</style>
