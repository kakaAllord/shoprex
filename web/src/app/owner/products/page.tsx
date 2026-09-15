import { SearchIcon } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { ConsoleShell } from '@/components/console-shell';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '@/components/states';
import { Field } from '@/components/field';
import { NativeSelect } from '@/components/native-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { priceOrUnpriced } from '@/lib/format';
import { isOwner, requireConsole } from '@/lib/api/guard';
import { PRODUCT_PAGE_LIMIT, fetchProducts, fetchUnitNames } from '@/lib/api/products';
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
    [products, unitNames] = await Promise.all([fetchProducts(token, q), fetchUnitNames(token)]);
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
      title="Bidhaa"
      lede="Bei ni moja kwa kila kipimo, kwa duka zima. Kubadilisha bei hakubadilishi risiti za zamani."
      actions={
        <form action="/owner/products" className="flex items-center gap-2">
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Tafuta bidhaa · Search"
            aria-label="Tafuta bidhaa · Search products"
            className="w-44 sm:w-56"
          />
          <Button type="submit" variant="outline" size="icon">
            <SearchIcon />
            <span className="sr-only">Tafuta · Search</span>
          </Button>
        </form>
      }
    >
      <Panel
        title={`Bidhaa · Products (${products.length})`}
        description="Bidhaa iliyositishwa haionekani hapa wala kwenye simu, lakini stoo yake bado inahesabika."
      >
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
          <div className="divide-y">
            {products.map((product) => (
              <details key={product.id} className="group py-2 first:pt-0">
                <summary className="cursor-pointer list-none py-1 marker:hidden">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="text-muted-foreground transition-transform group-open:rotate-90">
                      ›
                    </span>
                    <span className="font-medium">{product.name}</span>
                    {!product.isActive ? <Badge variant="warning">Imesitishwa</Badge> : null}
                    <span className="text-xs text-muted-foreground">
                      {product.units
                        .map((unit) => `${unit.name} ${priceOrUnpriced(unit.priceTzs)}`)
                        .join(' · ')}
                    </span>
                  </span>
                </summary>

                <div className="flex flex-col gap-4 pb-3 pl-5 pt-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kipimo · Unit</TableHead>
                        <TableHead className="text-right">Bei · Price</TableHead>
                        <TableHead className="text-right">Kwa msingi</TableHead>
                        <TableHead>Namba · Barcodes</TableHead>
                        {isOwner(profile) ? <TableHead>Bei mpya · New price</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {product.units.map((unit) => (
                        <TableRow key={unit.id}>
                          <TableCell>
                            <span className="font-medium">{unit.name}</span>
                            {unit.isBaseUnit ? (
                              <span className="block text-xs text-muted-foreground">
                                Kipimo cha msingi · base unit
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="tabular text-right">
                            {priceOrUnpriced(unit.priceTzs)}
                          </TableCell>
                          <TableCell className="tabular text-right">{unit.factorToBase}</TableCell>
                          <TableCell className="tabular text-muted-foreground">
                            {unit.barcodes.length === 0 ? '—' : unit.barcodes.join(', ')}
                          </TableCell>
                          {isOwner(profile) ? (
                            <TableCell>
                              <ActionForm
                                action={setUnitPriceAction}
                                label="Weka"
                                busyLabel="..."
                                variant="quiet"
                                inline
                              >
                                <input type="hidden" name="productId" value={product.id} />
                                <input type="hidden" name="unitId" value={unit.id} />
                                <Input
                                  type="number"
                                  name="priceTzs"
                                  min={0}
                                  step={1}
                                  required
                                  defaultValue={unit.priceTzs ?? undefined}
                                  className="w-28"
                                  aria-label={`Bei ya ${unit.name} · Price for ${unit.name}`}
                                />
                              </ActionForm>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {isOwner(profile) ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2">
                        <Label>Unganisha namba ya bidhaa · Attach a barcode</Label>
                        <ActionForm
                          action={attachBarcodeAction}
                          label="Unganisha · Attach"
                          busyLabel="..."
                          variant="quiet"
                          inline
                        >
                          <input type="hidden" name="productId" value={product.id} />
                          <Input
                            name="barcode"
                            placeholder="EAN-13"
                            inputMode="numeric"
                            className="w-40"
                            aria-label="Namba ya bidhaa · Barcode"
                          />
                          <NativeSelect
                            name="productUnitId"
                            aria-label="Kipimo · Which packaging"
                            defaultValue=""
                            className="w-auto"
                          >
                            <option value="">Bidhaa yenyewe · the product itself</option>
                            {product.units.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {unit.name}
                              </option>
                            ))}
                          </NativeSelect>
                        </ActionForm>
                      </div>

                      <ActionForm
                        action={setProductActiveAction}
                        label={product.isActive ? 'Sitisha · Discontinue' : 'Rudisha · Bring back'}
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
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        )}

        {products.length === PRODUCT_PAGE_LIMIT ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Zinaonyeshwa {PRODUCT_PAGE_LIMIT} za kwanza tu. Tumia kisanduku cha kutafuta hapo juu
            kufikia zilizobaki · only the first {PRODUCT_PAGE_LIMIT} are shown.
          </p>
        ) : null}
      </Panel>

      <Panel
        title="Ongeza bidhaa · Add a product"
        description="Jina na kipimo kimoja vinatosha. Bei, namba, na vipimo vingine vinaweza kuja baadaye."
      >
        {isOwner(profile) ? (
          <ActionForm
            action={createProductAction}
            label="Ongeza bidhaa · Add product"
            busyLabel="Inaongeza..."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field htmlFor="product-name" label="Jina · Name">
                <Input id="product-name" name="name" required placeholder="Coca-Cola 500ml" />
              </Field>

              <Field htmlFor="product-unit" label="Kipimo · Unit">
                <Input
                  id="product-unit"
                  name="unitName"
                  required
                  list="shoprex-unit-names"
                  placeholder="Kipande"
                />
                <datalist id="shoprex-unit-names">
                  {unitNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </Field>

              <Field htmlFor="product-price" label="Bei · Price" hint="Si lazima · optional">
                <Input
                  id="product-price"
                  name="priceTzs"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="1000"
                />
              </Field>

              <Field htmlFor="product-barcode" label="Namba · Barcode" hint="Si lazima · optional">
                <Input
                  id="product-barcode"
                  name="barcode"
                  inputMode="numeric"
                  placeholder="EAN-13"
                />
              </Field>
            </div>
          </ActionForm>
        ) : (
          <OwnerOnlyNote what="Kuongeza bidhaa, kubadilisha bei na kuunganisha namba · Adding products, changing prices, and attaching barcodes" />
        )}
      </Panel>
    </ConsoleShell>
  );
}
