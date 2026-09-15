'use client';

import { useState } from 'react';
import type { SeriesPoint } from '@/lib/api/reports';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

const WIDTH = 720;
const HEIGHT = 190;
const PAD = { top: 16, right: 12, bottom: 8, left: 12 };

/** Jumatatu, Jumanne… abbreviated the way a Swahili calendar abbreviates them. */
const WEEKDAYS = ['Jpi', 'Jtatu', 'Jnne', 'Jtano', 'Alh', 'Ijm', 'Jmos'];

function weekdayOf(date: string): string {
  // Midday avoids the date shifting across a boundary while being formatted:
  // this label is cosmetic, and the backend has already decided the day.
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

/**
 * Takings over a run of days.
 *
 * One series, so there is no legend — the title names it, which is the whole
 * job a legend would do. The **baseline is zero**: a chart cropped to its own
 * range makes an ordinary week look like a crisis, and this one is read by
 * somebody deciding whether to worry.
 *
 * Hovering is not decoration here. A line's job is the shape; the number
 * belongs to a particular day, and without a hover layer a reader has to
 * guess which bump was Friday. The hit targets are full-height columns rather
 * than the points themselves, so finding a day does not require hitting a
 * 5px dot.
 */
export function TrendChart({
  points,
  className,
  label = 'Zilizoingia',
}: {
  points: readonly SeriesPoint[];
  className?: string;
  label?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    return null;
  }

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const peak = Math.max(...points.map((point) => point.collectedTzs), 1);
  const step = plotW / (points.length - 1);

  // A tenth of headroom above the best day. Scaled to the peak exactly, the
  // line touches the top edge and reads as clipped — as though the chart were
  // cropping the very day it is drawing attention to.
  const ceiling = peak * 1.1;

  const x = (index: number) => PAD.left + index * step;
  const y = (value: number) => PAD.top + plotH - (Math.max(value, 0) / ceiling) * plotH;

  const line = points.map((point, index) => `${x(index)},${y(point.collectedTzs)}`).join(' ');
  const area = `M${PAD.left},${PAD.top + plotH} L${line.split(' ').join(' L')} L${
    PAD.left + plotW
  },${PAD.top + plotH} Z`;

  const shown = active ?? points.length - 1;
  const shownPoint = points[shown];

  // Three gridlines and no axis labels. The figures are in the tooltip and in
  // the tiles above; a y-axis of shilling amounts here would be four more
  // numbers competing with the four that matter.
  const gridlines = [0.25, 0.5, 0.75].map((fraction) => PAD.top + plotH * fraction);

  return (
    <figure className={cn('m-0 flex flex-col gap-2', className)}>
      <figcaption className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground">
          siku {points.length} · last {points.length} days
        </span>
        <span className="tabular ml-auto text-xs text-muted-foreground">
          {active === null ? 'kilele · peak ' : ''}
          {money(active === null ? peak : shownPoint.collectedTzs)}
        </span>
      </figcaption>

      <div className="relative">
        {/*
          `h-auto` rather than a fixed height: with the viewBox's own aspect
          ratio the plot fills whatever width it is given and gets shorter on a
          phone. Pinned to a height instead, the default `meet` scaling
          letterboxes it — a 720-wide drawing centred in a 190px box with empty
          bands above and below, which is how it looked before.
        */}
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full text-chart-1"
          role="img"
          aria-label={`${label} kwa siku ${points.length}`}
        >
          {gridlines.map((gy) => (
            <line
              key={gy}
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={gy}
              y2={gy}
              className="stroke-border"
              strokeWidth={1}
            />
          ))}
          <line
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH}
            className="stroke-border"
            strokeWidth={1}
          />

          <path d={area} fill="currentColor" fillOpacity={0.08} />
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Where the reader is looking. */}
          <line
            x1={x(shown)}
            x2={x(shown)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            className="stroke-muted-foreground"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={active === null ? 0 : 0.6}
          />
          <circle
            cx={x(shown)}
            cy={y(shownPoint.collectedTzs)}
            r={5}
            fill="currentColor"
            className="stroke-card"
            strokeWidth={2.5}
          />

          {points.map((point, index) => (
            <rect
              key={point.date}
              x={x(index) - step / 2}
              y={0}
              width={step}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
            />
          ))}

        </svg>

        {/*
          The day labels are HTML rather than SVG <text>, and that is not a
          preference. The plot scales to whatever width the card is, and text
          inside a scaled viewBox scales with it — at phone width a 10px label
          in a 720-wide viewBox renders at about four pixels, which is not a
          label, it is a smudge. Out here they stay the size they are set.
        */}
        <div className="relative mt-1 h-4" aria-hidden="true">
          {points.map((point, index) => {
            // One label in five, plus the newest day, or the axis becomes a
            // wall of text nobody reads.
            const every = Math.max(1, Math.round(points.length / 5));
            const last = index === points.length - 1;
            // ...and nothing so close to the right-hand end that it collides
            // with "Leo", which is the one label that must always be legible.
            const crowdsToday = index > points.length - 1 - Math.ceil(every / 2);

            if (!last && (index % every !== 0 || crowdsToday)) {
              return null;
            }

            return (
              <span
                key={point.date}
                className={cn(
                  'absolute top-0 -translate-x-1/2 text-[10px] leading-none',
                  last ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
                style={{ left: `${(x(index) / WIDTH) * 100}%` }}
              >
                {last ? 'Leo' : weekdayOf(point.date)}
              </span>
            );
          })}
        </div>

        {active !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 shadow-md"
            // Clamped away from both edges so the card never has to scroll to
            // show a tooltip about a day at the end of the run.
            style={{ left: `${Math.min(Math.max((x(active) / WIDTH) * 100, 18), 82)}%` }}
          >
            <p className="text-[11px] text-muted-foreground">{shownPoint.date}</p>
            <p className="tabular text-sm font-semibold">{money(shownPoint.collectedTzs)}</p>
            <p className="text-[11px] text-muted-foreground">
              mauzo {shownPoint.saleCount}
              {shownPoint.debtTzs > 0 ? ` · deni ${money(shownPoint.debtTzs)}` : ''}
            </p>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
