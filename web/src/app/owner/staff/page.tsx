import { ConsoleShell } from '@/components/console-shell';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '@/components/states';
import { AddStaffPanel } from '@/components/staff-add-panel';
import { StaffEditPanel } from '@/components/staff-edit-panel';
import { Badge } from '@/components/ui/badge';
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

  // Managers run the shop day to day; workers sell at the counter. Reading
  // the table top to bottom should read the same way.
  const sortedStaff = [...staff].sort((a, b) => Number(a.role === 'WORKER') - Number(b.role === 'WORKER'));

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/staff"
      title="Wafanyakazi"
      lede="Mfanyakazi huingia kwenye simu ya tawi lake; meneja huingia hapa kwa barua pepe."
      actions={isOwner(profile) ? <AddStaffPanel branches={branches} /> : null}
    >
      <Panel title={`Watu · People (${staff.length})`}>
        {staff.length === 0 ? (
          <EmptyState
            title="Hakuna mfanyakazi bado · Nobody yet"
            hint="Ongeza mfanyakazi wa kwanza kwa kitufe kilicho juu, kisha mpe msimbo wa simu."
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
                {isOwner(profile) ? <TableHead className="text-right">Badilisha</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStaff.map((person) => (
                <TableRow key={person.id}>
                  <TableCell>
                    <span className="font-medium">{person.fullName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {person.email ?? 'Huingia kwenye simu · Signs in on a phone'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">
                        {person.role === 'MANAGER' ? 'Meneja' : 'Mfanyakazi'}
                      </Badge>
                      {/*
                        Said on the row rather than by greying it out. A dimmed
                        row reads as "broken"; a word reads as "this person has
                        left", which is what actually happened.
                      */}
                      {!person.isActive ? <Badge variant="warning">Amesimamishwa</Badge> : null}
                    </span>
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
                  {isOwner(profile) ? (
                    <TableCell className="text-right">
                      <StaffEditPanel person={person} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {!isOwner(profile) ? (
        <Panel title="Kuongeza watu · Adding people">
          <OwnerOnlyNote what="Kuongeza wafanyakazi na kubadilisha ruhusa · Adding staff and changing permissions" />
        </Panel>
      ) : null}
    </ConsoleShell>
  );
}
