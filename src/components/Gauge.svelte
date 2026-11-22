<script lang="ts">
  import { bandStatus } from '../lib/calc';
  import { fmt0, fmt1 } from '../lib/num';
  import type { GaugeKind } from '../lib/gauges';

  interface Props {
    name: string;
    value: number;
    unit: string;
    low: number;
    high: number;
    /** range: land between low and high. min: reach low, more is fine. max: stay under high. */
    kind?: GaugeKind;
    /** Going over the top of the band is fine (protein), so it isn't shown as a warning. */
    overOk?: boolean;
    /** How much of it was ticked off as eaten; shown as a second, solid bar inside the planned one. */
    eaten?: number | null;
  }
  let { name, value, unit, low, high, kind = 'range', overOk = false, eaten = null }: Props = $props();

  const top = $derived(kind === 'min' ? low : high);
  const max = $derived(Math.max(top * 1.3, value * 1.1, 1));
  const pct = (x: number) => Math.max(0, Math.min(100, (x / max) * 100));
  // Small targets like salt (5 g) need a decimal to mean anything.
  const fmt = (x: number) => (top < 15 ? fmt1(x) : fmt0(x));
  const raw = $derived(
    kind === 'min' ? (value < low ? 'under' : 'ok') : kind === 'max' ? (value > high ? 'over' : 'ok') : bandStatus(value, low, high),
  );
  const status = $derived(raw === 'over' && overOk ? 'above' : raw);
  const note = $derived.by(() => {
    if (kind === 'min') return status === 'under' ? `${fmt(low - value)} ${unit} below goal` : 'Goal reached';
    if (kind === 'max') return status === 'over' ? `${fmt(value - high)} ${unit} over the limit` : 'Under the limit';
    return status === 'under'
      ? `${fmt(low - value)} ${unit} below target`
      : status === 'over'
        ? `${fmt(value - high)} ${unit} over target`
        : status === 'above'
          ? `${fmt(value - high)} ${unit} above target`
          : 'On target';
  });
  const target = $derived(kind === 'min' ? `goal ${fmt(low)}+` : kind === 'max' ? `limit ${fmt(high)}` : `target ${fmt(low)}–${fmt(high)}`);
  const band = $derived(
    kind === 'min' ? { left: pct(low), width: 100 - pct(low) } : kind === 'max' ? { left: 0, width: pct(high) } : { left: pct(low), width: pct(high) - pct(low) },
  );
</script>

<div class="gauge">
  <div class="head">
    <span class="name">{name}</span>
    <span class="value tabular">{fmt(value)}<small>{unit}</small></span>
  </div>
  <div class="track" role="img" aria-label="{name}: {fmt(value)} {unit}, {target} {unit}">
    <div class="band" class:open-end={kind === 'min'} class:open-start={kind === 'max'} style:left="{band.left}%" style:width="{band.width}%"></div>
    <div class="fill {status}" class:dim={eaten != null} style:width="{pct(value)}%"></div>
    {#if eaten != null}<div class="eaten" style:width="{pct(eaten)}%"></div>{/if}
  </div>
  <div class="foot">
    {#if eaten != null}<span class="eaten-text tabular">{fmt(eaten)} {unit} eaten</span> <span class="muted">·</span>{/if}
    <span class={status}>{note}</span>
    <span class="muted">· {target}</span>
  </div>
</div>

<style>
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .name {
    font-weight: 600;
    color: var(--muted);
  }
  .value {
    font-family: var(--display);
    font-weight: 700;
    font-size: 1.75rem;
    line-height: 1;
  }
  .value small {
    font-family: var(--body);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--muted);
    margin-left: 0.2rem;
  }
  .track {
    position: relative;
    height: 0.8rem;
    background: var(--track);
    border-radius: 0.4rem;
    margin: 0.4rem 0 0.3rem;
    overflow: hidden;
  }
  .band {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--band);
    border-left: 2px solid var(--band-edge);
    border-right: 2px solid var(--band-edge);
  }
  .band.open-end {
    border-right: 0;
  }
  .band.open-start {
    border-left: 0;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0.18rem;
    bottom: 0.18rem;
    border-radius: 0.3rem;
    transition: width 0.35s ease;
  }
  .fill.dim {
    opacity: 0.45;
  }
  .eaten {
    position: absolute;
    left: 0;
    top: 0.3rem;
    bottom: 0.3rem;
    border-radius: 0.2rem;
    background: var(--ink);
    transition: width 0.35s ease;
  }
  .eaten-text {
    font-weight: 600;
  }
  .fill.ok {
    background: var(--ok);
  }
  .fill.over {
    background: var(--over);
  }
  .fill.under {
    background: var(--under);
  }
  .fill.above {
    background: var(--ok);
  }
  .foot .above {
    color: var(--muted);
  }
  .foot {
    font-size: 0.85rem;
  }
  .foot .ok {
    color: var(--ok);
  }
  :global(:root[data-density='compact']) .value {
    font-size: 1.4rem;
  }
  :global(:root[data-density='compact']) .track {
    height: 0.65rem;
    margin: 0.25rem 0 0.2rem;
  }
  :global(:root[data-density='compact']) .foot {
    font-size: 0.8rem;
  }
</style>
