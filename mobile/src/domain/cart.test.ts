import {
  Cart,
  CartError,
  SellableProduct,
  addToCart,
  cartItemCount,
  cartTotalTzs,
  emptyCart,
  formatTzs,
  removeFromCart,
  resolveUnit,
  sellableUnits,
  setQuantity,
  toSaleLines,
} from './cart';

const coke: SellableProduct = {
  id: 'coke',
  name: 'Coca-Cola 500ml',
  units: [
    { id: 'carton', name: 'Carton', priceTzs: 12_000, factorToBase: 6 },
    { id: 'piece', name: 'Piece', priceTzs: 1_000, factorToBase: 1 },
  ],
};

const sabuni: SellableProduct = {
  id: 'sabuni',
  name: 'Sabuni ya Mche',
  units: [{ id: 'kipande', name: 'Kipande', priceTzs: 2_500, factorToBase: 1 }],
};

const unpriced: SellableProduct = {
  id: 'mpya',
  name: 'Bidhaa Mpya',
  units: [{ id: 'kipande', name: 'Kipande', priceTzs: null, factorToBase: 1 }],
};

describe('resolving which unit a scan means', () => {
  it('adds immediately when there is only one sellable unit', () => {
    // Doc 02 §6. A shop that only sells Kipande should never be asked which
    // unit — there is one answer, and asking costs a tap on every sale.
    expect(resolveUnit(sabuni)).toEqual({ kind: 'add', unit: sabuni.units[0] });
  });

  it('asks when there is more than one, largest packaging first', () => {
    const resolution = resolveUnit(coke);

    expect(resolution.kind).toBe('choose');
    expect(
      resolution.kind === 'choose' ? resolution.units.map((unit) => unit.name) : [],
    ).toEqual(['Carton', 'Piece']);
  });

  it('reports a product nobody has priced yet, rather than offering nothing', () => {
    expect(resolveUnit(unpriced)).toEqual({ kind: 'unpriced' });
  });

  it('treats an unpriced unit as not sellable, even beside a priced one', () => {
    const mixed: SellableProduct = {
      id: 'mixed',
      name: 'Nusu Bei',
      units: [
        { id: 'a', name: 'Carton', priceTzs: null, factorToBase: 6 },
        { id: 'b', name: 'Piece', priceTzs: 900, factorToBase: 1 },
      ],
    };

    expect(sellableUnits(mixed).map((unit) => unit.id)).toEqual(['b']);
    expect(resolveUnit(mixed)).toEqual({ kind: 'add', unit: mixed.units[1] });
  });
});

describe('adding to the cart', () => {
  it('starts a line at quantity 1', () => {
    const cart = addToCart(emptyCart, sabuni, 'kipande');

    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({
      productName: 'Sabuni ya Mche',
      unitName: 'Kipande',
      unitPriceTzs: 2_500,
      quantity: 1,
    });
  });

  it('increments the existing line when the same item is scanned again', () => {
    // Scanning the same bottle four times is four bottles, not four lines.
    let cart: Cart = emptyCart;

    for (let scan = 0; scan < 4; scan += 1) {
      cart = addToCart(cart, sabuni, 'kipande');
    }

    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(4);
    expect(cartItemCount(cart)).toBe(4);
  });

  it('keeps the same product in two units as two lines', () => {
    // Doc 02 §6: those are what went over the counter, even though their
    // normalized quantities could be added up.
    const cart = addToCart(addToCart(emptyCart, coke, 'carton', 2), coke, 'piece', 5);

    expect(cart).toHaveLength(2);
    expect(cart.map((line) => [line.unitName, line.quantity])).toEqual([
      ['Carton', 2],
      ['Piece', 5],
    ]);
  });

  it('keeps different products apart', () => {
    const cart = addToCart(addToCart(emptyCart, coke, 'piece'), sabuni, 'kipande');

    expect(cart).toHaveLength(2);
  });

  it('does not mutate the cart it was given', () => {
    const before = addToCart(emptyCart, sabuni, 'kipande');
    const after = addToCart(before, sabuni, 'kipande');

    expect(before[0].quantity).toBe(1);
    expect(after[0].quantity).toBe(2);
  });

  it('refuses a unit that is not this product’s', () => {
    expect(() => addToCart(emptyCart, sabuni, 'carton')).toThrow(CartError);
  });

  it('refuses an unpriced unit, the way the backend does', () => {
    expect(() => addToCart(emptyCart, unpriced, 'kipande')).toThrow(/has no price yet/);
  });

  it.each([
    ['zero', 0],
    ['negative', -2],
    ['fractional', 1.5],
  ])('refuses a %s quantity', (_label, quantity) => {
    expect(() => addToCart(emptyCart, sabuni, 'kipande', quantity)).toThrow(CartError);
  });
});

describe('adjusting quantities', () => {
  const cart = addToCart(addToCart(emptyCart, coke, 'carton', 2), coke, 'piece', 5);

  it('sets a line outright', () => {
    expect(setQuantity(cart, 'carton', 'coke', 7)[0].quantity).toBe(7);
  });

  it('touches only the line named', () => {
    const next = setQuantity(cart, 'carton', 'coke', 7);

    expect(next[1].quantity).toBe(5);
  });

  it('removes the line when it reaches zero', () => {
    // A line of nothing is not something a shop is selling.
    const next = setQuantity(cart, 'carton', 'coke', 0);

    expect(next).toHaveLength(1);
    expect(next[0].unitName).toBe('Piece');
  });

  it('removes a line outright', () => {
    expect(removeFromCart(cart, 'coke', 'piece')).toHaveLength(1);
  });

  it('refuses a negative quantity', () => {
    expect(() => setQuantity(cart, 'carton', 'coke', -1)).toThrow(CartError);
  });
});

describe('totals', () => {
  it('is quantity times price, summed', () => {
    const cart = addToCart(addToCart(emptyCart, coke, 'carton', 2), coke, 'piece', 5);

    expect(cartTotalTzs(cart)).toBe(2 * 12_000 + 5 * 1_000);
  });

  it('is zero for an empty cart', () => {
    expect(cartTotalTzs(emptyCart)).toBe(0);
  });

  it('writes shillings the way a price is written on a shelf', () => {
    expect(formatTzs(12_500)).toBe('TSh 12,500');
    expect(formatTzs(0)).toBe('TSh 0');
  });
});

describe('handing the cart to the API', () => {
  it('sends the product, the unit, and the quantity — and nothing else', () => {
    const cart = addToCart(addToCart(emptyCart, coke, 'carton', 2), coke, 'piece', 5);

    expect(toSaleLines(cart)).toEqual([
      { productId: 'coke', productUnitId: 'carton', quantity: 2 },
      { productId: 'coke', productUnitId: 'piece', quantity: 5 },
    ]);
  });

  it('refuses to build a sale out of an empty cart', () => {
    expect(() => toSaleLines(emptyCart)).toThrow(/cart is empty/);
  });
});
