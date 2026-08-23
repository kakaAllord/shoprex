import {
  Basket,
  ReceivableProduct,
  ReceivingError,
  addToBasket,
  anyCostRecorded,
  basketCostTzs,
  basketItemCount,
  costIsComplete,
  emptyBasket,
  removeFromBasket,
  resolveReceivingUnit,
  setBasketQuantity,
  setLineCost,
  toReceiptLines,
} from './receiving';

const coke: ReceivableProduct = {
  id: 'coke',
  name: 'Coca-Cola 500ml',
  units: [
    { id: 'carton', name: 'Carton', priceTzs: 12_000, factorToBase: 6 },
    { id: 'piece', name: 'Piece', priceTzs: 1_000, factorToBase: 1 },
  ],
};

const sabuni: ReceivableProduct = {
  id: 'sabuni',
  name: 'Sabuni ya Mche',
  units: [{ id: 'kipande', name: 'Kipande', priceTzs: 2_500, factorToBase: 1 }],
};

/** A product somebody added while unpacking, before anyone priced it. */
const unpriced: ReceivableProduct = {
  id: 'mpya',
  name: 'Bidhaa Mpya',
  units: [{ id: 'gunia', name: 'Gunia', priceTzs: null, factorToBase: 1 }],
};

const basketOf = (...steps: Array<[ReceivableProduct, string, number?]>): Basket =>
  steps.reduce<Basket>(
    (basket, [product, unitId, quantity]) => addToBasket(basket, product, unitId, quantity),
    emptyBasket,
  );

describe('resolving which packaging arrived', () => {
  it('asks nothing when the product has only one unit', () => {
    const resolution = resolveReceivingUnit(sabuni);

    expect(resolution).toEqual({ kind: 'add', unit: sabuni.units[0] });
  });

  it('receives an unpriced unit without complaint', () => {
    // This is the whole difference from the cart. A delivery does not need a
    // selling price — doc 01 §6's progressive enrichment — and refusing one
    // would mean a shop could not shelve an item until it had priced it.
    expect(resolveReceivingUnit(unpriced)).toEqual({ kind: 'add', unit: unpriced.units[0] });
  });

  it('asks which one when the product has several', () => {
    const resolution = resolveReceivingUnit(coke);

    expect(resolution.kind).toBe('choose');
  });

  it('offers the largest packaging first, because that is how deliveries come', () => {
    const resolution = resolveReceivingUnit(coke);

    expect(resolution.kind === 'choose' && resolution.units.map((unit) => unit.name)).toEqual([
      'Carton',
      'Piece',
    ]);
  });

  it('refuses a product with no units at all', () => {
    expect(() => resolveReceivingUnit({ id: 'x', name: 'X', units: [] })).toThrow(ReceivingError);
  });
});

describe('building up a delivery', () => {
  it('starts empty', () => {
    expect(emptyBasket).toHaveLength(0);
    expect(basketItemCount(emptyBasket)).toBe(0);
  });

  it('adds a packaging at one, with no cost recorded yet', () => {
    const basket = basketOf([coke, 'carton']);

    expect(basket).toHaveLength(1);
    expect(basket[0]).toMatchObject({
      productName: 'Coca-Cola 500ml',
      unitName: 'Carton',
      quantity: 1,
      unitCostTzs: null,
    });
  });

  it('increments the line already there rather than adding a second', () => {
    // Scanning the same box four times is four boxes, not four lines.
    const basket = basketOf([coke, 'carton'], [coke, 'carton'], [coke, 'carton'], [coke, 'carton']);

    expect(basket).toHaveLength(1);
    expect(basket[0].quantity).toBe(4);
  });

  it('keeps the same product in two packagings as two lines', () => {
    // 2 Cartons and 3 Pieces is what arrived. The engine must never roll the
    // Pieces up into a Carton — doc 02 §5 — so the delivery may not either.
    const basket = basketOf([coke, 'carton', 2], [coke, 'piece', 3]);

    expect(basket).toHaveLength(2);
    expect(basket.map((line) => line.unitName)).toEqual(['Carton', 'Piece']);
  });

  it('keeps two products apart even when the unit ids differ only by product', () => {
    const basket = basketOf([coke, 'piece'], [sabuni, 'kipande']);

    expect(basket).toHaveLength(2);
  });

  it('refuses a unit that does not belong to the product', () => {
    expect(() => addToBasket(emptyBasket, sabuni, 'carton')).toThrow(ReceivingError);
  });

  it('refuses a quantity that is not a whole number of at least one', () => {
    expect(() => addToBasket(emptyBasket, coke, 'carton', 0)).toThrow(ReceivingError);
    expect(() => addToBasket(emptyBasket, coke, 'carton', -2)).toThrow(ReceivingError);
    expect(() => addToBasket(emptyBasket, coke, 'carton', 1.5)).toThrow(ReceivingError);
  });

  it('never mutates the basket it was given', () => {
    const before = basketOf([coke, 'carton']);
    const after = addToBasket(before, coke, 'carton');

    expect(before[0].quantity).toBe(1);
    expect(after[0].quantity).toBe(2);
  });
});

