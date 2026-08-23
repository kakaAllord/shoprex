import { ActionForm } from '../../../components/action-form';
import { ConsoleShell } from '../../../components/console-shell';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '../../../components/states';
import { isOwner, requireConsole } from '../../../lib/api/guard';
import {
  ALL_KINDS,
  KIND_LABELS,
  fetchPaymentMethods,
} from '../../../lib/api/payment-methods';
import {
  createPaymentMethodAction,
  renameMethodAction,
  setMethodActiveAction,
} from '../actions';

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
        title="Njia za malipo · Payment methods"
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
      <ConsoleShell
        profile={profile}
        current="/owner/payment-methods"
        title="Njia za malipo"
      >
        <ErrorState error={error} retryHref="/owner/payment-methods" />
      </ConsoleShell>
    );
  }

  const active = methods.filter((method) => method.isActive);

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/payment-methods"
      title="Njia za malipo · Payment methods"
      lede="Hizi ndizo vitufe vinavyotokea kwenye simu wakati wa kulipa. Zilizozimwa hazionekani huko kabisa. These are the buttons the phone shows at checkout — a switched-off method does not appear there at all."
    >
      <Panel title={`Njia · Methods (${active.length} hai · active)`}>
        {methods.length === 0 ? (
          <EmptyState title="Hakuna njia ya malipo · No payment methods" />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Jina · Name</th>
                  <th>Aina · Kind</th>
                  <th>Hali · Status</th>
                  <th>Badilisha jina · Rename</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((method) => (
                  <tr key={method.id} className={method.isActive ? undefined : 'shoprex-warnrow'}>
                    <td>{method.name}</td>
                    <td>
                      {KIND_LABELS[method.kind].split(' — ')[0]}
                      <span className="shoprex-sub">
                        Haibadiliki · Fixed at creation
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          method.isActive
                            ? 'shoprex-status shoprex-status--ok'
                            : 'shoprex-status shoprex-status--warn'
                        }
                      >
                        {method.isActive ? 'Hai · On' : 'Imezimwa · Off'}
                      </span>
                    </td>
                    <td>
                      <ActionForm
                        action={renameMethodAction}
                        label="Hifadhi · Save"
                        busyLabel="..."
                        variant="quiet"
                        inline
                      >
                        <input type="hidden" name="methodId" value={method.id} />
                        <input
                          name="name"
                          defaultValue={method.name}
                          className="shoprex-input"
                          style={{ maxWidth: 160 }}
                          aria-label={`Jina jipya la ${method.name}`}
                        />
                      </ActionForm>
                    </td>
                    <td>
                      <ActionForm
                        action={setMethodActiveAction}
                        label={method.isActive ? 'Zima · Switch off' : 'Washa · Switch on'}
                        busyLabel="..."
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="shoprex-note">
          Hakuna kufuta. Njia iliyowahi kutumika kulipia mauzo haiwezi kuondolewa bila
          kuharibu maana ya risiti zile — kuizima ndiyo njia sahihi, na ndiyo ukweli
          wenyewe: duka limeacha kuipokea, halijaacha kuwa liliwahi kuipokea. There is no
          delete, by design.
        </p>
      </Panel>

      <Panel title="Ongeza njia · Add a method">
        <ActionForm
          action={createPaymentMethodAction}
          label="Ongeza njia · Add method"
          busyLabel="Inaongeza..."
        >
          <div className="shoprex-fieldgrid">
            <div className="shoprex-field">
              <label className="shoprex-label" htmlFor="method-name">
                Jina · Name
              </label>
              <input
                id="method-name"
                name="name"
                required
                className="shoprex-input"
                placeholder="M-Pesa"
              />
            </div>
            <div className="shoprex-field">
              <label className="shoprex-label" htmlFor="method-kind">
                Aina · Kind
              </label>
              <select id="method-kind" name="kind" required className="shoprex-input">
                {ALL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="shoprex-note" style={{ margin: '0 0 12px' }}>
            Aina huamua hesabu, si jina tu: taslimu pekee ndiyo hutoa chenji, na deni
            pekee ndilo huandika jina la mdaiwa. Haiwezi kubadilishwa baadaye. The kind
            decides the arithmetic, not just the label, and cannot be changed later.
          </p>
        </ActionForm>
      </Panel>
    </ConsoleShell>
  );
}
