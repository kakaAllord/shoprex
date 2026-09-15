import { ActionForm } from '@/components/action-form';
import { ConsoleShell } from '@/components/console-shell';
import { PermissionChecks } from '@/components/permission-checks';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '@/components/states';
import { Field } from '@/components/field';
import { NativeSelect } from '@/components/native-select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { lastSeen } from '@/lib/format';
import { isOwner, requireConsole } from '@/lib/api/guard';
import { fetchMyBranches } from '@/lib/api/organization';
import { fetchStaff, PERMISSION_LABELS } from '@/lib/api/staff';
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

  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name ?? '—';

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/staff"
      title="Wafanyakazi"
      lede="Mfanyakazi huingia kwenye simu ya tawi lake; meneja huingia hapa kwa barua pepe."
    >
      <Panel title={`Watu · People (${staff.length})`}>
        {staff.length === 0 ? (
          <EmptyState
            title="Hakuna mfanyakazi bado · Nobody yet"
            hint="Ongeza mfanyakazi wa kwanza hapa chini, kisha mpe msimbo wa simu."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jina · Name</TableHead>
                <TableHead>Wadhifa · Role</TableHead>
                <TableHead>Tawi · Branch</TableHead>
                <TableHead>Ruhusa · Permissions</TableHead>
                <TableHead>Aliingia · Last signed in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((person) => (
                <TableRow key={person.id}>
                  <TableCell>
                    <span className="font-medium">{person.fullName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {person.email ?? 'Huingia kwenye simu · Signs in on a phone'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {person.role === 'MANAGER' ? 'Meneja' : 'Mfanyakazi'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {person.branchIds.length === 0
                      ? '—'
                      : person.branchIds.map(branchName).join(', ')}
                  </TableCell>
                  <TableCell>
                    {person.permissions.length === 0 ? (
                      <Badge variant="warning">Hakuna · None granted</Badge>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {person.permissions.map((permission) => (
                          <Badge key={permission} variant="outline">
                            {PERMISSION_LABELS[permission].split(' · ')[0]}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lastSeen(person.lastLoginAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {isOwner(profile) ? (
        <>
          <Panel
            title="Badilisha ruhusa · Change what someone may do"
            description="Kisanduku kisichotiwa alama ni ruhusa iliyoondolewa, na hubadilika papo hapo — hata kama tayari ameingia."
          >
            {staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Hakuna mtu wa kubadilishia ruhusa bado.
              </p>
            ) : (
              <div className="divide-y">
                {staff.map((person) => (
                  <details key={person.id} className="group py-2 first:pt-0 last:pb-0">
                    <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                      <span className="inline-flex items-center gap-2">
                        <span className="text-muted-foreground transition-transform group-open:rotate-90">
                          ›
                        </span>
                        {person.fullName}
                      </span>
                    </summary>
                    <div className="pl-5 pt-3">
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
                      </ActionForm>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Ongeza mfanyakazi · Add a worker">
            <ActionForm
              action={createWorkerAction}
              label="Ongeza mfanyakazi · Add worker"
              busyLabel="Inaongeza..."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field htmlFor="worker-name" label="Jina kamili · Full name">
                  <Input id="worker-name" name="fullName" required placeholder="Juma Hassan" />
                </Field>
                <Field htmlFor="worker-password" label="Nenosiri · Password">
                  <Input
                    id="worker-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Angalau herufi 8"
                  />
                </Field>
                <Field htmlFor="worker-branch" label="Tawi · Branch">
                  <NativeSelect id="worker-branch" name="branchId" required>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Ruhusa · What they may do</Label>
                <PermissionChecks idPrefix="new-worker" />
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Ongeza meneja · Add a delegated manager">
            <ActionForm
              action={createManagerAction}
              label="Ongeza meneja · Add manager"
              busyLabel="Inaongeza..."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field htmlFor="manager-name" label="Jina kamili · Full name">
                  <Input id="manager-name" name="fullName" required placeholder="Asha Mwakalinga" />
                </Field>
                <Field htmlFor="manager-email" label="Barua pepe · Email">
                  <Input
                    id="manager-email"
                    name="email"
                    type="email"
                    required
                    placeholder="meneja@duka.co.tz"
                  />
                </Field>
                <Field htmlFor="manager-password" label="Nenosiri · Password">
                  <Input
                    id="manager-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Matawi · Branches they may reach</Label>
                <fieldset className="flex flex-wrap gap-x-4 gap-y-2 border-0 p-0">
                  {branches.map((branch) => (
                    <label
                      key={branch.id}
                      htmlFor={`manager-branch-${branch.id}`}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        id={`manager-branch-${branch.id}`}
                        type="checkbox"
                        name="branchIds"
                        value={branch.id}
                        className="size-4 rounded border-input accent-primary"
                      />
                      {branch.name}
                    </label>
                  ))}
                </fieldset>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Ruhusa · What they may do</Label>
                <PermissionChecks idPrefix="new-manager" />
              </div>
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
