/**
 * The cart, as arithmetic rather than as a screen.
 *
 * A cart is the one piece of selling logic that genuinely lives on the phone:
 * the backend never sees a cart, only the finished sale. So the rules that
 * decide what a scan does live here, as pure functions over a plain array,
 * and the Mauzo screen only renders what they return.
 *
 * Three rules from doc 02 §6, and they are the whole module:
 *
 * - **One sellable unit means add it immediately, at quantity 1.** A shop that
 *   only sells Pieces should never be asked "which unit?" — there is only one
 *   answer, and asking costs a tap on every single sale.
 * - **A repeated scan increments the line already there.** Scanning the same
 *   bottle four times is four bottles, not four lines.
 * - **The same product in two units stays two lines.** `2 Cartons` and
 *   `5 Pieces` are what went over the counter, and the receipt has to say so
 *   even though their normalized quantities could be added up.
 *
 * Totals are computed the same way the backend computes them — `quantity ×
 * unit_price`, whole shillings — so the number on the phone and the number in
 * the receipt cannot disagree. The backend remains authoritative; this is what
 * the customer is shown while deciding.
 */

/** A unit of a product as the API describes it. */
export interface SellableUnit {
  id: string;
  name: string;
  /** Whole Tanzanian shillings. Null means the shop has not priced it yet. */
  priceTzs: number | null;
  factorToBase: number;
}

export interface SellableProduct {
  id: string;
  name: string;
  units: SellableUnit[];
}

export interface CartLine {
  productId: string;
  productName: string;
  unitId: string;
  unitName: string;
  unitPriceTzs: number;
  quantity: number;
}

export type Cart = readonly CartLine[];

export class CartError extends Error {}

export const emptyCart: Cart = [];

/**
 * The units of a product that can actually be put in a cart.
 *
 * A unit with no price is not sellable — doc 01 §5 lets a product exist before
 * it is fully configured, but a price is the one thing a sale cannot invent,
 * and the backend refuses it too.
 */
export function sellableUnits(product: SellableProduct): SellableUnit[] {
  return product.units.filter((unit) => unit.priceTzs !== null);
}

/**
 * What should happen when a product is scanned or picked.
 *
 * `add` when there is exactly one sellable unit, so the caller adds it without
 * a prompt; `choose` when there are several and the seller must say which;
 * `unpriced` when the shop has not priced any of them yet, which is a real
 * outcome on a product someone created mid-sale and has not finished.
 */
export type Resolution =
  | { kind: 'add'; unit: SellableUnit }
  | { kind: 'choose'; units: SellableUnit[] }
  | { kind: 'unpriced' };

export function resolveUnit(product: SellableProduct): Resolution {
  const units = sellableUnits(product);

  if (units.length === 0) {
    return { kind: 'unpriced' };
  }

  if (units.length === 1) {
    return { kind: 'add', unit: units[0] };
  }

  // Largest packaging first: a Carton is a more likely deliberate choice than
  // the Piece the arithmetic happens to be based on.
  return {
    kind: 'choose',
    units: [...units].sort((a, b) => b.factorToBase - a.factorToBase),
  };
}

/**
 * Adds a product in a given unit, or increments the line already holding it.
 *
 * Returns a new cart. Nothing here mutates, so a screen can hold the previous
 * cart and a failed step cannot leave a half-changed one behind.
 */
export function addToCart(
  cart: Cart,
  product: SellableProduct,
  unitId: string,
  quantity = 1,
): Cart {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new CartError('A quantity must be a whole number of at least 1');
  }

  const unit = product.units.find((candidate) => candidate.id === unitId);

  if (!unit) {
    throw new CartError('That unit does not belong to this product');
  }

  if (unit.priceTzs === null) {
    throw new CartError(`Weka bei ya ${unit.name} kwanza · ${unit.name} has no price yet`);
  }

  const index = cart.findIndex(
    (line) => line.productId === product.id && line.unitId === unitId,
  );

  if (index === -1) {
    return [
      ...cart,
      {
        productId: product.id,
        productName: product.name,
        unitId: unit.id,
        unitName: unit.name,
        unitPriceTzs: unit.priceTzs,
        quantity,
      },
    ];
  }

  return cart.map((line, at) =>
    at === index ? { ...line, quantity: line.quantity + quantity } : line,
  );
}

/**
 * Sets a line's quantity outright — what the `−` and `+` controls do.
 * Reaching zero removes the line, because a line of nothing is not a thing a
 * shop is selling.
 */
export function setQuantity(cart: Cart, unitId: string, productId: string, quantity: number): Cart {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new CartError('A quantity must be a whole number of at least 0');
  }

  if (quantity === 0) {
    return removeFromCart(cart, productId, unitId);
  }

  return cart.map((line) =>
    line.productId === productId && line.unitId === unitId ? { ...line, quantity } : line,
  );
}

export function removeFromCart(cart: Cart, productId: string, unitId: string): Cart {
  return cart.filter((line) => !(line.productId === productId && line.unitId === unitId));
}

export function lineTotalTzs(line: CartLine): number {
  return line.quantity * line.unitPriceTzs;
}

export function cartTotalTzs(cart: Cart): number {
  return cart.reduce((total, line) => total + lineTotalTzs(line), 0);
}

export function cartItemCount(cart: Cart): number {
  return cart.reduce((count, line) => count + line.quantity, 0);
}

/** The lines in the shape `POST /branches/{id}/sales` expects. */
export function toSaleLines(
  cart: Cart,
): Array<{ productId: string; productUnitId: string; quantity: number }> {
  if (cart.length === 0) {
    throw new CartError('Kikapu ni kitupu · The cart is empty');
  }

  return cart.map((line) => ({
    productId: line.productId,
    productUnitId: line.unitId,
    quantity: line.quantity,
  }));
}

/** TSh 12,500 — grouped the way a price is written on a shelf. */
export function formatTzs(amount: number): string {
  return `TSh ${Math.round(amount).toLocaleString('en-US')}`;
}
