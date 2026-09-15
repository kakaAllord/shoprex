import type { ReactNode } from 'react';
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Sparkline } from '@/components/charts/sparkline';
import type { Comparison } from '@/lib/series';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * One figure, said once.
 *
 * `tone="money"` is the only thing on a screen allowed to be green, and only
 * one tile per screen should carry it — the day's takings. Everything else is
 * ink. That scarcity is what makes the green mean something; four green
 * numbers in a row mean nothing at all.
 *
 * A `comparison` turns the figure into an answer. "TSh 203,000" tells a
 * shopkeeper how much; "18% above the fortnight's average" tells them whether
 * to worry, which is what they actually opened the page to find out.
 *
 * **The trend pill is never colour alone.** Up and down carry their own arrow,
 * so the direction survives a reader who cannot separate the green from the
 * amber — and survives a printout.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  footer,
  comparison,
  sparkline,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'money' | 'owed';
  icon?: ReactNode;
  footer?: ReactNode;
  comparison?: Comparison | null;
  /** Daily values, oldest first. Drawn full-bleed along the bottom. */
  sparkline?: readonly number[];
}) {
  const hasSpark = Boolean(sparkline && sparkline.length > 1);

  return (
    <Card className={cn('gap-0 overflow-hidden', hasSpark ? 'pt-5' : 'p-5')}>
      <div className={cn('flex flex-col', hasSpark && 'px-5')}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p
            className={cn(
              'tabular text-2xl font-bold leading-tight tracking-tight',
              tone === 'money' && 'text-primary',
              tone === 'owed' && 'text-warning-foreground',
            )}
          >
            {value}
          </p>

          {comparison ? <TrendPill comparison={comparison} /> : null}
        </div>

        {comparison ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            dhidi ya wastani wa siku {comparison.overDays} · {money(comparison.averageTzs)} a day
          </p>
        ) : (
          (footer ?? (hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null))
        )}
      </div>

      {hasSpark ? (
        <Sparkline
          values={sparkline!}
          className="mt-3"
          tone={tone === 'money' ? 'primary' : 'muted'}
        />
      ) : null}
    </Card>
  );
}

function TrendPill({ comparison }: { comparison: Comparison }) {
  const { direction, percent } = comparison;

  const Icon =
    direction === 'up' ? TrendingUpIcon : direction === 'down' ? TrendingDownIcon : MinusIcon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        direction === 'up' && 'bg-success-muted text-success-foreground',
        direction === 'down' && 'bg-warning-muted text-warning-foreground',
        direction === 'flat' && 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      <span className="tabular">
        {percent > 0 ? '+' : ''}
        {percent}%
      </span>
    </span>
  );
}
