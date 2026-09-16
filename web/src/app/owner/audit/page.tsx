import {
  BanIcon,
  BarcodeIcon,
  CreditCardIcon,
  KeyRoundIcon,
  PackagePlusIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  StoreIcon,
  TagIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ConsoleShell } from '@/components/console-shell';
import { EmptyState, ErrorState, Panel } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { moment } from '@/lib/format';
import { requireConsole } from '@/lib/api/guard';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { fetchAuditEvents, type AuditAction, type AuditScope } from '@/lib/api/audit';

export const dynamic = 'force-dynamic';

/**
 * What each kind of event is, said in the words of the shop.
 *
 * `tone` is doing real work here: **almost everything in this log is ordinary**
 * — a sale, a delivery, somebody signing in — and a log where every line is
 * coloured is a log nobody scans. Only the two kinds an owner would actually
 * want to catch are marked: a count that did not add up, and a change to who
 * can get in.
 */
const EVENTS: Record<AuditAction, { label: string; icon: LucideIcon; tone: 'plain' | 'watch' }> = {
  SALE_COMPLETED: { label: 'Mauzo', icon: ReceiptIcon, tone: 'plain' },
  STOCK_RECEIVED: { label: 'Mzigo', icon: PackagePlusIcon, tone: 'plain' },
  STOCK_INCONSISTENCY: { label: 'Hesabu', icon: TriangleAlertIcon, tone: 'watch' },
  BRANCH_CREATED: { label: 'Tawi', icon: StoreIcon, tone: 'plain' },
  MANAGER_CREATED: { label: 'Meneja', icon: UserPlusIcon, tone: 'plain' },
  WORKER_CREATED: { label: 'Mfanyakazi', icon: UserPlusIcon, tone: 'plain' },
  PERMISSIONS_CHANGED: { label: 'Ruhusa', icon: ShieldCheckIcon, tone: 'watch' },
  DEVICE_ENROLLMENT_ISSUED: { label: 'Msimbo', icon: SmartphoneIcon, tone: 'plain' },
  DEVICE_ENROLLED: { label: 'Simu', icon: SmartphoneIcon, tone: 'plain' },
  DEVICE_SIGNED_IN: { label: 'Kuingia', icon: SmartphoneIcon, tone: 'plain' },
  DEVICE_REVOKED: { label: 'Simu', icon: BanIcon, tone: 'watch' },
  PRODUCT_CREATED: { label: 'Bidhaa', icon: TagIcon, tone: 'plain' },
  PRODUCT_UNIT_ADDED: { label: 'Kipimo', icon: TagIcon, tone: 'plain' },
  PRODUCT_UPDATED: { label: 'Bidhaa', icon: TagIcon, tone: 'plain' },
  PRODUCT_PRICE_CHANGED: { label: 'Bei', icon: TagIcon, tone: 'watch' },
  BARCODE_ATTACHED: { label: 'Namba', icon: BarcodeIcon, tone: 'plain' },
  PAYMENT_METHOD_CREATED: { label: 'Malipo', icon: CreditCardIcon, tone: 'plain' },
  PAYMENT_METHOD_UPDATED: { label: 'Malipo', icon: CreditCardIcon, tone: 'watch' },
  PASSWORD_CHANGED: { label: 'Nenosiri', icon: KeyRoundIcon, tone: 'plain' },
  PASSWORD_RESET: { label: 'Nenosiri', icon: KeyRoundIcon, tone: 'watch' },
  STAFF_DEACTIVATED: { label: 'Mfanyakazi', icon: BanIcon, tone: 'watch' },
  STAFF_REACTIVATED: { label: 'Mfanyakazi', icon: UserPlusIcon, tone: 'plain' },
};

const ROLES: Record<string, string> = {
  PLATFORM_ADMIN: 'Msimamizi',
  OWNER: 'Mmiliki',
  MANAGER: 'Meneja',
  WORKER: 'Mfanyakazi',
};

