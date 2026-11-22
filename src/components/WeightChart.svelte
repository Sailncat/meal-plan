<script lang="ts">
  // Weight over time, drawn at the real width of its box so text never stretches.
  import type { WeightEntry } from '../lib/types';
  import { kgToShown, weightUnit } from '../lib/units';
  import { shortDate } from '../lib/dates';

  interface Props {
    weights: WeightEntry[];
    system: 'metric' | 'imperial';
  }
  let { weights, system }: Props = $props();

  let width = $state(320);
  const H = 150;
  const pad = { l: 40, r: 12, t: 12, b: 24 };

  // The last three months.
  const shown = $derived.by(() => {
    if (!weights.length) return [];
    const last = Date.parse(weights.at(-1)!.date);
    return weights.filter((w) => last - Date.parse(w.date) <= 90 * 864e5);
  });
  const pts = $derived(shown.map((w) => ({ t: Date.parse(w.date), v: kgToShown(w.kg, system), date: w.date })));
  const scale = $derived.by(() => {
    const ts = pts.map((p) => p.t);
    const vs = pts.map((p) => p.v);
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    const lo = Math.floor(Math.min(...vs) - 1);
    const hi = Math.ceil(Math.max(...vs) + 1);
    const x = (t: number) => (t1 === t0 ? (pad.l + width - pad.r) / 2 : pad.l + ((t - t0) / (t1 - t0)) * (width - pad.l - pad.r));
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    return { x, y, lo, hi };
  });
  const line = $derived(pts.map((p, i) => `${i ? 'L' : 'M'}${scale.x(p.t).toFixed(1)} ${scale.y(p.v).toFixed(1)}`).join(''));
  const unit = $derived(weightUnit(system));
  const label = $derived(
    pts.length > 1
      ? `Weight from ${shortDate(pts[0].date)} to ${shortDate(pts.at(-1)!.date)}: ${pts[0].v.toFixed(1)} to ${pts.at(-1)!.v.toFixed(1)} ${unit}`
      : 'Weight chart',
  );
</script>

<div class="chart" bind:clientWidth={width}>
  {#if pts.length > 1}
    <svg {width} height={H} role="img" aria-label={label}>
      <g class="grid">
        <line x1={pad.l} x2={width - pad.r} y1={scale.y(scale.hi)} y2={scale.y(scale.hi)} />
        <line x1={pad.l} x2={width - pad.r} y1={scale.y(scale.lo)} y2={scale.y(scale.lo)} />
      </g>
      <text class="tick" x={pad.l - 6} y={scale.y(scale.hi) + 4} text-anchor="end">{scale.hi}</text>
      <text class="tick" x={pad.l - 6} y={scale.y(scale.lo) + 4} text-anchor="end">{scale.lo}</text>
      <text class="tick" x={pad.l} y={H - 6}>{shortDate(pts[0].date)}</text>
      <text class="tick" x={width - pad.r} y={H - 6} text-anchor="end">{shortDate(pts.at(-1)!.date)}</text>
      <path class="line" d={line} />
      {#each pts as p (p.date)}
        <circle cx={scale.x(p.t)} cy={scale.y(p.v)} r={p === pts.at(-1) ? 4.5 : 3} class:last={p === pts.at(-1)} />
      {/each}
    </svg>
  {:else}
    <p class="note empty">Log your weight on a few different days to see the trend here.</p>
  {/if}
</div>

<style>
  .chart {
    width: 100%;
    min-height: 3rem;
  }
  svg {
    display: block;
  }
  .grid line {
    stroke: var(--line);
    stroke-dasharray: 3 4;
  }
  .tick {
    font-size: 11px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .line {
    fill: none;
    stroke: var(--bar);
    stroke-width: 2.25;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  circle {
    fill: var(--surface);
    stroke: var(--bar);
    stroke-width: 2;
  }
  circle.last {
    fill: var(--bar);
  }
  :global(:root[data-mode='dark']) .line,
  :global(:root[data-mode='dark']) circle {
    stroke: var(--bar-ink);
  }
  :global(:root[data-mode='dark']) circle.last {
    fill: var(--bar-ink);
  }
  .empty {
    margin: 0;
  }
</style>
