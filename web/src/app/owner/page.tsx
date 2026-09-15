import Link from 'next/link';
import { ArrowRightIcon, PackageIcon, ReceiptIcon, SmartphoneIcon, StoreIcon, TagIcon, UsersIcon } from 'lucide-react';
import { ConsoleShell } from '@/components/console-shell';
import { ErrorState, Panel } from '@/components/states';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { requireConsole, isOwner } from '@/lib/api/guard';
import { fetchDevices } from '@/lib/api/devices';
import { fetchMyBranches, fetchMyBusiness } from '@/lib/api/organization';
import { fetchProducts } from '@/lib/api/products';
import { fetchStaff } from '@/lib/api/staff';

export const dynamic = 'force-dynamic';

/**
 * The owner's front door.
 *
 * Deliberately counts and doors, **not money**. Daily takings, payment
 * breakdowns, and branch comparisons live on Ripoti, and building a smaller
 * version of them here would mean two places doing local-day arithmetic —
 * which is exactly how the two come to disagree.
 *
 * Which is also why nothing on this screen is green. Green means money in this
 * console, and there is no money on this page.
 */
export default async function OwnerPage() {
  const { profile, token } = await requireConsole('owner');

  let business;
  let branches;
  let staff;
  let devices;
  let products;

  try {
    [business, branches, staff, devices, products] = await Promise.all([
      fetchMyBusiness(token),
      fetchMyBranches(token),
      fetchStaff(token),
      fetchDevices(token),
      fetchProducts(token),
    ]);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner" title="Muhtasari">
        <ErrorState error={error} retryHref="/owner" />
      </ConsoleShell>
    );
  }

  const activeDevices = devices.filter((device) => device.status === 'ACTIVE');

  return (
    <ConsoleShell
      profile={profile}
      current="/owner"
      title={business.name}
      lede={
        isOwner(profile)
          ? 'Duka lako kwa ujumla. Kwa mauzo ya siku na PDF, angalia Ripoti.'
          : 'Matawi uliyokabidhiwa. Mmiliki ndiye anayeongeza matawi, wafanyakazi, simu na njia za malipo.'
      }
      actions={
        <Button asChild size="sm">
          <Link href="/owner/reports">
            Ripoti ya leo
            <ArrowRightIcon />
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/owner/branches" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard
            label={isOwner(profile) ? 'Matawi · Branches' : 'Matawi yako · Your branches'}
            value={branches.length}
            icon={<StoreIcon className="size-4" />}
          />
        </Link>
        <Link href="/owner/staff" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard
            label="Wafanyakazi · Staff"
            value={staff.length}
            icon={<UsersIcon className="size-4" />}
          />
        </Link>
        <Link href="/owner/devices" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard
            label="Simu hai · Active phones"
            value={activeDevices.length}
            hint={
              devices.length > activeDevices.length
                ? `${devices.length - activeDevices.length} zimefungiwa · revoked`
                : undefined
            }
            icon={<SmartphoneIcon className="size-4" />}
          />
        </Link>
        <Link href="/owner/products" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard
            label="Bidhaa · Products on sale"
            value={products.length}
            icon={<TagIcon className="size-4" />}
          />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel title="Duka · Business">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">Jina · Name</dt>
            <dd className="text-right font-medium">{business.name}</dd>
            <dt className="text-muted-foreground">Saa za eneo · Timezone</dt>
            <dd className="text-right font-medium">{business.timezone}</dd>
            <dt className="text-muted-foreground">Sarafu · Currency</dt>
            <dd className="text-right font-medium">{business.currency}</dd>
            <dt className="text-muted-foreground">Watumiaji · Users</dt>
            <dd className="tabular text-right font-medium">{business.userCount}</dd>
          </dl>
        </Panel>

        <Panel
          title={`Matawi · Branches (${branches.length})`}
          description="Mauzo na stoo ya kila tawi"
        >
          <ul className="divide-y">
            {branches.map((branch) => (
              <li
                key={branch.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="text-sm font-medium">{branch.name}</span>
                <span className="flex gap-1.5">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/owner/sales?branch=${branch.id}`}>
                      <ReceiptIcon />
                      Mauzo
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/owner/stock?branch=${branch.id}`}>
                      <PackageIcon />
                      Stoo
                    </Link>
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </ConsoleShell>
  );
}
