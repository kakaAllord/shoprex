import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One figure, said once.
 *
 * `tone="money"` is the only thing on a screen allowed to be green, and only
 * one tile per screen should carry it — the day's takings. Everything else is
 * ink. That scarcity is what makes the green mean something; four green
 * numbers in a row mean nothing at all.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  footer,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'money' | 'owed';
  icon?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>

      <p
        className={cn(
          'tabular mt-2 text-2xl font-bold leading-tight tracking-tight',
          tone === 'money' && 'text-primary',
          tone === 'owed' && 'text-warning-foreground',
        )}
      >
        {value}
      </p>

      {footer ?? (hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null)}
    </Card>
  );
}