describe('correcting a delivery before recording it', () => {
  it('sets a quantity outright', () => {
    const basket = setBasketQuantity(basketOf([coke, 'carton']), 'coke', 'carton', 12);

    expect(basket[0].quantity).toBe(12);
  });

  it('removes the line when the quantity reaches zero', () => {
    const basket = setBasketQuantity(basketOf([coke, 'carton']), 'coke', 'carton', 0);

    expect(basket).toHaveLength(0);
  });

  it('removes a line outright', () => {
    const basket = removeFromBasket(basketOf([coke, 'carton'], [coke, 'piece']), 'coke', 'carton');

    expect(basket.map((line) => line.unitName)).toEqual(['Piece']);
  });

  it('refuses a negative or fractional quantity', () => {
    const basket = basketOf([coke, 'carton']);

    expect(() => setBasketQuantity(basket, 'coke', 'carton', -1)).toThrow(ReceivingError);
    expect(() => setBasketQuantity(basket, 'coke', 'carton', 2.5)).toThrow(ReceivingError);
  });
});

describe('what the delivery cost, when the shop says', () => {
  it('records a cost against one line only', () => {
    const basket = setLineCost(basketOf([coke, 'carton'], [coke, 'piece']), 'coke', 'carton', 9_000);

    expect(basket[0].unitCostTzs).toBe(9_000);
    expect(basket[1].unitCostTzs).toBeNull();
  });

  it('adds up only the lines that have one', () => {
    const basket = setLineCost(basketOf([coke, 'carton', 3], [coke, 'piece', 5]), 'coke', 'carton', 9_000);

    expect(basketCostTzs(basket)).toBe(27_000);
    expect(anyCostRecorded(basket)).toBe(true);
    // The number is part of the delivery, not all of it, and the screen has to
    // be able to say so rather than presenting it as the whole cost.
    expect(costIsComplete(basket)).toBe(false);
  });

  it('knows when every line has been costed', () => {
    let basket = basketOf([coke, 'carton', 2], [coke, 'piece', 4]);

    basket = setLineCost(basket, 'coke', 'carton', 9_000);
    basket = setLineCost(basket, 'coke', 'piece', 800);

    expect(costIsComplete(basket)).toBe(true);
    expect(basketCostTzs(basket)).toBe(21_200);
  });

  it('reports no cost at all when nobody recorded one', () => {
    const basket = basketOf([coke, 'carton', 3]);

    expect(anyCostRecorded(basket)).toBe(false);
    expect(costIsComplete(basket)).toBe(false);
    expect(basketCostTzs(basket)).toBe(0);
  });

  it('clears a cost back to nothing, which is not the same as zero', () => {
    let basket = setLineCost(basketOf([coke, 'carton']), 'coke', 'carton', 9_000);

    basket = setLineCost(basket, 'coke', 'carton', null);

    expect(basket[0].unitCostTzs).toBeNull();
    expect(anyCostRecorded(basket)).toBe(false);
  });

  it('accepts a genuine zero, for something that arrived free', () => {
    const basket = setLineCost(basketOf([coke, 'carton']), 'coke', 'carton', 0);

    expect(basket[0].unitCostTzs).toBe(0);
    expect(anyCostRecorded(basket)).toBe(true);
  });

  it('refuses a negative or fractional cost', () => {
    const basket = basketOf([coke, 'carton']);

    expect(() => setLineCost(basket, 'coke', 'carton', -5)).toThrow(ReceivingError);
    expect(() => setLineCost(basket, 'coke', 'carton', 12.5)).toThrow(ReceivingError);
  });
});

describe('what goes on the shelf, and what is sent', () => {
  it('keeps normalized arithmetic out of the basket entirely', () => {
    // AGENT.md: normalized stock mathematics are not put in front of a worker
    // unless they explain an operational outcome. Someone carrying boxes in
    // from a lorry is counting boxes, so a line holds no base-unit figure for
    // a screen to leak.
    const basket = basketOf([coke, 'carton', 6]);

    expect(Object.keys(basket[0])).toEqual([
      'productId',
      'productName',
      'unitId',
      'unitName',
      'quantity',
      'unitCostTzs',
    ]);
  });

  it('counts the packages, not the base units', () => {
    // The person unpacking counts boxes. 6 Cartons is six things carried in,
    // whatever the engine reckons underneath.
    expect(basketItemCount(basketOf([coke, 'carton', 6], [coke, 'piece', 5]))).toBe(11);
  });

  it('sends the packaging it arrived in, not the normalized quantity', () => {
    const basket = basketOf([coke, 'carton', 6]);

    expect(toReceiptLines(basket)).toEqual([
      { productId: 'coke', productUnitId: 'carton', quantity: 6 },
    ]);
  });

  it('omits a cost nobody recorded rather than sending zero', () => {
    const basket = setLineCost(basketOf([coke, 'carton', 2], [coke, 'piece', 3]), 'coke', 'piece', 800);

    expect(toReceiptLines(basket)).toEqual([
      { productId: 'coke', productUnitId: 'carton', quantity: 2 },
      { productId: 'coke', productUnitId: 'piece', quantity: 3, unitCostTzs: 800 },
    ]);
  });

  it('sends a recorded zero, because free is a cost the shop stated', () => {
    const basket = setLineCost(basketOf([coke, 'carton']), 'coke', 'carton', 0);

    expect(toReceiptLines(basket)[0]).toEqual({
      productId: 'coke',
      productUnitId: 'carton',
      quantity: 1,
      unitCostTzs: 0,
    });
  });

  it('refuses to send an empty delivery', () => {
    expect(() => toReceiptLines(emptyBasket)).toThrow(ReceivingError);
  });
});
