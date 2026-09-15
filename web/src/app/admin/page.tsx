import { ActionForm } from '@/components/action-form';
import { AdminShell } from '@/components/admin-shell';
import { EmptyState, ErrorState, Panel } from '@/components/states';
import { StatCard } from '@/components/stat-card';
import { Field } from '@/components/field';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { day } from '@/lib/format';
import { requireConsole } from '@/lib/api/guard';
import { fetchAllBusinesses } from '@/lib/api/organization';
import { createBusinessAction, setBusinessActiveAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The platform administrator's console: every shop account on Shoprex.
 *
 * Two actions, and both are deliberately the whole of it. Onboarding creates a
 * shop and its first owner together, so an account is never left existing but
 * unusable. Suspension locks a shop in every direction at once — nobody signs
 * in, no phone enrols, and existing session tokens die on their next request —
 * **without deleting anything**, which is what makes it safe to do and safe to
 * undo.
 *
 * There is no shop *editing* here on purpose. Renaming a shop, moving its
 * timezone, or changing what it sells is the owner's business, and a platform
 * screen that could do it would be a screen that could do it by accident.
 */
export default async function AdminPage() {
  const { profile, token } = await requireConsole('admin');

  let businesses;

  try {
    businesses = await fetchAllBusinesses(token);
  } catch (error) {
    return (
      <AdminShell profile={profile} title="Maduka yote">
        <ErrorState error={error} retryHref="/admin" />
      </AdminShell>
    );
  }

  const suspended = businesses.filter((business) => !business.isActive);

  return (
    <AdminShell
      profile={profile}
      title="Maduka yote · Shop accounts"
      lede="Akaunti za maduka kwenye jukwaa la Shoprex — kufungua duka jipya na mmiliki wake, na kusimamisha au kurudisha akaunti."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Maduka · Shops" value={businesses.length} />
        <StatCard label="Hai · Active" value={businesses.length - suspended.length} />
        <StatCard
          label="Zimesimamishwa · Suspended"
          value={suspended.length}
          tone={suspended.length > 0 ? 'owed' : 'default'}
        />
      </div>

      <Panel
        title={`Maduka · Businesses (${businesses.length})`}
        description="Kusimamisha hakufuti chochote — bidhaa, stoo, mauzo na historia hubaki, na duka hurudi zima likirudishwa."
      >
        {businesses.length === 0 ? (
          <EmptyState
            title="Hakuna duka bado · No shops yet"
            hint="Fungua duka la kwanza hapa chini, au subiri mmiliki ajisajili mwenyewe."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Duka · Business</TableHead>
                <TableHead className="text-right">Matawi</TableHead>
                <TableHead className="text-right">Watumiaji</TableHead>
                <TableHead>Saa za eneo</TableHead>
                <TableHead>Limefunguliwa</TableHead>
                <TableHead>Hali · Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {businesses.map((business) => (
                <TableRow key={business.id}>
                  <TableCell className="font-medium">{business.name}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">{business.branchCount}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">{business.userCount}</TableCell>
                  <TableCell className="text-muted-foreground">{business.timezone}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {day(business.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={business.isActive ? 'success' : 'warning'}>
                      {business.isActive ? 'Hai · Active' : 'Imesimamishwa'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionForm
                      action={setBusinessActiveAction}
                      label={business.isActive ? 'Simamisha · Suspend' : 'Rudisha · Restore'}
                      busyLabel="..."
                      className="items-end"
                      variant={business.isActive ? 'danger' : 'quiet'}
                      confirm={
                        business.isActive
                          ? `Simamisha "${business.name}"? Hakuna atakayeweza kuingia, simu zote zitakataliwa, na hata vipindi vilivyofunguliwa vitakatishwa mara moja. Hakuna kinachofutwa. Suspend this shop? Everyone is locked out immediately — nothing is deleted.`
                          : undefined
                      }
                    >
                      <input type="hidden" name="businessId" value={business.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={business.isActive ? 'false' : 'true'}
                      />
                    </ActionForm>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        title="Fungua duka jipya · Onboard a shop"
        description="Duka na mmiliki wake hufunguliwa pamoja, na njia tatu za malipo huwekwa mara moja — Taslimu, Pesa ya simu, na Deni."
      >
        <ActionForm
          action={createBusinessAction}
          label="Fungua duka · Create shop"
          busyLabel="Inafungua..."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field htmlFor="shop-name" label="Jina la duka · Shop name">
              <Input id="shop-name" name="name" required minLength={2} placeholder="Duka la Mfano" />
            </Field>
            <Field htmlFor="owner-name" label="Jina la mmiliki · Owner name">
              <Input
                id="owner-name"
                name="ownerFullName"
                required
                minLength={2}
                placeholder="Asha Mwakalinga"
              />
            </Field>
            <Field htmlFor="owner-email" label="Barua pepe ya mmiliki · Owner email">
              <Input
                id="owner-email"
                name="ownerEmail"
                type="email"
                required
                placeholder="mmiliki@duka.co.tz"
              />
            </Field>
            <Field htmlFor="owner-password" label="Nenosiri la kwanza · First password">
              <Input
                id="owner-password"
                name="ownerPassword"
                type="password"
                required
                minLength={8}
              />
            </Field>
          </div>
        </ActionForm>
      </Panel>
    </AdminShell>
  );
}
