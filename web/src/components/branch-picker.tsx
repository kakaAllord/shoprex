import Link from 'next/link';
import type { BranchView } from '@/lib/api/organization';
import { cn } from '@/lib/utils';

/**
 * Which branch a screen is looking at.
 *
 * Links rather than a `<select>`, so the branch is in the URL: an owner can
 * bookmark one branch's stock, and the back button does what they expect. The
 * list comes from `GET /branches`, which is already scoped — a manager sees
 * only the branches they were given, and there is nothing here to filter.
 */
export function BranchPicker({
  branches,
  selected,
  basePath,
  query,
}: {
  branches: BranchView[];
  selected: string;
  basePath: string;
  /** Extra query kept across a branch change — a chosen date, usually. */
  query?: Record<string, string | undefined>;
}) {
  if (branches.length <= 1) {
    return null;
  }

  const suffix = Object.entries(query ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `&${key}=${value}`)
    .join('');

  return (
    <nav
      aria-label="Tawi · Branch"
      className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1"
    >
      {branches.map((branch) => {
        const active = branch.id === selected;

        return (
          <Link
            key={branch.id}
            href={`${basePath}?branch=${branch.id}${suffix}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {branch.name}
          </Link>
        );
      })}
    </nav>
  );
}
