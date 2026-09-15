import { TriangleAlertIcon } from 'lucide-react';
import { BranchPicker } from '@/components/branch-picker';
import { ConsoleShell } from '@/components/console-shell';
import { EmptyState, ErrorState, Panel } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireConsole } from '@/lib/api/guard';
import { fetchMyBranches } from '@/lib/api/organization';
import { describePackages, fetchBranchStock, needsRecount } from '@/lib/api/stock';

export const dynamic = 'force-dynamic';

/**
 * What a branch holds, in packages.
 *
 * `5 Carton + 5 Piece`, never `35` and never `9.67 Cartons`. The normalized
 * figure the engine reckons in is deliberately not shown: doc 02 keeps
 * normalized mathematics away from the shop floor unless it explains an
 * operational outcome, and "what is on the shelf" is not one of those.
 *
 * A **negative balance is shown, counted, and named** rather than hidden. The
 * negative-stock policy exists to make a wrong count findable, and hiding it
 * on the one screen somebody would open to find it would defeat the policy.
 * It is amber rather than red for the same reason: nothing is broken, a count
 * is wrong.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { profile, token } = await requireConsole('owner');
  const { branch } = await searchParams;

  let branches;

  try {
    branches = await fetchMyBranches(token);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/stock" title="Stoo">
        <ErrorState error={error} retryHref="/owner/stock" />
      </ConsoleShell>
    );
  }

  if (branches.length === 0) {
    return (
      <ConsoleShell profile={profile} current="/owner/stock" title="Stoo · Stock">
        <EmptyState
          title="Huna tawi bado · No branch yet"
          hint="Stoo ni ya tawi, kwa hivyo ongeza tawi kwanza."
        />
      </ConsoleShell>
    );
  }

  const selected = branches.find((candidate) => candidate.id === branch) ?? branches[0];

  let stock;

  try {
    stock = await fetchBranchStock(token, selected.id);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/stock" title="Stoo · Stock">
        <BranchPicker branches={branches} selected={selected.id} basePath="/owner/stock" />
        <ErrorState error={error} retryHref={`/owner/stock?branch=${selected.id}`} />
      </ConsoleShell>
    );
  }

  const wrong = stock.filter(needsRecount);

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/stock"
      title="Stoo"
      lede={`Kilichopo ${selected.name}, katika vifurushi kama vilivyo rafuni.`}
      actions={
        <BranchPicker branches={branches} selected={selected.id} basePath="/owner/stock" />
      }
    >
      {wrong.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <div className="flex flex-col gap-1">
            <AlertTitle>
              Bidhaa {wrong.length} zinahitaji kuhesabiwa upya · {wrong.length} item
              {wrong.length === 1 ? '' : 's'} need recounting
            </AlertTitle>
            <AlertDescription>
              Idadi hasi maana yake kiliuzwa zaidi ya kilichoandikwa — si kosa la mfumo, ni hesabu
              iliyokosewa mahali fulani.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      <Panel title={`Stoo ya ${selected.name}`} description={`${stock.length} bidhaa · products`}>
        {stock.length === 0 ? (
          <EmptyState
            title="Stoo ni tupu · Nothing on the shelf"
            hint="Pokea mzigo kwenye simu ili kuanza · Receive a delivery on the phone to start."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bidhaa · Product</TableHead>
                <TableHead>Kilichopo · On the shelf</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((entry) => (
                <TableRow key={entry.productId}>
                  <TableCell className="font-medium">
                    <span className="flex flex-wrap items-center gap-2">
                      {entry.productName}
                      {needsRecount(entry) ? (
                        <Badge variant="warning">
                          <TriangleAlertIcon />
                          hesabu upya
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="tabular">{describePackages(entry.packages)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </ConsoleShell>
  );
}
