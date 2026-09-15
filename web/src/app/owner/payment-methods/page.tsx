import { ActionForm } from '@/components/action-form';
import { ConsoleShell } from '@/components/console-shell';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '@/components/states';
import { Field } from '@/components/field';
import { NativeSelect } from '@/components/native-select';
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
import { isOwner, requireConsole } from '@/lib/api/guard';
import { ALL_KINDS, KIND_LABELS, fetchPaymentMethods } from '@/lib/api/payment-methods';
import { createPaymentMethodAction, renameMethodAction, setMethodActiveAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Payment-method settings — a named Phase 6 deliverable, and the first screen
 * for routes that did not exist before this phase.
 *
 * Three things it is careful to say out loud, because each is a rule somebody
 * would otherwise discover by being surprised:
 *
 *  - **Switching `Deni` off is how a shop stops selling on credit**, and it is
 *    enforced at the backend. A phone still holding the old list is refused,
 *    not merely missing a button.
 *  - **Nothing is ever deleted.** A method that has settled a sale cannot go
 *    without taking that receipt's meaning with it.
 *  - **The kind is fixed at creation**, because it decides the arithmetic —
 *    only cash gives change, only debt takes a name.
 */
export default async function PaymentMethodsPage() {
  const { profile, token } = await requireConsole('owner');

  if (!isOwner(profile)) {
    return (
      <ConsoleShell
        profile={profile}
        current="/owner/payment-methods"
        title="Njia za malipo"
      >
        <Panel title="Malipo · Payments">
          <OwnerOnlyNote what="Kupanga njia za malipo · Configuring how the shop is paid" />
        </Panel>
      </ConsoleShell>
    );
  }

  let methods;

  try {
    methods = await fetchPaymentMethods(token, true);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/payment-methods" title="Njia za malipo">
        <ErrorState error={error} retryHref="/owner/payment-methods" />
      </ConsoleShell>
    );
  }

  const active = methods.filter((method) => method.isActive);

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/payment-methods"
      title="Njia za malipo"
      lede="Hizi ndizo vitufe vinavyotokea kwenye simu wakati wa kulipa. Zilizozimwa hazionekani huko kabisa."
    >
      <Panel
        title={`Njia · Methods (${active.length} hai · active)`}
        description="Hakuna kufuta — njia iliyowahi kulipia mauzo haiwezi kuondolewa bila kuharibu maana ya risiti zile. Kuizima ndiyo njia sahihi."
      >
        {methods.length === 0 ? (
          <EmptyState title="Hakuna njia ya malipo · No payment methods" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jina · Name</TableHead>
                <TableHead>Aina · Kind</TableHead>
                <TableHead>Hali · Status</TableHead>
                <TableHead>Badilisha jina · Rename</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map((method) => (
                <TableRow key={method.id}>
                  <TableCell className="font-medium">{method.name}</TableCell>
                  <TableCell>
                    <span className="block">{KIND_LABELS[method.kind].split(' — ')[0]}</span>
                    <span className="block text-xs text-muted-foreground">
                      Haibadiliki · fixed at creation
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={method.isActive ? 'success' : 'warning'}>
                      {method.isActive ? 'Hai · On' : 'Imezimwa · Off'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ActionForm
                      action={renameMethodAction}
                      label="Hifadhi"
                      busyLabel="..."
                      variant="quiet"
                      inline
                    >
                      <input type="hidden" name="methodId" value={method.id} />
                      <Input
                        name="name"
                        defaultValue={method.name}
                        className="w-40"
                        aria-label={`Jina jipya la ${method.name}`}
                      />
                    </ActionForm>
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionForm
                      action={setMethodActiveAction}
                      label={method.isActive ? 'Zima · Switch off' : 'Washa · Switch on'}
                      busyLabel="..."
                      className="items-end"
                      variant={method.isActive ? 'danger' : 'quiet'}
                      confirm={
                        method.isActive
                          ? `Zima "${method.name}"? Haitatokea tena kwenye simu, na malipo kwa njia hii yatakataliwa. Switch it off? The phone stops offering it and the backend refuses it.`
                          : undefined
                      }
                    >
                      <input type="hidden" name="methodId" value={method.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={method.isActive ? 'false' : 'true'}
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
        title="Ongeza njia · Add a method"
        description="Aina huamua hesabu, si jina tu: taslimu pekee ndiyo hutoa chenji, na deni pekee ndilo huandika jina la mdaiwa. Haiwezi kubadilishwa baadaye."
      >
        <ActionForm
          action={createPaymentMethodAction}
          label="Ongeza njia · Add method"
          busyLabel="Inaongeza..."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field htmlFor="method-name" label="Jina · Name">
              <Input id="method-name" name="name" required placeholder="M-Pesa" />
            </Field>
            <Field htmlFor="method-kind" label="Aina · Kind">
              <NativeSelect id="method-kind" name="kind" required>
                {ALL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </ActionForm>
      </Panel>
    </ConsoleShell>
  );
}
