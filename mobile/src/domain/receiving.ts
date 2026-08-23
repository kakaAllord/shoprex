/**
 * The receiving basket, as arithmetic rather than as a screen.
 *
 * A delivery is not a sale, and this module exists because the two differ in
 * ways that a shared "basket with a mode flag" would keep having to apologise
 * for:
 *
 * - **Every unit can be received; only priced ones can be sold.** A shop that
 *   has not yet decided what a Piece sells for can still put six Cartons on
 *   the shelf, so `resolveReceivingUnit` never filters on price the way
 *   `resolveUnit` in `cart.ts` must.
 * - **A line carries a cost, and the cost is optional.** A cart line has a
 *   price the customer is about to pay; a receipt line has what the shop paid,
 *   which many shops simply do not record. Nothing here refuses a delivery for
 *   want of it, and V1 does no profit accounting with it either way.
 * - **There is no total to settle.** Nobody hands money over at this counter,
 *   so there is no `Lipa`, no change, and no debt.
 *
 * What the two do share is the rule that matters most: scanning the same item
 * twice is two of it on **one** line, and the same product in two packagings
 * stays two lines, because `2 Cartons` and `3 Pieces` is what actually
 * arrived. Doc 02 §5 — stock is added in the packaging it came in, and the
 * engine never rolls six loose Pieces up into a Carton.
 *
 * The backend remains the authority. It recomputes and snapshots the
 * normalized quantity of every line — and that arithmetic stays there.
 * AGENT.md is explicit that normalized stock mathematics are not shown to a
 * worker unless they are needed to explain an operational outcome, and a
 * person carrying boxes in from a lorry is counting boxes. So a basket line
 * holds what they would say out loud — the item, the packaging, how many, and
 * what it cost — and nothing this module computes is in base units.
 */

/** A unit of a product as the API describes it. Price is irrelevant here. */
export interface ReceivableUnit {
  id: string;
  name: string;
  priceTzs: number | null;
  factorToBase: number;
}

export interface ReceivableProduct {
  id: string;
  name: string;
  units: ReceivableUnit[];
}

export interface BasketLine {
  productId: string;
  productName: string;
  unitId: string;
  unitName: string;
  quantity: number;
  /** Whole shillings for one of that unit. Null means the shop did not say. */
  unitCostTzs: number | null;
}

export type Basket = readonly BasketLine[];

export class ReceivingError extends Error {}

export const emptyBasket: Basket = [];

/**
 * Which packaging arrived.
 *
 * `add` when the product has exactly one unit, so nothing is asked; `choose`
 * when there are several and only the person holding the box knows which. The
 * order is largest first — a delivery arrives in Cartons far more often than
 * in Pieces, so the likely answer is the first thing under the thumb.
 */
export type ReceivingResolution =
  | { kind: 'add'; unit: ReceivableUnit }
  | { kind: 'choose'; units: ReceivableUnit[] };

export function resolveReceivingUnit(product: ReceivableProduct): ReceivingResolution {
  if (product.units.length === 0) {
    // The backend requires at least one unit on every product, so this is a
    // contract violation rather than a state a shop can reach.
    throw new ReceivingError('That product has no units to receive it in');
  }

  if (product.units.length === 1) {
    return { kind: 'add', unit: product.units[0] };
  }

  return {
    kind: 'choose',
    units: [...product.units].sort((a, b) => b.factorToBase - a.factorToBase),
  };
}

/**
 * Adds a packaging to the basket, or increases the line already holding it.
 *
 * Returns a new basket. Nothing here mutates, so a step that turns out to be
 * wrong cannot leave a half-changed delivery behind.
 */
export function addToBasket(
  basket: Basket,
  product: ReceivableProduct,
  unitId: string,
  quantity = 1,
): Basket {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ReceivingError('A quantity must be a whole number of at least 1');
  }

  const unit = product.units.find((candidate) => candidate.id === unitId);

  if (!unit) {
    throw new ReceivingError('That unit does not belong to this product');
  }

  const index = basket.findIndex(
    (line) => line.productId === product.id && line.unitId === unitId,
  );

  if (index === -1) {
    return [
      ...basket,
      {
        productId: product.id,
        productName: product.name,
        unitId: unit.id,
        unitName: unit.name,
        quantity,
        unitCostTzs: null,
      },
    ];
  }

  return basket.map((line, at) =>
    at === index ? { ...line, quantity: line.quantity + quantity } : line,
  );
}

/**
 * Sets a line's quantity outright — what the `−` and `+` controls do. Reaching
 * zero removes the line: a delivery of nothing is not a delivery.
 */
export function setBasketQuantity(
  basket: Basket,
  productId: string,
  unitId: string,
  quantity: number,
): Basket {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new ReceivingError('A quantity must be a whole number of at least 0');
  }

  if (quantity === 0) {
    return removeFromBasket(basket, productId, unitId);
  }

  return basket.map((line) =>
    line.productId === productId && line.unitId === unitId ? { ...line, quantity } : line,
  );
}

/** What one of that packaging cost, or `null` to say the shop did not record it. */
export function setLineCost(
  basket: Basket,
  productId: string,
  unitId: string,
  unitCostTzs: number | null,
): Basket {
  if (unitCostTzs !== null && (!Number.isInteger(unitCostTzs) || unitCostTzs < 0)) {
    throw new ReceivingError('A cost must be a whole number of shillings, or nothing at all');
  }

  return basket.map((line) =>
    line.productId === productId && line.unitId === unitId ? { ...line, unitCostTzs } : line,
  );
}

export function removeFromBasket(basket: Basket, productId: string, unitId: string): Basket {
  return basket.filter((line) => !(line.productId === productId && line.unitId === unitId));
}

export function basketItemCount(basket: Basket): number {
  return basket.reduce((count, line) => count + line.quantity, 0);
}

/**
 * What the shop recorded paying, over the lines that say. Lines with no cost
 * contribute nothing rather than zero — `costIsComplete` is what tells the
 * screen whether the number is the whole delivery or only part of it.
 */
export function basketCostTzs(basket: Basket): number {
  return basket.reduce(
    (total, line) => total + (line.unitCostTzs === null ? 0 : line.unitCostTzs * line.quantity),
    0,
  );
}

export function costIsComplete(basket: Basket): boolean {
  return basket.length > 0 && basket.every((line) => line.unitCostTzs !== null);
}

export function anyCostRecorded(basket: Basket): boolean {
  return basket.some((line) => line.unitCostTzs !== null);
}

/** The lines in the shape `POST /branches/{id}/stock-receipts` expects. */
export function toReceiptLines(
  basket: Basket,
): Array<{ productId: string; productUnitId: string; quantity: number; unitCostTzs?: number }> {
  if (basket.length === 0) {
    throw new ReceivingError('Hakuna kitu kwenye mzigo · The delivery is empty');
  }

  return basket.map((line) => ({
    productId: line.productId,
    productUnitId: line.unitId,
    quantity: line.quantity,
    // Omitted rather than sent as 0: a cost nobody recorded is not a cost of
    // nothing, and the column is nullable for exactly that reason.
    ...(line.unitCostTzs === null ? {} : { unitCostTzs: line.unitCostTzs }),
  }));
}
