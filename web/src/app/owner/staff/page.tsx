import { ActionForm } from '../../../components/action-form';
import { ConsoleShell } from '../../../components/console-shell';
import { PermissionChecks } from '../../../components/permission-checks';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '../../../components/states';
import { lastSeen } from '../../../lib/format';
import { isOwner, requireConsole } from '../../../lib/api/guard';
import { fetchMyBranches } from '../../../lib/api/organization';
import { fetchStaff, PERMISSION_LABELS } from '../../../lib/api/staff';
import { createManagerAction, createWorkerAction, setPermissionsAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Workers and managers — the Phase 2 flow that had no screen until now.
 *
 * The two are created differently on purpose. A **worker** gets a name, a
 * password, and one branch, and no email at all: they sign in on a phone
 * enrolled to their branch, so an address would be invented data sitting in a
 * real column. A **manager** works in this console, so they get the same
 * email-and-password credentials an owner has, scoped to the branches named.
 */
export default async function StaffPage() {
  const { profile, token } = await requireConsole('owner');

  let staff;
  let branches;

  try {
    [staff, branches] = await Promise.all([fetchStaff(token), fetchMyBranches(token)]);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/staff" title="Wafanyakazi">
        <ErrorState error={error} retryHref="/owner/staff" />
      </ConsoleShell>
    );
  }

  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.name ?? '—';

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/staff"
      title="Wafanyakazi · Staff"
      lede="Mfanyakazi huingia kwenye simu ya tawi lake kwa nenosiri lake mwenyewe. Meneja huingia hapa kwa barua pepe. A worker signs in on their branch's phone; a manager signs in here."
    >
      <Panel title={`Watu · People (${staff.length})`}>
        {staff.length === 0 ? (
          <EmptyState
            title="Hakuna mfanyakazi bado · Nobody yet"
            hint="Ongeza mfanyakazi wa kwanza hapa chini, kisha mpe msimbo wa simu."
          />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Jina · Name</th>
                  <th>Wadhifa · Role</th>
                  <th>Tawi · Branch</th>
                  <th>Ruhusa · Permissions</th>
                  <th>Aliingia · Last signed in</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr key={person.id}>
                    <td>
                      {person.fullName}
                      {person.email ? (
                        <span className="shoprex-sub">{person.email}</span>
                      ) : (
                        <span className="shoprex-sub">
                          Huingia kwenye simu · Signs in on a phone
                        </span>
                      )}
                    </td>
                    <td>{person.role === 'MANAGER' ? 'Meneja' : 'Mfanyakazi'}</td>
                    <td>
                      {person.branchIds.length === 0
                        ? '—'
                        : person.branchIds.map(branchName).join(', ')}
                    </td>
                    <td>
                      {person.permissions.length === 0 ? (
                        <span className="shoprex-status shoprex-status--warn">
                          Hakuna · None granted
                        </span>
                      ) : (
                        person.permissions
                          .map((permission) => PERMISSION_LABELS[permission].split(' · ')[0])
                          .join(', ')
                      )}
                    </td>
                    <td>{lastSeen(person.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {isOwner(profile) ? (
        <>
          <Panel title="Badilisha ruhusa · Change what someone may do">
            {staff.length === 0 ? (
              <p className="shoprex-note" style={{ marginTop: 0 }}>
                Hakuna mtu wa kubadilishia ruhusa bado.
              </p>
            ) : (
              staff.map((person) => (
                <details key={person.id} style={{ marginBottom: 10 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                    {person.fullName}
                  </summary>
                  <ActionForm
                    action={setPermissionsAction}
                    label="Hifadhi ruhusa · Save"
                    busyLabel="Inahifadhi..."
                    variant="quiet"
                  >
                    <input type="hidden" name="userId" value={person.id} />
                    <PermissionChecks
                      granted={person.permissions}
                      idPrefix={`perm-${person.id}`}
                    />
                    <p className="shoprex-note" style={{ margin: '0 0 12px' }}>
                      Kisanduku kisichotiwa alama ni ruhusa iliyoondolewa, na hubadilika
                      papo hapo — hata kama tayari ameingia. An unticked box is a permission
                      taken away, and it bites immediately.
                    </p>
                  </ActionForm>
                </details>
              ))
            )}
          </Panel>

          <Panel title="Ongeza mfanyakazi · Add a worker">
            <ActionForm
              action={createWorkerAction}
              label="Ongeza mfanyakazi · Add worker"
              busyLabel="Inaongeza..."
            >
              <div className="shoprex-fieldgrid">
                <div className="shoprex-field">
                  <label className="shoprex-label" htmlFor="worker-name">
                    Jina kamili · Full name
                  </label>
                  <input
                    id="worker-name"
                    name="fullName"
                    required
                    className="shoprex-input"
                    placeholder="Juma Hassan"
                  />
                </div>
                <div className="shoprex-field">
                  <label className="shoprex-label" htmlFor="worker-password">
                    Nenosiri · Password
                  </label>
                  <input
                    id="worker-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    className="shoprex-input"
                    placeholder="Angalau herufi 8"
                  />
                </div>
                <div className="shoprex-field">
                  <label className="shoprex-label" htmlFor="worker-branch">
                    Tawi · Branch
                  </label>
                  <select id="worker-branch" name="branchId" required className="shoprex-input">
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <span className="shoprex-label">Ruhusa · What they may do</span>
              <PermissionChecks idPrefix="new-worker" />
            </ActionForm>
          </Panel>

          <Panel title="Ongeza meneja · Add a delegated manager">
            <ActionForm
              action={createManagerAction}
              label="Ongeza meneja · Add manager"
              busyLabel="Inaongeza..."
            >
              <div className="shoprex-fieldgrid">
                <div className="shoprex-field">
                  <label className="shoprex-label" htmlFor="manager-name">
                    Jina kamili · Full name
                  </label>
                  <input
                    id="manager-name"
                    name="fullName"
                    required
                    className="shoprex-input"
                    placeholder="Asha Mwakalinga"
                  />
                </div>
                <div className="shoprex-field">
                  <label className="shoprex-label" htmlFor="manager-email">
                    Barua pepe · Email
                  </label>
                  <input
                    id="manager-email"
                    name="email"
                    type="email"
                    required
                    className="shoprex-input"
                    placeholder="meneja@duka.co.tz"
                  />
                </div>
                <div className="shoprex-field">
                  <label className="shoprex-label" htmlFor="manager-password">
                    Nenosiri · Password
                  </label>
                  <input
                    id="manager-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    className="shoprex-input"
                  />
                </div>
              </div>

              <span className="shoprex-label">Matawi · Branches they may reach</span>
              <fieldset
                className="shoprex-checks"
                style={{ border: 'none', padding: 0, margin: '4px 0 16px' }}
              >
                {branches.map((branch) => (
                  <label
                    key={branch.id}
                    className="shoprex-check"
                    htmlFor={`manager-branch-${branch.id}`}
                  >
                    <input
                      id={`manager-branch-${branch.id}`}
                      type="checkbox"
                      name="branchIds"
                      value={branch.id}
                    />
                    {branch.name}
                  </label>
                ))}
              </fieldset>

              <span className="shoprex-label">Ruhusa · What they may do</span>
              <PermissionChecks idPrefix="new-manager" />
            </ActionForm>
          </Panel>
        </>
      ) : (
        <Panel title="Kuongeza watu · Adding people">
          <OwnerOnlyNote what="Kuongeza wafanyakazi na kubadilisha ruhusa · Adding staff and changing permissions" />
        </Panel>
      )}
    </ConsoleShell>
  );
}
