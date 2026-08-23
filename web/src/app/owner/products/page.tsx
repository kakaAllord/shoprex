import { ActionForm } from '../../../components/action-form';
import { ConsoleShell } from '../../../components/console-shell';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '../../../components/states';
import { priceOrUnpriced } from '../../../lib/format';
import { isOwner, requireConsole } from '../../../lib/api/guard';
import { PRODUCT_PAGE_LIMIT, fetchProducts, fetchUnitNames } from '../../../lib/api/products';
import {
  attachBarcodeAction,
  createProductAction,
  setProductActiveAction,
  setUnitPriceAction,
} from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Product management — the routes Phase 3 deliberately deferred to this
 * console, now with somewhere to use them.
 *
 * Two things this screen is careful about. A **price change never rewrites
 * history**: every completed sale snapshotted its own price, so repricing is
 * safe and the screen says so rather than leaving an owner to wonder.
 * **Discontinuing is not deleting**: the item leaves the selling screen and
 * cannot be sold or received, and everything it was part of stays exactly as
 * it was.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { profile, token } = await requireConsole('owner');
  const { q } = await searchParams;

  let products;
  let unitNames: string[] = [];

  try {
    [products, unitNames] = await Promise.all([
      fetchProducts(token, q),
      fetchUnitNames(token),
    ]);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/products" title="Bidhaa">
        <ErrorState error={error} retryHref="/owner/products" />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/products"
      title="Bidhaa · Products"
      lede="Bei ni moja kwa kila kipimo, kwa duka zima. Kubadilisha bei hakubadilishi risiti za zamani. One price per unit across the shop — changing it never rewrites a completed sale."
    >
      <Panel title="Tafuta · Search">
        <form className="shoprex-inlineform" action="/owner/products">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            className="shoprex-input"
            placeholder="Jina la bidhaa · Product name"
            aria-label="Tafuta bidhaa · Search products"
          />
          <button type="submit" className="shoprex-button">
            Tafuta · Search
          </button>
        </form>
      </Panel>

      <Panel title={`Bidhaa · Products (${products.length})`}>
        {products.length === 0 ? (
          <EmptyState
            title={
              q
                ? `Hakuna bidhaa yenye jina "${q}" · Nothing by that name`
                : 'Hakuna bidhaa bado · No products yet'
            }
            hint="Ongeza bidhaa hapa chini, au ongeza ikiwa kwenye simu wakati wa mauzo."
          />
        ) : (
          products.map((product) => (
            <details key={product.id} style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '6px 0' }}>
                {product.name}{' '}
                <span className="shoprex-note" style={{ display: 'inline', margin: 0 }}>
                  ·{' '}
                  {product.units
                    .map((unit) => `${unit.name} ${priceOrUnpriced(unit.priceTzs)}`)
                    .join(' · ')}
                </span>
              </summary>

              <div className="shoprex-tablewrap">
                <table className="shoprex-table">
                  <thead>
                    <tr>
                      <th>Kipimo · Unit</th>
                      <th className="shoprex-num">Bei · Price</th>
                      <th className="shoprex-num">Kwa kipimo cha msingi</th>
                      <th>Namba · Barcodes</th>
                      {isOwner(profile) ? <th>Bei mpya · New price</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {product.units.map((unit) => (
                      <tr key={unit.id}>
                        <td>
                          {unit.name}
                          {unit.isBaseUnit ? (
                            <span className="shoprex-sub">Kipimo cha msingi · Base unit</span>
                          ) : null}
                        </td>
                        <td className="shoprex-num">{priceOrUnpriced(unit.priceTzs)}</td>
                        <td className="shoprex-num">{unit.factorToBase}</td>
                        <td>
                          {unit.barcodes.length === 0 ? (
                            <span className="shoprex-note" style={{ margin: 0 }}>
                              —
                            </span>
                          ) : (
                            unit.barcodes.join(', ')
                          )}
                        </td>
                        {isOwner(profile) ? (
                          <td>
                            <ActionForm
                              action={setUnitPriceAction}
                              label="Weka · Set"
                              busyLabel="..."
                              variant="quiet"
                              inline
                            >
                              <input type="hidden" name="productId" value={product.id} />
                              <input type="hidden" name="unitId" value={unit.id} />
                              <input
                                type="number"
                                name="priceTzs"
                                min={0}
                                step={1}
                                required
                                defaultValue={unit.priceTzs ?? undefined}
                                className="shoprex-input"
                                style={{ maxWidth: 130 }}
                                aria-label={`Bei ya ${unit.name} · Price for ${unit.name}`}
                              />
                            </ActionForm>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isOwner(profile) ? (
                <div style={{ marginTop: 12 }}>
                  <span className="shoprex-label">
                    Unganisha namba ya bidhaa · Attach a barcode
                  </span>
                  <ActionForm
                    action={attachBarcodeAction}
                    label="Unganisha · Attach"
                    busyLabel="..."
                    variant="quiet"
                    inline
                  >
                    <input type="hidden" name="productId" value={product.id} />
                    <input
                      name="barcode"
                      className="shoprex-input"
                      placeholder="EAN-13"
                      inputMode="numeric"
                      aria-label="Namba ya bidhaa · Barcode"
                    />
                    <select
                      name="productUnitId"
                      className="shoprex-input"
                      aria-label="Kipimo · Which packaging"
                      defaultValue=""
                    >
                      <option value="">Bidhaa yenyewe · The product itself</option>
                      {product.units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                  </ActionForm>

                  <div style={{ marginTop: 12 }}>
                    <ActionForm
                      action={setProductActiveAction}
                      label={
                        product.isActive ? 'Sitisha · Discontinue' : 'Rudisha · Bring back'
                      }
                      busyLabel="..."
                      variant={product.isActive ? 'danger' : 'quiet'}
                      confirm={
                        product.isActive
                          ? `Sitisha "${product.name}"? Haitauzwa wala kupokelewa. Historia haiguswi. Discontinue it? It cannot be sold or received; history is untouched.`
                          : undefined
                      }
                    >
                      <input type="hidden" name="productId" value={product.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={product.isActive ? 'false' : 'true'}
                      />
                    </ActionForm>
                  </div>
                </div>
              ) : null}
            </details>
          ))
        )}

        {products.length === PRODUCT_PAGE_LIMIT ? (
          <p className="shoprex-note">
            Zinaonyeshwa {PRODUCT_PAGE_LIMIT} za kwanza tu. Tumia kisanduku cha kutafuta
            hapo juu kufikia zilizobaki. Only the first {PRODUCT_PAGE_LIMIT} are shown —
            use the search box above to reach the rest.
          </p>
        ) : null}

        <p className="shoprex-note">
          Bidhaa iliyositishwa haionekani hapa wala kwenye simu, lakini stoo yake bado
          inahesabika. A discontinued item leaves this list and the selling screen, and
          what is left on the shelf is still counted.
        </p>
      </Panel>

      <Panel title="Ongeza bidhaa · Add a product">
        {isOwner(profile) ? (
          <ActionForm
            action={createProductAction}
            label="Ongeza bidhaa · Add product"
            busyLabel="Inaongeza..."
          >
            <div className="shoprex-fieldgrid">
              <div className="shoprex-field">
                <label className="shoprex-label" htmlFor="product-name">
                  Jina · Name
                </label>
                <input
                  id="product-name"
                  name="name"
                  required
                  className="shoprex-input"
                  placeholder="Coca-Cola 500ml"
                />
              </div>
              <div className="shoprex-field">
                <label className="shoprex-label" htmlFor="product-unit">
                  Kipimo · Unit
                </label>
                <input
                  id="product-unit"
                  name="unitName"
                  required
                  list="shoprex-unit-names"
                  className="shoprex-input"
                  placeholder="Kipande"
                />
                <datalist id="shoprex-unit-names">
                  {unitNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="shoprex-field">
                <label className="shoprex-label" htmlFor="product-price">
                  Bei · Price{' '}
                  <span className="shoprex-optional">(si lazima · optional)</span>
                </label>
                <input
                  id="product-price"
                  name="priceTzs"
                  type="number"
                  min={0}
                  step={1}
                  className="shoprex-input"
                  placeholder="1000"
                />
              </div>
              <div className="shoprex-field">
                <label className="shoprex-label" htmlFor="product-barcode">
                  Namba · Barcode{' '}
                  <span className="shoprex-optional">(si lazima · optional)</span>
                </label>
                <input
                  id="product-barcode"
                  name="barcode"
                  inputMode="numeric"
                  className="shoprex-input"
                  placeholder="EAN-13"
                />
              </div>
            </div>

            <p className="shoprex-note" style={{ margin: '0 0 12px' }}>
              Jina na kipimo kimoja vinatosha. Bei, namba, na vipimo vingine vinaweza kuja
              baadaye. A name and one unit is enough — a price, a barcode, and further
              packagings can all arrive later.
            </p>
          </ActionForm>
        ) : (
          <OwnerOnlyNote what="Kuongeza bidhaa, kubadilisha bei na kuunganisha namba · Adding products, changing prices, and attaching barcodes" />
        )}
      </Panel>
    </ConsoleShell>
  );
}
