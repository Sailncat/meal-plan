<script lang="ts">
  import type { FoodDraft } from '../lib/foods';
  import { NUTRIENTS } from '../lib/nutrients';
  import { fmtN } from '../lib/num';
  import { E, EU, fromE, system } from '../lib/display';
  import { baseUnitLabel, toShown } from '../lib/units';
  import NumInput from './NumInput.svelte';

  interface Props {
    draft: FoodDraft;
    /** Text for the main button, like "Add to Breakfast". */
    action: string;
    onadd: (draft: FoodDraft, name: string) => void;
    onback: () => void;
  }
  let { draft = $bindable(), action, onadd, onback }: Props = $props();

  let name = $state(draft.name);
  const MAIN: [string, string][] = [
    ['protein', 'Protein'],
    ['carbs', 'Carbs'],
    ['fat', 'Fat'],
    ['satfat', 'of which saturates'],
    ['sugar', 'of which sugars'],
    ['fibre', 'Fibre'],
    ['salt', 'Salt'],
  ];
  const MAIN_KEYS = new Set(['kcal', ...MAIN.map(([k]) => k)]);
  const extra = $derived(NUTRIENTS.filter((n) => !MAIN_KEYS.has(n.k) && draft.nut[n.k] != null));
  const missing = $derived(['kcal', 'protein', 'carbs', 'fat'].filter((k) => draft.nut[k] == null));
  const from = $derived(draft.source?.db === 'off' ? 'Open Food Facts' : 'USDA basic foods');

  function set(k: string, v: number | null) {
    if (v == null) delete draft.nut[k];
    else draft.nut[k] = v;
  }

  function portionText(p: { name: string; size: number }) {
    const sys = system();
    const shown = toShown(draft.unit, p.size, sys);
    return `${p.name} = ${fmtN(shown)} ${baseUnitLabel(draft.unit, sys, shown)}`;
  }
</script>

<div class="check">
  <button class="btn ghost small back" onclick={onback}>‹ Back</button>
  {#if draft.source}
    <h3 class="title">Check it before adding</h3>
    <p class="src">
      From {from}{#if draft.source.db === 'off'} · barcode {draft.source.id}{/if}{#if draft.quantity} · pack {draft.quantity}{/if} ·
      <a href={draft.url} target="_blank" rel="noopener">see the original ↗</a>
    </p>
  {:else}
    <h3 class="title">Type it in from the label</h3>
    {#if draft.barcode}<p class="src">Barcode {draft.barcode}</p>{/if}
  {/if}

  <label class="nm">
    <span class="label">Name in your foods</span>
    <input class="field" bind:value={name} placeholder="e.g. Skyr natural" />
  </label>

  <div class="per">
    <span class="label">Values per 100</span>
    <div class="seg" role="radiogroup" aria-label="Measured in">
      <button role="radio" aria-checked={draft.unit === 'g'} onclick={() => (draft.unit = 'g')}>g</button>
      <button role="radio" aria-checked={draft.unit === 'ml'} onclick={() => (draft.unit = 'ml')}>ml</button>
    </div>
  </div>

  <div class="vals">
    <label class:missing={draft.nut.kcal == null}>
      <span>{EU() === 'kJ' ? 'Energy' : 'Calories'} ({EU()})</span>
      <NumInput
        value={draft.nut.kcal != null ? E(draft.nut.kcal) : null}
        label="{EU()} per 100"
        placeholder="missing"
        onchange={(v) => set('kcal', v == null ? null : fromE(v))}
      />
    </label>
    {#each MAIN as [k, l] (k)}
      <label class:missing={draft.nut[k] == null} class:sub={l.startsWith('of which')}>
        <span>{l} (g)</span>
        <NumInput value={draft.nut[k] ?? null} label="{l} per 100" placeholder="missing" onchange={(v) => set(k, v)} />
      </label>
    {/each}
  </div>
  {#if extra.length}
    <p class="note">Plus {extra.length} vitamins and minerals: {extra.map((n) => n.s ?? n.l).join(', ')}.</p>
  {/if}
  {#if !draft.source}
    <p class="note">Copy the “per 100 g” column. You can add vitamins and ways to count it on the Foods tab later.</p>
  {:else if missing.length}
    <p class="note warn">
      {missing.length === 4 ? 'This has no nutrition values.' : 'Some main values are missing.'} Fill them in from the label, or they count as zero.
    </p>
  {:else}
    <p class="note">Databases get things wrong now and then, so a quick look against the label is worth it.</p>
  {/if}

  {#if draft.portions.length}
    <section class="ways">
      <span class="label">Ways to count it</span>
      {#each draft.portions as p, i (i)}
        <div class="way">
          <span>1 {portionText(p)}</span>
          <button class="icon-btn x" aria-label="Remove {p.name}" onclick={() => {
            draft.portions.splice(i, 1);
            if (draft.countBy === i) draft.countBy = null;
            else if (draft.countBy != null && draft.countBy > i) draft.countBy--;
          }}>×</button>
        </div>
      {/each}
      <label class="start">
        <span class="label">New amounts start in</span>
        <select class="field" value={draft.countBy == null ? '' : String(draft.countBy)} onchange={(e) => (draft.countBy = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}>
          <option value="">{baseUnitLabel(draft.unit, system(), 2)}</option>
          {#each draft.portions as p, i (i)}
            <option value={String(i)}>{p.name}</option>
          {/each}
        </select>
      </label>
    </section>
  {/if}

  <div class="foot">
    <button class="btn primary" disabled={!name.trim()} onclick={() => onadd(draft, name)}>{action}</button>
    <button class="btn" onclick={onback}>Cancel</button>
  </div>
</div>

<style>
  .check {
    display: grid;
    gap: 0.6rem;
  }
  .back {
    justify-self: start;
    margin-left: -0.6rem;
  }
  .title {
    font-family: var(--display);
    font-size: 1.25rem;
    margin: 0;
  }
  .src {
    margin: -0.3rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .src a {
    color: inherit;
  }
  .per {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .per .label {
    margin: 0;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 0.4rem;
    overflow: hidden;
  }
  .seg button {
    min-width: 2.75rem;
    min-height: 2rem;
    border: 0;
    background: var(--surface);
    font-weight: 600;
    cursor: pointer;
  }
  .seg button[aria-checked='true'] {
    background: var(--bar);
    color: var(--bar-ink);
  }
  .vals {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.35rem 0.75rem;
  }
  .vals label {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 5.5rem;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }
  .vals label.sub span {
    color: var(--muted);
    padding-left: 0.6rem;
  }
  .vals label.missing :global(input) {
    border-color: var(--under);
    border-style: dashed;
  }
  .warn {
    color: var(--under);
  }
  .ways {
    display: grid;
    gap: 0.25rem;
  }
  .way {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.1rem 0 0.1rem 0.2rem;
    border-bottom: 1px solid var(--line);
  }
  .start {
    margin-top: 0.4rem;
  }
  .foot {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding-top: 0.3rem;
  }
</style>
