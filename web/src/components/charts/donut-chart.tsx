import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BarRow } from '@/components/charts/bar-list';

const SERIES_STROKE = {
  1: 'stroke-chart-1',
  2: 'stroke-chart-2',
  3: 'stroke-chart-3',
  4: 'stroke-chart-4',
  5: 'stroke-chart-5',
} as const;

const SERIES_BG = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
} as const;

/** A donut is only honest for a handful of slices; past this it is a colour quiz. */
export const DONUT_MAX_SLICES = 6;

/**
 * **A donut is only worth drawing below this many slices.** Two slices is a
 * ratio, and a ratio is a sentence — "two thirds of the day was cash" — not a
 * picture. One slice is a circle. Callers check this and fall back to the bar
 * list, which reads perfectly well at any count.
 */
export const DONUT_MIN_SLICES = 3;

const RADIUS = 50;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface showing between fills, so two adjacent slices never fuse into one. */
const GAP = 2.5;

/**
 * Part-to-whole, at a glance.
 *
 * The one job a donut does better than a bar: *what share of the day was
 * cash*. It is deliberately not asked to do the other job — **every slice
 * carries its own figure and percentage in the legend**, because comparing two
 * similar arcs by eye is exactly what a donut is bad at, and because colour is
 * never allowed to be the only encoding here.
 *
 * The hole is not decoration. It holds the total the slices add up to, which
 * is the number a reader would otherwise have to find somewhere else on the
 * page to make any of the shares mean something.
 *
 * Slices are ordered largest first from twelve o'clock, so the eye starts
 * where the money is.
 */
export function DonutChart({
  rows,
  centreLabel,
  className,
}: {
  rows: BarRow[];
  centreLabel: string;
  className?: string;
}) {
  const total = rows.reduce((running, row) => running + Math.abs(row.value), 0);

  if (rows.length === 0 || total <= 0) {
    return null;
  }

  const ordered = [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  let cursor = 0;

  const slices = ordered.map((row) => {
    const share = Math.abs(row.value) / total;
    const full = share * CIRCUMFERENCE;
    // A slice thinner than the gap would otherwise vanish into it, and a
    // payment method that took real money must not disappear off the chart.
    const length = Math.max(full - GAP, 1.5);
    const offset = cursor;

    cursor += full;

    return { row, share, length, offset };
  });

  return (
    <div className={cn('flex flex-col items-center gap-5 sm:flex-row sm:items-center', className)}>
      <div className="relative shrink-0" style={{ width: 148, height: 148 }}>
        <svg
          viewBox="0 0 120 120"
          className="size-full -rotate-90"
          role="img"
          aria-label={`${centreLabel}: ${ordered
            .map((row) => `${row.label} ${row.display}`)
            .join(', ')}`}
        >
          <circle
            cx={60}
            cy={60}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-muted"
          />
          {slices.map(({ row, length, offset }) => (
            <circle
              key={row.label}
              cx={60}
              cy={60}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              className={SERIES_STROKE[row.series ?? 1]}
            />
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
          <span className="tabular text-base font-bold leading-none tracking-tight">
            {money(total)}
          </span>
          <span className="px-6 text-[10px] leading-tight text-muted-foreground">
            {centreLabel}
          </span>
        </div>
      </div>

      {/*
        The legend is the chart's other half, not a key to it: the arcs answer
        "what share", these answer "how much", and neither is guessed from a
        colour.
      */}
      <ul className="flex w-full min-w-0 flex-col gap-2.5">
        {slices.map(({ row, share }) => (
          <li key={row.label} className="flex items-baseline gap-2">
            <span
              className={cn(
                'size-2.5 shrink-0 translate-y-px rounded-sm',
                SERIES_BG[row.series ?? 1],
              )}
            />
            <span className="truncate text-sm font-medium">{row.label}</span>
            {row.sublabel ? (
              <span className="shrink-0 text-xs text-muted-foreground">{row.sublabel}</span>
            ) : null}
            <span className="ml-auto flex shrink-0 items-baseline gap-2">
              <span className="tabular text-xs text-muted-foreground">
                {Math.round(share * 100)}%
              </span>
              <span className="tabular text-sm font-semibold">{row.display}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Keep a donut readable when a shop configures more ways of being paid than a
 * circle can hold: the biggest are named, the tail becomes one slice.
 *
 * The tail is deliberately **not** dropped. It is money the shop took, and a
 * chart whose shares do not add up to the total printed in its middle would be
 * worse than no chart.
 */
export function foldToDonutSlices(rows: BarRow[], max = DONUT_MAX_SLICES): BarRow[] {
  if (rows.length <= max) {
    return rows;
  }

  const ordered = [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const named = ordered.slice(0, max - 1);
  const tail = ordered.slice(max - 1);
  const total = tail.reduce((running, row) => running + Math.abs(row.value), 0);

  return [
    ...named,
    {
      label: 'Nyingine',
      sublabel: `njia ${tail.length}`,
      value: total,
      display: money(total),
      series: 5,
    },
  ];
}
