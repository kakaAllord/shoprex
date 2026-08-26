import Link from 'next/link';
import { ConsoleShell } from '../../components/console-shell';
import { ErrorState, Panel } from '../../components/states';
import { requireConsole, isOwner } from '../../lib/api/guard';
import { fetchDevices } from '../../lib/api/devices';
import { fetchMyBranches, fetchMyBusiness } from '../../lib/api/organization';
import { fetchProducts } from '../../lib/api/products';
import { fetchStaff } from '../../lib/api/staff';

export const dynamic = 'force-dynamic';

/**
 * The owner's front door.
 *
 * Deliberately counts and doors, **not money**. Daily takings, payment
 * breakdowns, and branch comparisons live on Ripoti, and building a smaller
 * version of them here would mean two places doing local-day arithmetic —
 * which is exactly how the two come to disagree.
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
          ? 'Duka lako kwa ujumla. Kwa mauzo ya siku na PDF, angalia Ripoti. Your shop at a glance — for daily takings and a PDF, see Ripoti.'
          : 'Matawi uliyokabidhiwa. Mmiliki ndiye anayeongeza matawi, wafanyakazi, simu na njia za malipo. The branches delegated to you.'
      }
    >
      <div className="shoprex-metrics">
        <div className="shoprex-metric">
          <Link href="/owner/branches">
            <div className="shoprex-metric__value">{branches.length}</div>
            <div className="shoprex-metric__label">
              {isOwner(profile) ? 'Matawi · Branches' : 'Matawi yako · Your branches'}
            </div>
          </Link>
        </div>
        <div className="shoprex-metric">
          <Link href="/owner/staff">
            <div className="shoprex-metric__value">{staff.length}</div>
            <div className="shoprex-metric__label">Wafanyakazi · Staff</div>
          </Link>
        </div>
        <div className="shoprex-metric">
          <Link href="/owner/devices">
            <div className="shoprex-metric__value">{activeDevices.length}</div>
            <div className="shoprex-metric__label">Simu hai · Active phones</div>
          </Link>
        </div>
        <div className="shoprex-metric">
          <Link href="/owner/products">
            <div className="shoprex-metric__value">{products.length}</div>
            <div className="shoprex-metric__label">Bidhaa · Products on sale</div>
          </Link>
        </div>
      </div>

      <Panel title="Duka · Business">
        <dl className="shoprex-kv">
          <dt>Jina · Name</dt>
          <dd>{business.name}</dd>
          <dt>Saa za eneo · Timezone</dt>
          <dd>{business.timezone}</dd>
          <dt>Sarafu · Currency</dt>
          <dd>{business.currency}</dd>
          <dt>Watumiaji · Users</dt>
          <dd>{business.userCount}</dd>
        </dl>
      </Panel>

      <Panel title={`Matawi · Branches (${branches.length})`}>
        <ul className="shoprex-list">
          {branches.map((branch) => (
            <li key={branch.id}>
              <span>{branch.name}</span>
              <span className="shoprex-rowactions">
                <Link className="shoprex-linkbutton" href={`/owner/sales?branch=${branch.id}`}>
                  Mauzo
                </Link>
                <Link className="shoprex-linkbutton" href={`/owner/stock?branch=${branch.id}`}>
                  Stoo
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </ConsoleShell>
  );
}