/**
 * Who did what, from which phone, and when.
 *
 * The backend has recorded every line of this since Phase 2 and **nothing ever
 * showed it**, so an owner asking "who dropped the price of sugar on Tuesday"
 * had no way to find out even though the answer was in the database. This page
 * is not a new capability; it is the one that was already paid for.
 *
 * It matters most for the thing that makes a shop work at all: an owner who
 * cannot go to the counter every day has to delegate, and delegating is much
 * easier when it can be checked afterwards.
 *
 * Owner-only, enforced by the backend — `GET /audit-events` requires the owner
 * role, so a manager who reaches this address gets the shop's own rule in
 * amber rather than a page of somebody else's business.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { profile, token } = await requireConsole('owner');
  const { scope: requested } = await searchParams;

  // Notable by default. A busy shop's log is nine parts completed sales, and
  // the reason somebody opens this page is the tenth part.
  const scope: AuditScope = requested === 'all' ? 'all' : 'notable';

  let events;

  try {
    events = await fetchAuditEvents(token, { limit: 200, scope });
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/audit" title="Kumbukumbu">
        <ErrorState error={error} retryHref="/owner/audit" />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/audit"
      title="Kumbukumbu"
      lede="Nani alifanya nini, kwa simu gani, na lini."
      actions={
        <nav
          aria-label="Aina ya kumbukumbu"
          className="inline-flex items-center gap-1 rounded-lg bg-muted p-1"
        >
          {(
            [
              ['notable', 'Za kuangalia'],
              ['all', 'Zote'],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={value === 'notable' ? '/owner/audit' : '/owner/audit?scope=all'}
              aria-current={scope === value ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                scope === value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      }
    >
      <Panel
        title={`Matukio · Events (${events.length})`}
        description={
          scope === 'notable'
            ? 'Mauzo, mzigo, na kuingia kwenye simu hayamo hapa — ni mengi mno. Bonyeza Zote kuyaona. Completed sales, deliveries, and sign-ins are left out; press Zote for everything.'
            : 'Kila kitu, mauzo na yote. Hakuna kinachofutwa — kumbukumbu huongezwa tu.'
        }
      >
        {events.length === 0 ? (
          <EmptyState
            title={
              scope === 'notable'
                ? 'Hakuna la kuangalia · Nothing out of the ordinary'
                : 'Hakuna kumbukumbu bado · Nothing recorded yet'
            }
            hint={
              scope === 'notable'
                ? 'Hakuna bei iliyobadilishwa, simu iliyofutwa, wala hesabu iliyokosea. Bonyeza Zote kuona kila kitu.'
                : 'Kumbukumbu huanza pale mauzo, mzigo, au mabadiliko yanapotokea.'
            }
          />
        ) : (
          <ol className="flex flex-col">
            {events.map((event) => {
              const kind = EVENTS[event.action] ?? {
                label: event.action,
                icon: ShieldCheckIcon,
                tone: 'plain' as const,
              };

              return (
                <li
                  key={event.id}
                  className="flex items-start gap-3 border-b py-3 last:border-b-0 first:pt-0"
                >
                  <span
                    className={
                      kind.tone === 'watch'
                        ? 'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-muted text-warning-foreground'
                        : 'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'
                    }
                  >
                    <kind.icon className="size-3.5" aria-hidden="true" />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-sm leading-snug">{event.summary}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant={kind.tone === 'watch' ? 'warning' : 'secondary'}>
                        {kind.label}
                      </Badge>
                      <span>{event.actorName ?? 'Haijulikani · unknown'}</span>
                      {event.actorRole ? (
                        <span>· {ROLES[event.actorRole] ?? event.actorRole}</span>
                      ) : null}
                      {/*
                        The phone, when there was one. An owner working out what
                        happened cares which handset it happened on — that is
                        half of "who", in a shop where several people share a
                        branch's phones.
                      */}
                      {event.deviceId ? <span>· simu {event.deviceId.slice(0, 8)}</span> : null}
                    </p>
                  </div>

                  <time className="tabular shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {moment(event.createdAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}

        {events.length >= 200 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Zinaonyeshwa 200 za mwisho tu · only the most recent 200 are shown.
          </p>
        ) : null}
      </Panel>
    </ConsoleShell>
  );
}
