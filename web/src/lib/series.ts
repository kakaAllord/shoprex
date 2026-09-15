import type { SeriesPoint } from '@/lib/api/reports';

export interface Comparison {
  /** What the most recent day took. */
  latestTzs: number;
  /** The mean of every day before it in the run. */
  averageTzs: number;
  /** How many days that average covers. */
  overDays: number;
  /** Signed percentage against that average, rounded to a whole number. */
  percent: number;
  direction: 'up' | 'down' | 'flat';
}

/**
 * "Is today normal?" — which is the question a shopkeeper is actually asking,
 * and the one a single number cannot answer.
 *
 * Measured against the **mean of the preceding days in the run**, not against
 * yesterday. Yesterday might have been a public holiday or the day a wedding
 * bought out the shop; comparing to it makes an ordinary day look like a
 * catastrophe or a triumph. An average over a fortnight is dull, which is the
 * point.
 *
 * Returns null when there is nothing honest to compare against: a run of one
 * day, or a stretch of closed days averaging zero, where any percentage would
 * be an artefact of dividing by almost nothing.
 */
export function compareToRun(points: readonly SeriesPoint[]): Comparison | null {
  if (points.length < 2) {
    return null;
  }

  const latest = points[points.length - 1];
  const earlier = points.slice(0, -1);
  const total = earlier.reduce((running, point) => running + point.collectedTzs, 0);

  if (total <= 0) {
    return null;
  }

  const averageTzs = total / earlier.length;
  const percent = Math.round(((latest.collectedTzs - averageTzs) / averageTzs) * 100);

  return {
    latestTzs: latest.collectedTzs,
    averageTzs: Math.round(averageTzs),
    overDays: earlier.length,
    percent,
    // A shop is never exactly average. Anything inside a percent is noise, and
    // an arrow drawn on noise is a lie told with a triangle.
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
  };
}

/**
 * The best day in the run, for labelling the peak of a chart.
 *
 * Ties go to the **earlier** day, so a flat run does not have its marker jump
 * to the right-hand end and read as "today was the best day".
 */
export function peakOf(points: readonly SeriesPoint[]): SeriesPoint | null {
  return points.reduce<SeriesPoint | null>(
    (best, point) => (best === null || point.collectedTzs > best.collectedTzs ? point : best),
    null,
  );
}
