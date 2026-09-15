import { ActionForm } from '@/components/action-form';
import { ConsoleShell } from '@/components/console-shell';
import { EnrollmentForm } from '@/components/enrollment-form';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { lastSeen, moment } from '@/lib/format';
import { isOwner, requireConsole } from '@/lib/api/guard';
import { fetchDevices } from '@/lib/api/devices';
import { fetchMyBranches } from '@/lib/api/organization';
import { revokeDeviceAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * The phones — the other Phase 2 flow that had no screen.
 *
 * A device belongs to a **branch**, not to a person (PROGRESS.md §2a), so this
 * page never asks whose phone it is. Anyone assigned to that branch signs in
 * on it with their own password, and attribution comes from the session rather
 * than the handset.
 */
export default async function DevicesPage() {
  const { profile, token } = await requireConsole('owner');

  let devices;
  let branches;

  try {
    [devices, branches] = await Promise.all([fetchDevices(token), fetchMyBranches(token)]);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/devices" title="Simu">
        <ErrorState error={error} retryHref="/owner/devices" />
      </ConsoleShell>
    );
  }

  const active = devices.filter((device) => device.status === 'ACTIVE');

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/devices"
      title="Simu"
      lede="Simu ni ya tawi, si ya mtu. Yeyote aliyepangiwa tawi hilo huingia kwa nenosiri lake."
    >
      <Panel
        title={`Simu · Phones (${active.length} hai · active)`}
        description="Kufuta simu kunaanza kufanya kazi mara moja — hata kama tayari imeingia."
      >
        {devices.length === 0 ? (
          <EmptyState
            title="Hakuna simu bado · No phones enrolled"
            hint="Tengeneza msimbo hapa chini, kisha uandike kwenye simu ya duka."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Simu · Phone</TableHead>
                <TableHead>Tawi · Branch</TableHead>
                <TableHead>Hali · Status</TableHead>
                <TableHead>Ilionekana · Last seen</TableHead>
                {isOwner(profile) ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell className="font-medium">{device.name}</TableCell>
                  <TableCell className="text-muted-foreground">{device.branchName}</TableCell>
                  <TableCell>
                    {device.status === 'ACTIVE' ? (
                      <Badge variant="success">Hai · Active</Badge>
                    ) : (
                      <span className="flex flex-col items-start gap-1">
                        <Badge variant="destructive">Imefutwa · Revoked</Badge>
                        {device.revokedAt ? (
                          <span className="text-xs text-muted-foreground">
                            {moment(device.revokedAt)}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lastSeen(device.lastSeenAt)}
                  </TableCell>
                  {isOwner(profile) ? (
                    <TableCell className="text-right">
                      {device.status === 'ACTIVE' ? (
                        <ActionForm
                          action={revokeDeviceAction}
                          label="Futa · Revoke"
                          busyLabel="Inafuta..."
                          variant="danger"
                          className="items-end"
                          confirm={`Futa "${device.name}"? Simu hii itakataliwa mara moja. Revoke this phone? It stops working immediately.`}
                        >
                          <input type="hidden" name="deviceId" value={device.id} />
                        </ActionForm>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title="Ongeza simu · Enrol a phone">
        {isOwner(profile) ? (
          <EnrollmentForm branches={branches} />
        ) : (
          <OwnerOnlyNote what="Kutengeneza misimbo ya simu na kufuta simu · Issuing enrollment codes and revoking phones" />
        )}
      </Panel>
    </ConsoleShell>
  );
}
