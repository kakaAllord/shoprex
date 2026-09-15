// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DonutChart, foldToDonutSlices } from './donut-chart';
import type { BarRow } from './bar-list';

const row = (label: string, value: number, series?: BarRow['series']): BarRow => ({
  label,
  value,
  display: `TSh ${value.toLocaleString('en-GB')}`,
  series,
});

const THREE = [row('Taslimu', 119000, 1), row('Pesa ya simu', 74000, 2), row('Deni', 19000, 3)];

describe('DonutChart', () => {
  it('puts the total the slices add up to in the hole', () => {
    render(<DonutChart rows={THREE} centreLabel="jumla" />);

    expect(screen.getByText('TSh 212,000')).toBeInTheDocument();
  });

  /**
   * The thing a donut is bad at is comparing two similar arcs by eye, so it is
   * never asked to: every slice states its own amount and share.
   */
  it('never leaves a slice to be read by its colour alone', () => {
    render(<DonutChart rows={THREE} centreLabel="jumla" />);

    for (const label of ['Taslimu', 'Pesa ya simu', 'Deni']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.getByText('TSh 119,000')).toBeInTheDocument();
    expect(screen.getByText('56%')).toBeInTheDocument();
  });

  it('draws the biggest share first, from twelve o’clock', () => {
    const { container } = render(
      <DonutChart rows={[row('Deni', 19000, 3), row('Taslimu', 119000, 1)]} centreLabel="jumla" />,
    );

    // The first arc after the track is the largest slice.
    const arcs = [...container.querySelectorAll('circle')].slice(1);
    expect(arcs[0]).toHaveClass('stroke-chart-1');
  });

  it('describes itself to a screen reader, which cannot see an arc', () => {
    render(<DonutChart rows={THREE} centreLabel="jumla" />);

    expect(screen.getByRole('img', { name: /Taslimu TSh 119,000/ })).toBeInTheDocument();
  });

  it('draws nothing at all rather than an empty ring', () => {
    const { container } = render(<DonutChart rows={[]} centreLabel="jumla" />);
    expect(container).toBeEmptyDOMElement();

    const zeroed = render(<DonutChart rows={[row('Taslimu', 0, 1)]} centreLabel="jumla" />);
    expect(zeroed.container).toBeEmptyDOMElement();
  });
});

describe('foldToDonutSlices', () => {
  it('leaves a readable number of ways to be paid alone', () => {
    expect(foldToDonutSlices(THREE)).toHaveLength(3);
  });

  it('folds the tail into one slice once a circle can no longer hold them', () => {
    const many = Array.from({ length: 9 }, (_, index) => row(`Njia ${index}`, 100 - index * 5));
    const folded = foldToDonutSlices(many, 6);

    expect(folded).toHaveLength(6);
    expect(folded.at(-1)?.label).toBe('Nyingine');
  });

  /**
   * The tail is money the shop took. A chart whose shares do not add up to the
   * total printed in its own middle is worse than no chart.
   */
  it('keeps every shilling when it folds', () => {
    const many = Array.from({ length: 9 }, (_, index) => row(`Njia ${index}`, 100 - index * 5));
    const before = many.reduce((running, r) => running + r.value, 0);
    const after = foldToDonutSlices(many, 6).reduce((running, r) => running + r.value, 0);

    expect(after).toBe(before);
  });
});
