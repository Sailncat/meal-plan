<script lang="ts" module>
  export interface PickItem {
    value: string;
    label: string;
    sub?: string;
  }
  export interface PickGroup {
    label: string;
    items: PickItem[];
  }
</script>

<script lang="ts">
  import { fold } from '../lib/num';

  interface Props {
    open: boolean;
    title: string;
    groups: PickGroup[];
    empty?: string;
    onpick: (value: string) => void;
  }
  let { open = $bindable(false), title, groups, empty = 'Nothing to pick yet.', onpick }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let search: HTMLInputElement | undefined = $state();
  let q = $state('');

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      q = '';
      dialog.showModal();
      // Only jump into the search box with a mouse; on phones the keyboard would cover the list.
      if (window.matchMedia('(pointer: fine)').matches) setTimeout(() => search?.focus(), 20);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  const filtered = $derived.by(() => {
    const f = fold(q.trim());
    return groups.map((g) => ({ ...g, items: f ? g.items.filter((i) => fold(i.label).includes(f)) : g.items })).filter((g) => g.items.length);
  });
  const total = $derived(groups.reduce((t, g) => t + g.items.length, 0));
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  aria-label={title}
  onclose={() => (open = false)}
  onclick={(e) => {
    if (e.target === dialog) open = false;
  }}
>
  <div class="inner">
    <div class="head">
      <h2>{title}</h2>
      <button class="icon-btn" onclick={() => (open = false)} aria-label="Close">×</button>
    </div>
    {#if total}
      <input class="field" type="search" placeholder="Search" aria-label="Search" bind:value={q} bind:this={search} />
    {/if}
    <div class="list">
      {#each filtered as g (g.label)}
        <h3>{g.label}</h3>
        {#each g.items as it (it.value)}
          <button
            class="item"
            onclick={() => {
              onpick(it.value);
              open = false;
            }}
          >
            <span>{it.label}</span>
            {#if it.sub}<small>{it.sub}</small>{/if}
          </button>
        {/each}
      {/each}
      {#if !total}
        <p class="note">{empty}</p>
      {:else if !filtered.length}
        <p class="note">Nothing matches “{q}”.</p>
      {/if}
    </div>
  </div>
</dialog>

<style>
  .sheet {
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 0.75rem 0.75rem 0 0;
    background: var(--surface);
    color: var(--ink);
    width: 100%;
    max-width: 34rem;
    max-height: min(80dvh, 40rem);
    margin: auto auto 0;
    box-shadow: var(--shadow);
  }
  @media (min-width: 40rem) {
    .sheet {
      border-radius: 0.75rem;
      margin: auto;
    }
  }
  .sheet::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }
  .inner {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.9rem 0.9rem calc(0.9rem + var(--safe-b));
    max-height: inherit;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    font-family: var(--display);
    font-size: 1.4rem;
  }
  .list {
    overflow-y: auto;
    min-height: 8rem;
    margin: 0 -0.3rem;
    padding: 0 0.3rem;
  }
  h3 {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0.6rem 0 0.25rem;
  }
  .item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem 0.6rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .item:hover,
  .item:focus-visible {
    background: var(--pale);
  }
  .item small {
    color: var(--muted);
    white-space: nowrap;
  }
</style>
