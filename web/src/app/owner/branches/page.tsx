import Link from 'next/link';
import { PackageIcon, PlusIcon, ReceiptIcon } from 'lucide-react';
import { BranchForm } from '@/components/branch-form';
import { ConsoleShell } from '@/components/console-shell';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '@/components/states';
import { SidePanel } from '@/components/side-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { day } from '@/lib/format';
import { isOwner, requireConsole } from '@/lib/api/guard';
import { fetchMyBranches } from '@/lib/api/organization';

export const dynamic = 'force-dynamic';

/**
 * The branch overview.
 *
 * `GET /branches` already scopes itself: an owner gets every branch of their
 * business, a manager gets only the ones they are assigned to. This page never
 * filters — it renders what the backend was willing to say.
 */
export default async function BranchesPage() {
  const { profile, token } = await requireConsole('owner');

  let branches;

  try {
    branches = await fetchMyBranches(token);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/branches" title="Matawi">
        <ErrorState error={error} retryHref="/owner/branches" />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/branches"
      title="Matawi"
      lede="Kila tawi lina stoo yake, simu zake na mauzo yake."
      actions={
        isOwner(profile) ? (
          <SidePanel
            trigger={
              <Button size="sm">
                <PlusIcon />
                Ongeza tawi · Add branch
              </Button>
            }
            title="Ongeza tawi · Add a branch"
          >
            <BranchForm />
          </SidePanel>
        ) : null
      }
    >
      <Panel title={`Matawi · Branches (${branches.length})`}>
        {branches.length === 0 ? (
          <EmptyState
            title="Hakuna tawi bado · No branches yet"
            hint="Ongeza tawi lako la kwanza kwa kitufe kilicho juu."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tawi · Branch</TableHead>
                <TableHead>Hali · Status</TableHead>
                <TableHead>Limeanzishwa · Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell>
                    <Badge variant={branch.isActive ? 'success' : 'warning'}>
                      {branch.isActive ? 'Hai · Active' : 'Imesimamishwa'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{day(branch.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <span className="flex justify-end gap-1.5">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/owner/sales?branch=${branch.id}`}>
                          <ReceiptIcon />
                          Mauzo
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/owner/stock?branch=${branch.id}`}>
                          <PackageIcon />
                          Stoo
                        </Link>
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {!isOwner(profile) ? (
        <Panel title="Ongeza tawi · Add a branch">
          <OwnerOnlyNote what="Kuongeza tawi · Adding a branch" />
        </Panel>
      ) : null}
    </ConsoleShell>
  );
}
