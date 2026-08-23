import { ActionForm } from '../../components/action-form';
import { ConsoleHeader } from '../../components/console-header';
import { EmptyState, ErrorState, Panel } from '../../components/states';
import { day } from '../../lib/format';
import { requireConsole } from '../../lib/api/guard';
import { fetchAllBusinesses } from '../../lib/api/organization';
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
      <main className="shoprex-shell shoprex-shell--wide">
        <ConsoleHeader profile={profile} />
        <h1 className="shoprex-title">Maduka yote</h1>
        <ErrorState error={error} retryHref="/admin" />
      </main>
    );
  }

  const suspended = businesses.filter((business) => !business.isActive);

  return (
    <main className="shoprex-shell shoprex-shell--wide">
      <ConsoleHeader profile={profile} />

      <h1 className="shoprex-title">Maduka yote · Shop accounts</h1>
      <p className="shoprex-lede">
        Akaunti za maduka kwenye jukwaa la Shoprex. Kufungua duka jipya na mmiliki wake,
        na kusimamisha au kurudisha akaunti. Shop accounts on the platform — onboarding,
        suspension, and restoration.
      </p>

      <div className="shoprex-metrics">
        <div className="shoprex-metric">
          <div className="shoprex-metric__value">{businesses.length}</div>
          <div className="shoprex-metric__label">Maduka · Shops</div>
        </div>
        <div className="shoprex-metric">
          <div className="shoprex-metric__value">{businesses.length - suspended.length}</div>
          <div className="shoprex-metric__label">Hai · Active</div>
        </div>
        <div className="shoprex-metric">
          <div className="shoprex-metric__value">{suspended.length}</div>
          <div className="shoprex-metric__label">Zimesimamishwa · Suspended</div>
        </div>
      </div>

      <Panel title={`Maduka · Businesses (${businesses.length})`}>
        {businesses.length === 0 ? (
          <EmptyState
            title="Hakuna duka bado · No shops yet"
            hint="Fungua duka la kwanza hapa chini, au subiri mmiliki ajisajili mwenyewe."
          />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Duka · Business</th>
                  <th className="shoprex-num">Matawi</th>
                  <th className="shoprex-num">Watumiaji</th>
                  <th>Saa za eneo</th>
                  <th>Limefunguliwa · Created</th>
                  <th>Hali · Status</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => (
                  <tr
                    key={business.id}
                    className={business.isActive ? undefined : 'shoprex-warnrow'}
                  >
                    <td>{business.name}</td>
                    <td className="shoprex-num">{business.branchCount}</td>
                    <td className="shoprex-num">{business.userCount}</td>
                    <td>{business.timezone}</td>
                    <td>{day(business.createdAt)}</td>
                    <td>
                      <span
                        className={
                          business.isActive
                            ? 'shoprex-status shoprex-status--ok'
                            : 'shoprex-status shoprex-status--warn'
                        }
                      >
                        {business.isActive ? 'Hai · Active' : 'Imesimamishwa · Suspended'}
                      </span>
                    </td>
                    <td>
                      <ActionForm
                        action={setBusinessActiveAction}
                        label={
                          business.isActive
                            ? 'Simamisha · Suspend'
                            : 'Rudisha · Restore'
                        }
                        busyLabel="..."
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="shoprex-note">
          Kusimamisha hakufuti chochote. Bidhaa, stoo, mauzo na historia yote hubaki kama
          ilivyo, na duka hurudi zima likirudishwa. Suspension deletes nothing — the shop
          comes back whole.
        </p>
      </Panel>

      <Panel title="Fungua duka jipya · Onboard a shop">
        <ActionForm
          action={createBusinessAction}
          label="Fungua duka · Create shop"
          busyLabel="Inafungua..."
        >
          <div className="shoprex-fieldgrid">
            <div className="shoprex-field">
              <label className="shoprex-label" htmlFor="shop-name">
                Jina la duka · Shop name
              </label>
              <input
                id="shop-name"
                name="name"
                required
                minLength={2}
                className="shoprex-input"
                placeholder="Duka la Mfano"
              />
            </div>
            <div className="shoprex-field">
              <label className="shoprex-label" htmlFor="owner-name">
                Jina la mmiliki · Owner name
              </label>
              <input
                id="owner-name"
                name="ownerFullName"
                required
                minLength={2}
                className="shoprex-input"
                placeholder="Asha Mwakalinga"
              />
            </div>
            <div className="shoprex-field">
              <label className="shoprex-label" htmlFor="owner-email">
                Barua pepe ya mmiliki · Owner email
              </label>
              <input
                id="owner-email"
                name="ownerEmail"
                type="email"
                required
                className="shoprex-input"
                placeholder="mmiliki@duka.co.tz"
              />
            </div>
            <div className="shoprex-field">
              <label className="shoprex-label" htmlFor="owner-password">
                Nenosiri la kwanza · First password
              </label>
              <input
                id="owner-password"
                name="ownerPassword"
                type="password"
                required
                minLength={8}
                className="shoprex-input"
              />
            </div>
          </div>

          <p className="shoprex-note" style={{ margin: '0 0 12px' }}>
            Duka na mmiliki wake hufunguliwa pamoja, na njia tatu za malipo huwekwa mara
            moja — Taslimu, Pesa ya simu, na Deni. The shop, its owner, and its three
            default payment methods are created together, so a new shop can take money
            from its first minute.
          </p>
        </ActionForm>
      </Panel>
    </main>
  );
}
