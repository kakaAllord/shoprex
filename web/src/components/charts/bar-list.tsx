import { cn } from '@/lib/utils';

export interface BarRow {
  /** What the bar is. Written beside the bar, never conveyed by colour alone. */
  label: string;
  /** A second line under the label — a unit, a count. */
  sublabel?: string;
  /** Drives the bar's width. */
  value: number;
  /** What the bar says, already formatted. */
  display: string;
  /** 1-5, mapping to the validated chart ramp. Omit for a single-series list. */
  series?: 1 | 2 | 3 | 4 | 5;
}

const SERIES_BG = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
} as const;

/**
 * Magnitude, read down a column.
 *
 * **Every bar carries its own number**, which is not decoration: green and
 * blue are separated here by lightness rather than hue, and for blue-yellow
 * colour blindness that separation is thin. The written figure is the second
 * encoding, so the chart never depends on telling two hues apart.
 *
 * Bars are proportioned against the largest row, not against the total — the
 * question a shopkeeper asks of this list is "which is biggest", not "what
 * share of everything is this".
 */
export function BarList({ rows, className }: { rows: BarRow[]; className?: string }) {
  const largest = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <ul className={cn('flex flex-col gap-3.5', className)}>
      {rows.map((row) => (
        <li key={row.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">{row.label}</span>
            {row.sublabel ? (
              <span className="truncate text-xs text-muted-foreground">{row.sublabel}</span>
            ) : null}
            <span className="tabular ml-auto shrink-0 text-sm font-semibold">{row.display}</span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', SERIES_BG[row.series ?? 1])}
              style={{ width: `${Math.max((Math.abs(row.value) / largest) * 100, 1.5)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
