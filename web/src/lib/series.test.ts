import { describe, expect, it } from 'vitest';
import { compareToRun, peakOf } from './series';
import type { SeriesPoint } from './api/reports';

const point = (date: string, collectedTzs: number): SeriesPoint => ({
  date,
  saleCount: 1,
  salesTotalTzs: collectedTzs,
  debtTzs: 0,
  collectedTzs,
});

describe('compareToRun', () => {
  it('measures the newest day against the average of the days before it', () => {
    const result = compareToRun([
      point('2026-09-13', 100),
      point('2026-09-14', 200),
      point('2026-09-15', 300),
    ]);

    expect(result).toMatchObject({
      latestTzs: 300,
      averageTzs: 150,
      overDays: 2,
      percent: 100,
      direction: 'up',
    });
  });

  it('calls a quiet day down, and says by how much', () => {
    const result = compareToRun([point('2026-09-14', 1000), point('2026-09-15', 250)]);

    expect(result).toMatchObject({ percent: -75, direction: 'down' });
  });

  it('calls an ordinary day flat rather than drawing an arrow on noise', () => {
    const result = compareToRun([point('2026-09-14', 500), point('2026-09-15', 500)]);

    expect(result?.direction).toBe('flat');
    expect(result?.percent).toBe(0);
  });

  /**
   * Both of these would otherwise produce a percentage that is an artefact of
   * dividing by almost nothing — a shop reopening after a closed week would be
   * told its takings were up several thousand percent.
   */
  it('refuses to compare a single day against nothing', () => {
    expect(compareToRun([point('2026-09-15', 400)])).toBeNull();
    expect(compareToRun([])).toBeNull();
  });

  it('refuses to compare against a stretch of closed days', () => {
    expect(
      compareToRun([point('2026-09-13', 0), point('2026-09-14', 0), point('2026-09-15', 900)]),
    ).toBeNull();
  });

  it('reads the run oldest-first, as the backend returns it', () => {
    const result = compareToRun([point('2026-09-14', 100), point('2026-09-15', 50)]);

    expect(result?.latestTzs).toBe(50);
  });
});

describe('peakOf', () => {
  it('finds the best day in the run', () => {
    expect(
      peakOf([point('2026-09-13', 100), point('2026-09-14', 900), point('2026-09-15', 400)])?.date,
    ).toBe('2026-09-14');
  });

  /**
   * Otherwise a perfectly flat week marks its last day as the best one, which
   * reads as "today was your peak" when nothing of the sort happened.
   */
  it('gives a tie to the earlier day', () => {
    expect(peakOf([point('2026-09-14', 500), point('2026-09-15', 500)])?.date).toBe('2026-09-14');
  });

  it('has no peak when there are no days', () => {
    expect(peakOf([])).toBeNull();
  });
});
