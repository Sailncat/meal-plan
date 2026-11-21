<script lang="ts">
  import { bandStatus } from '../lib/calc';
  import { fmt0 } from '../lib/num';

  interface Props {
    name: string;
    value: number;
    unit: string;
    low: number;
    high: number;
  }
  let { name, value, unit, low, high }: Props = $props();

  const max = $derived(Math.max(high * 1.3, value * 1.1, 1));
  const pct = (x: number) => Math.max(0, Math.min(100, (x / max) * 100));
  const status = $derived(bandStatus(value, low, high));
  const note = $derived(
    status === 'under' ? `${fmt0(low - value)} ${unit} below target` : status === 'over' ? `${fmt0(value - high)} ${unit} over target` : 'On target',
  );
</script>

<div class="gauge">
  <div class="head">
    <span class="name">{name}</span>
    <span class="value tabular">{fmt0(value)}<small>{unit}</small></span>
  </div>
  <div class="track" role="img" aria-label="{name}: {fmt0(value)} {unit}, target {fmt0(low)} to {fmt0(high)}">
    <div class="band" style:left="{pct(low)}%" style:width="{pct(high) - pct(low)}%"></div>
    <div class="fill {status}" style:width="{pct(value)}%"></div>
  </div>
  <div class="foot"><span class={status}>{note}</span> <span class="muted">· target {fmt0(low)}–{fmt0(high)}</span></div>
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
  .fill {
    position: absolute;
    left: 0;
    top: 0.18rem;
    bottom: 0.18rem;
    border-radius: 0.3rem;
    transition: width 0.35s ease;
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
  .foot {
    font-size: 0.85rem;
  }
  .foot .ok {
    color: var(--ok);
  }
</style>
