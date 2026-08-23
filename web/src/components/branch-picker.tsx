import Link from 'next/link';
import type { BranchView } from '../lib/api/organization';

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
}: {
  branches: BranchView[];
  selected: string;
  basePath: string;
}) {
  if (branches.length <= 1) {
    return null;
  }

  return (
    <div className="shoprex-branchbar" role="navigation" aria-label="Tawi · Branch">
      {branches.map((branch) => (
        <Link
          key={branch.id}
          href={`${basePath}?branch=${branch.id}`}
          className={
            branch.id === selected
              ? 'shoprex-branchbar__link shoprex-branchbar__link--on'
              : 'shoprex-branchbar__link'
          }
          aria-current={branch.id === selected ? 'page' : undefined}
        >
          {branch.name}
        </Link>
      ))}
    </div>
  );
}
