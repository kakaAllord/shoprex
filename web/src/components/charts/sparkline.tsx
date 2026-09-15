import { cn } from '@/lib/utils';

/**
 * The shape of a run of days, under the figure it belongs to.
 *
 * No axes, no labels, no grid: a sparkline is punctuation, not a chart. The
 * number above it says how much; this says whether that is normal. Anyone who
 * wants to read a value goes to the chart on Ripoti, which has both.
 *
 * **The baseline is zero, not the minimum.** A sparkline scaled to its own
 * range turns a quiet, steady week into a dramatic mountain range; scaled from
 * zero it tells the truth about how much a shop's takings actually move.
 *
 * Two mechanics worth knowing before editing. `preserveAspectRatio="none"`
 * stretches the line full-bleed across whatever width the card happens to be,
 * and `vector-effect="non-scaling-stroke"` is what stops that stretch from
 * smearing a 2px line into a wedge. The end dot is deliberately **not** in the
 * SVG: `r` has no such escape hatch, so a circle in a viewBox stretched three
 * times wider than tall renders as an ellipse. It is a positioned element
 * instead, which is round at every width.
 */
export function Sparkline({
  values,
  className,
  height = 40,
  tone = 'primary',
}: {
  values: readonly number[];
  className?: string;
  height?: number;
  tone?: 'primary' | 'muted';
}) {
  if (values.length < 2) {
    return null;
  }

  const width = 100;
  const top = 2;
  const usable = height - top - 2;
  const peak = Math.max(...values, 1);
  const step = width / (values.length - 1);

  const line = values
    .map((value, index) => {
      const x = index * step;
      const y = top + usable - (Math.max(value, 0) / peak) * usable;

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const lastFromBottom = 2 + (Math.max(values[values.length - 1], 0) / peak) * usable;
  const colour = tone === 'primary' ? 'text-chart-1' : 'text-muted-foreground';

  return (
    <div
      className={cn('relative w-full', colour, className)}
      style={{ height }}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
        focusable="false"
      >
        <path
          d={`M0,${height} L${line.split(' ').join(' L')} L${width},${height} Z`}
          fill="currentColor"
          fillOpacity={0.1}
        />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/*
        The only marked point. A dot on every day in a strip this small is
        noise; a dot on the newest one says "you are here".
      */}
      <span
        className="absolute size-[5px] -translate-x-1/2 translate-y-1/2 rounded-full bg-current"
        style={{ right: 0, bottom: lastFromBottom }}
      />
    </div>
  );
}
