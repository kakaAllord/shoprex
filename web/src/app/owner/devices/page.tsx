import { ActionForm } from '../../../components/action-form';
import { ConsoleShell } from '../../../components/console-shell';
import { EnrollmentForm } from '../../../components/enrollment-form';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '../../../components/states';
import { lastSeen, moment } from '../../../lib/format';
import { isOwner, requireConsole } from '../../../lib/api/guard';
import { fetchDevices } from '../../../lib/api/devices';
import { fetchMyBranches } from '../../../lib/api/organization';
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
      title="Simu · Devices"
      lede="Simu ni ya tawi, si ya mtu. Yeyote aliyepangiwa tawi hilo huingia kwa nenosiri lake. A phone belongs to a branch — anyone assigned there signs in with their own password."
    >
      <Panel title={`Simu · Phones (${active.length} hai · active)`}>
        {devices.length === 0 ? (
          <EmptyState
            title="Hakuna simu bado · No phones enrolled"
            hint="Tengeneza msimbo hapa chini, kisha uandike kwenye simu ya duka."
          />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Simu · Phone</th>
                  <th>Tawi · Branch</th>
                  <th>Hali · Status</th>
                  <th>Ilionekana · Last seen</th>
                  {isOwner(profile) ? <th>&nbsp;</th> : null}
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id}>
                    <td>{device.name}</td>
                    <td>{device.branchName}</td>
                    <td>
                      {device.status === 'ACTIVE' ? (
                        <span className="shoprex-status shoprex-status--ok">Hai · Active</span>
                      ) : (
                        <span className="shoprex-status shoprex-status--error">
                          Imefutwa · Revoked
                          <span className="shoprex-sub">
                            {device.revokedAt ? moment(device.revokedAt) : ''}
                          </span>
                        </span>
                      )}
                    </td>
                    <td>{lastSeen(device.lastSeenAt)}</td>
                    {isOwner(profile) ? (
                      <td>
                        {device.status === 'ACTIVE' ? (
                          <ActionForm
                            action={revokeDeviceAction}
                            label="Futa · Revoke"
                            busyLabel="Inafuta..."
                            variant="danger"
                            confirm={`Futa "${device.name}"? Simu hii itakataliwa mara moja. Revoke this phone? It stops working immediately.`}
                          >
                            <input type="hidden" name="deviceId" value={device.id} />
                          </ActionForm>
                        ) : (
                          <span className="shoprex-note">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="shoprex-note">
          Kufuta simu kunaanza kufanya kazi mara moja — hata kama tayari imeingia.
          Revoking takes effect at the backend on the phone&rsquo;s very next request, not
          when its session expires.
        </p>
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
