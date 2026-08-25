import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SaleScreen } from './SaleScreen';
import { ApiClient, Sale } from '../../core/api/apiClient';

/**
 * Phase 4's acceptance check, on the phone.
 *
 * The backend half is proven over real HTTP in
 * `backend/test/sales.e2e-spec.ts`. What is left to prove here is the part
 * that only exists on the phone: that typing a name finds an item, that one
 * sellable unit adds itself while two ask, that the quantity controls do what
 * they look like they do, and that paying reaches a receipt rather than a dead
 * end.
 */
const baseUrl = 'http://api.test/api/v1';

const coke = {
  id: 'coke',
  name: 'Coca-Cola 500ml',
  baseUnitId: 'piece',
  barcodes: ['5901234123457'],
  units: [
    { id: 'carton', name: 'Carton', priceTzs: 12_000, factorToBase: 6, isBaseUnit: false },
    { id: 'piece', name: 'Piece', priceTzs: 1_000, factorToBase: 1, isBaseUnit: true },
  ],
};

const sabuni = {
  id: 'sabuni',
  name: 'Sabuni ya Mche',
  baseUnitId: 'kipande',
  barcodes: [],
  units: [
    { id: 'kipande', name: 'Kipande', priceTzs: 2_500, factorToBase: 1, isBaseUnit: true },
  ],
};

const methods = [
  { id: 'cash', name: 'Taslimu', kind: 'CASH', sortOrder: 0 },
  { id: 'mobile', name: 'Pesa ya simu', kind: 'MOBILE_MONEY', sortOrder: 1 },
  { id: 'debt', name: 'Deni', kind: 'DEBT', sortOrder: 2 },
];

const completedSale: Sale = {
  id: 'sale-1',
  branchId: 'branch-1',
  soldByName: 'Juma Hassan',
  totalTzs: 2_500,
  changeTzs: 500,
  debtTzs: 0,
  lines: [
    {
      productName: 'Sabuni ya Mche',
      unitName: 'Kipande',
      quantity: 1,
      unitPriceTzs: 2_500,
      lineTotalTzs: 2_500,
      shortfallNormalized: 0,
    },
  ],
  payments: [
    {
      methodName: 'Taslimu',
      methodKind: 'CASH',
      amountTzs: 2_500,
      cashReceivedTzs: 3_000,
      changeTzs: 500,
      debtorName: null,
    },
  ],
  hasStockInconsistency: false,
  createdAt: '2026-08-23T09:00:00.000Z',
};

interface Answer {
  status?: number;
  body: unknown;
}

/** Records every request so a test can assert on what was actually sent. */
function stubBackend(routes: Record<string, Answer | ((body: unknown) => Answer)>) {
  const sent: Array<{ url: string; body: unknown }> = [];

  const fetchFn = jest.fn(async (url: string, init?: { body?: string }) => {
    const parsed = init?.body ? JSON.parse(init.body) : undefined;

    sent.push({ url: String(url), body: parsed });

    const match = Object.entries(routes).find(([path]) => String(url).includes(path));
    const route = match?.[1];
    const answer =
      typeof route === 'function' ? route(parsed) : (route ?? { status: 404, body: { message: 'Not found' } });

    return { status: answer.status ?? 200, text: async () => JSON.stringify(answer.body) };
  }) as unknown as typeof fetch;

  return { fetchFn, sent };
}

function renderSale(fetchFn: typeof fetch, onDone = jest.fn()) {
  const utils = render(
    <SaleScreen
      apiClient={new ApiClient({ baseUrl, fetchFn })}
      branchId="branch-1"
      deviceId="device-1"
      onDone={onDone}
      onBack={jest.fn()}
      onSessionOver={jest.fn()}
    />,
  );

  return { ...utils, onDone };
}

const defaults = {
  '/payment-methods': { body: methods },
  '/products/unit-names': { body: ['Kipande', 'Chupa'] },
};

/** Lets the payment-methods fetch settle before a test asserts anything. */
const settle = () => act(async () => {});

describe('the Mauzo screen', () => {
  it('opens on an empty cart that says what to do', async () => {
    renderSale(stubBackend(defaults).fetchFn);
    await settle();

    expect(screen.getByText(/The cart is empty/)).toBeTruthy();
    expect(screen.getByTestId('sale-total')).toHaveTextContent('TSh 0');
  });

  it('will not open the payment sheet with nothing in the cart', async () => {
    renderSale(stubBackend(defaults).fetchFn);
    await settle();

    expect(screen.getByTestId('sale-pay').props.accessibilityState.disabled).toBe(true);
  });
});

describe('typing a name and picking from the suggestions', () => {
  it('adds a product with one sellable unit immediately, at quantity 1', async () => {
    // Doc 02 §6: one answer means no question.
    renderSale(stubBackend({ ...defaults, '/products?': { body: [sabuni] } }).fetchFn);

    fireEvent.changeText(screen.getByTestId('sale-search'), 'sabuni');

    await waitFor(() => {
      expect(screen.getByTestId('sale-result-sabuni')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('sale-result-sabuni'));

    await waitFor(() => {
      expect(screen.getByTestId('cart-quantity-kipande')).toHaveTextContent('1');
    });

    expect(screen.getByTestId('sale-total')).toHaveTextContent('TSh 2,500');
  });

  it('asks which packaging when the product has more than one', async () => {
    renderSale(stubBackend({ ...defaults, '/products?': { body: [coke] } }).fetchFn);

    fireEvent.changeText(screen.getByTestId('sale-search'), 'cola');

    await waitFor(() => {
      expect(screen.getByTestId('sale-result-coke')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('sale-result-coke'));

    await waitFor(() => {
      expect(screen.getByTestId('unit-choice')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('unit-choice-carton'));

    await waitFor(() => {
      expect(screen.getByTestId('sale-total')).toHaveTextContent('TSh 12,000');
    });
  });

  it('keeps the same product in two units as two lines', async () => {
    renderSale(stubBackend({ ...defaults, '/products?': { body: [coke] } }).fetchFn);

    fireEvent.changeText(screen.getByTestId('sale-search'), 'cola');
    await waitFor(() => expect(screen.getByTestId('sale-result-coke')).toBeTruthy());

    fireEvent.press(screen.getByTestId('sale-result-coke'));
    await waitFor(() => expect(screen.getByTestId('unit-choice')).toBeTruthy());
    fireEvent.press(screen.getByTestId('unit-choice-carton'));

    fireEvent.press(screen.getByTestId('sale-result-coke'));
    await waitFor(() => expect(screen.getByTestId('unit-choice')).toBeTruthy());
    fireEvent.press(screen.getByTestId('unit-choice-piece'));

    await waitFor(() => {
      expect(screen.getByTestId('cart-quantity-carton')).toBeTruthy();
      expect(screen.getByTestId('cart-quantity-piece')).toBeTruthy();
    });

    expect(screen.getByTestId('sale-total')).toHaveTextContent('TSh 13,000');
  });

  it('offers to add the item when nothing matches, instead of a blank list', async () => {
    renderSale(stubBackend({ ...defaults, '/products?': { body: [] } }).fetchFn);

    fireEvent.changeText(screen.getByTestId('sale-search'), 'kitu kipya');

    await waitFor(() => {
      expect(screen.getByTestId('sale-add-unknown')).toBeTruthy();
    });

    expect(screen.getByText(/No product by that name/)).toBeTruthy();
  });
});

describe('adjusting quantities', () => {
  const addSabuni = async () => {
    fireEvent.changeText(screen.getByTestId('sale-search'), 'sabuni');
    await waitFor(() => expect(screen.getByTestId('sale-result-sabuni')).toBeTruthy());
    fireEvent.press(screen.getByTestId('sale-result-sabuni'));
    await waitFor(() => expect(screen.getByTestId('cart-quantity-kipande')).toBeTruthy());
  };

  it('adds one more with the + control', async () => {
    renderSale(stubBackend({ ...defaults, '/products?': { body: [sabuni] } }).fetchFn);
    await addSabuni();

    fireEvent.press(screen.getByTestId('cart-increment-kipande'));

    await waitFor(() => {
      expect(screen.getByTestId('cart-quantity-kipande')).toHaveTextContent('2');
    });

    expect(screen.getByTestId('sale-total')).toHaveTextContent('TSh 5,000');
  });

  it('removes the line when − takes it to zero', async () => {
    renderSale(stubBackend({ ...defaults, '/products?': { body: [sabuni] } }).fetchFn);
    await addSabuni();

    fireEvent.press(screen.getByTestId('cart-decrement-kipande'));

    await waitFor(() => {
      expect(screen.queryByTestId('cart-quantity-kipande')).toBeNull();
    });

    expect(screen.getByText(/The cart is empty/)).toBeTruthy();
  });

  it('removes a line outright', async () => {
    renderSale(stubBackend({ ...defaults, '/products?': { body: [sabuni] } }).fetchFn);
    await addSabuni();

    fireEvent.press(screen.getByTestId('cart-remove-kipande'));

    await waitFor(() => {
      expect(screen.queryByTestId('cart-quantity-kipande')).toBeNull();
    });
  });
});

describe('scanning', () => {
  it('adds what the barcode found', async () => {
    renderSale(
      stubBackend({ ...defaults, '/products/lookup': { body: sabuni } }).fetchFn,
    );

    fireEvent.press(screen.getByTestId('sale-scan'));
    fireEvent(screen.getByTestId('scanner-camera'), 'barcodeScanned', {
      data: '5901234123457',
    });

    await waitFor(() => {
      expect(screen.getByTestId('cart-quantity-kipande')).toHaveTextContent('1');
    });
  });

  it('offers to create the product when a valid code is unknown', async () => {
    // A mis-scan and an item the shop has never sold are different problems.
    // This is the second one, and it is the inline-creation moment.
    renderSale(
      stubBackend({
        ...defaults,
        '/products/lookup': { status: 404, body: { message: 'No product with that barcode' } },
      }).fetchFn,
    );

    fireEvent.press(screen.getByTestId('sale-scan'));
    fireEvent(screen.getByTestId('scanner-camera'), 'barcodeScanned', {
      data: '5901234123457',
    });

    await waitFor(() => {
      expect(screen.getByTestId('new-product-name')).toBeTruthy();
    });

    // The code the seller already pointed the camera at is carried over.
    expect(screen.getByTestId('new-product-barcode')).toBeTruthy();
    expect(screen.getByText('5901234123457')).toBeTruthy();
  });

  it('says a mis-scan was a mis-scan', async () => {
    renderSale(
      stubBackend({
        ...defaults,
        '/products/lookup': {
          status: 400,
          body: { message: 'Namba ya bidhaa si sahihi · That is not a valid EAN-13 barcode' },
        },
      }).fetchFn,
    );

    fireEvent.press(screen.getByTestId('sale-scan'));
    fireEvent(screen.getByTestId('scanner-camera'), 'barcodeScanned', { data: '123' });

    await waitFor(() => {
      expect(screen.getByTestId('sale-notice')).toBeTruthy();
    });

    expect(screen.getByText(/not a valid EAN-13/)).toBeTruthy();
  });
});

describe('adding an unknown item in the middle of a sale', () => {
  it('creates it and puts it straight in the cart', async () => {
    const { fetchFn, sent } = stubBackend({
      ...defaults,
      '/products?': { body: [] },
      // POST /products — matched after the search, since the search carries a
      // query string and this does not.
      '/products': { body: sabuni },
    });

    renderSale(fetchFn);

    fireEvent.changeText(screen.getByTestId('sale-search'), 'sabuni');
    await waitFor(() => expect(screen.getByTestId('sale-add-unknown')).toBeTruthy());

    fireEvent.press(screen.getByTestId('sale-add-unknown'));
    await waitFor(() => expect(screen.getByTestId('new-product-name')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('new-product-name'), 'Sabuni ya Mche');
    // The unit is chosen from the list, not spelled at the counter.
    fireEvent(screen.getByTestId('unit-search'), 'focus');
    fireEvent.press(screen.getByTestId('unit-option-Kipande'));
    fireEvent.changeText(screen.getByTestId('new-product-price'), '2500');
    fireEvent.press(screen.getByTestId('new-product-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('cart-quantity-kipande')).toHaveTextContent('1');
    });

    const created = sent.find((request) => request.url.endsWith('/products'));

    expect(created?.body).toEqual({
      name: 'Sabuni ya Mche',
      units: [{ name: 'Kipande', priceTzs: 2500 }],
    });
  });
});

describe('taking the money', () => {
  const openPayment = async () => {
    fireEvent.changeText(screen.getByTestId('sale-search'), 'sabuni');
    await waitFor(() => expect(screen.getByTestId('sale-result-sabuni')).toBeTruthy());
    fireEvent.press(screen.getByTestId('sale-result-sabuni'));
    await waitFor(() => expect(screen.getByTestId('cart-quantity-kipande')).toBeTruthy());
    fireEvent.press(screen.getByTestId('sale-pay'));
    await waitFor(() => expect(screen.getByTestId('payment-total')).toBeTruthy());
  };

  it('will not complete before a method is chosen, and says why', async () => {
    renderSale(stubBackend({ ...defaults, '/products?': { body: [sabuni] } }).fetchFn);
    await openPayment();

    expect(screen.getByTestId('payment-confirm').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/Choose how they are paying/)).toBeTruthy();
  });

  it('fills the whole bill in with one tap, and shows the change', async () => {
    renderSale(stubBackend({ ...defaults, '/products?': { body: [sabuni] } }).fetchFn);
    await openPayment();

    fireEvent.press(screen.getByTestId('payment-method-cash'));

    await waitFor(() => {
      expect(screen.getByTestId('payment-remaining')).toHaveTextContent('TSh 0');
    });

    fireEvent.changeText(screen.getByTestId('payment-cash-cash'), '3000');

    await waitFor(() => {
      expect(screen.getByTestId('payment-change-cash')).toBeTruthy();
    });

    expect(screen.getByText(/Change: TSh 500/)).toBeTruthy();
  });

  it('completes a cash sale and hands back the receipt', async () => {
    const { fetchFn, sent } = stubBackend({
      ...defaults,
      '/products?': { body: [sabuni] },
      '/sales': { status: 201, body: completedSale },
    });
    const onDone = jest.fn();

    renderSale(fetchFn, onDone);
    await openPayment();

    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.changeText(screen.getByTestId('payment-cash-cash'), '3000');

    await waitFor(() => {
      expect(screen.getByTestId('payment-confirm').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(screen.getByTestId('payment-confirm'));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith(completedSale);
    });

    const posted = sent.find((request) => request.url.includes('/sales'));
    const body = posted?.body as Record<string, unknown>;

    expect(body.lines).toEqual([
      { productId: 'sabuni', productUnitId: 'kipande', quantity: 1 },
    ]);
    expect(body.payments).toEqual([
      { paymentMethodId: 'cash', amountTzs: 2500, cashReceivedTzs: 3000 },
    ]);
    // Every sale carries one, so a retry on a dropped connection cannot ring
    // the same sale up twice.
    expect(String(body.idempotencyKey)).toContain('device-1');
  });

  it('splits a bill across two methods', async () => {
    const { fetchFn, sent } = stubBackend({
      ...defaults,
      '/products?': { body: [sabuni] },
      '/sales': { status: 201, body: completedSale },
    });

    renderSale(fetchFn);
    await openPayment();

    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.changeText(screen.getByTestId('payment-amount-cash'), '1000');
    fireEvent.press(screen.getByTestId('payment-method-mobile'));

    await waitFor(() => {
      expect(screen.getByTestId('payment-remaining')).toHaveTextContent('TSh 0');
    });

    fireEvent.press(screen.getByTestId('payment-confirm'));

    await waitFor(() => {
      expect(sent.some((request) => request.url.includes('/sales'))).toBe(true);
    });

    const body = sent.find((request) => request.url.includes('/sales'))?.body as Record<
      string,
      unknown
    >;

    expect(body.payments).toEqual([
      { paymentMethodId: 'cash', amountTzs: 1000 },
      { paymentMethodId: 'mobile', amountTzs: 1500 },
    ]);
  });

  it('will not complete a debt until it has a name to put on it', async () => {
    renderSale(stubBackend({ ...defaults, '/products?': { body: [sabuni] } }).fetchFn);
    await openPayment();

    fireEvent.press(screen.getByTestId('payment-method-debt'));

    await waitFor(() => {
      expect(screen.getByTestId('payment-debtor-debt')).toBeTruthy();
    });

    expect(screen.getByTestId('payment-confirm').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('payment-debtor-debt'), 'Mama Asha');

    await waitFor(() => {
      expect(screen.getByTestId('payment-confirm').props.accessibilityState.disabled).toBe(false);
    });
  });

  it('completes the sale even when the branch has no stock recorded', async () => {
    // The seller is holding the item. Refusing here would be Shoprex arguing
    // with physical reality in front of a customer — so the sale goes through
    // and the shortfall is flagged for the owner instead.
    const onDone = jest.fn();

    renderSale(
      stubBackend({
        ...defaults,
        '/products?': { body: [sabuni] },
        '/sales': {
          status: 201,
          body: {
            ...completedSale,
            hasStockInconsistency: true,
            lines: [{ ...completedSale.lines[0], shortfallNormalized: 1 }],
          },
        },
      }).fetchFn,
      onDone,
    );

    await openPayment();
    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.press(screen.getByTestId('payment-confirm'));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('payment-error')).toBeNull();
    expect(onDone.mock.calls[0][0].hasStockInconsistency).toBe(true);
  });

  it('still shows a genuine backend refusal rather than pretending it worked', async () => {
    // Not a stock question: the payments did not settle the total.
    renderSale(
      stubBackend({
        ...defaults,
        '/products?': { body: [sabuni] },
        '/sales': {
          status: 400,
          body: { message: 'Malipo hayalingani na jumla · Payments must add up' },
        },
      }).fetchFn,
    );

    await openPayment();
    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.press(screen.getByTestId('payment-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('payment-error')).toBeTruthy();
    });

    expect(screen.getByText(/must add up/)).toBeTruthy();
  });
});

/**
 * Phase 8 — recovering from a dropped connection without selling it twice.
 *
 * The backend's idempotency is proven over real HTTP in
 * `backend/test/sales.e2e-spec.ts`, and it is exact. What it cannot prove is
 * that the phone actually *uses* it, which until Phase 8 it did not: the key
 * was minted inside the submit handler off an incrementing counter and
 * `Date.now()`, so every retry carried a brand-new key and the backend, quite
 * correctly, rang up a second sale.
 *
 * These tests hold the phone to its side of the bargain.
 */
describe('a sale that fails on a bad connection', () => {
  const openPayment = async () => {
    fireEvent.changeText(screen.getByTestId('sale-search'), 'sabuni');
    await waitFor(() => expect(screen.getByTestId('sale-result-sabuni')).toBeTruthy());
    fireEvent.press(screen.getByTestId('sale-result-sabuni'));
    await waitFor(() => expect(screen.getByTestId('cart-quantity-kipande')).toBeTruthy());
    fireEvent.press(screen.getByTestId('sale-pay'));
    await waitFor(() => expect(screen.getByTestId('payment-total')).toBeTruthy());
  };

  /** Fails the first POST /sales outright, then answers the retry. */
  function flakyBackend() {
    const sent: Array<{ url: string; body: unknown }> = [];
    let saleAttempts = 0;

    const fetchFn = jest.fn(async (url: string, init?: { body?: string }) => {
      const parsed = init?.body ? JSON.parse(init.body) : undefined;

      sent.push({ url: String(url), body: parsed });

      if (String(url).includes('/sales')) {
        saleAttempts += 1;

        // The response never arrives. This is what a Tanzanian phone losing
        // its signal mid-request actually looks like to fetch — not a status
        // code, an exception.
        if (saleAttempts === 1) {
          throw new TypeError('Network request failed');
        }

        return { status: 201, text: async () => JSON.stringify(completedSale) };
      }

      if (String(url).includes('/payment-methods')) {
        return { status: 200, text: async () => JSON.stringify(methods) };
      }

      if (String(url).includes('/products/unit-names')) {
        return { status: 200, text: async () => JSON.stringify(['Kipande']) };
      }

      return { status: 200, text: async () => JSON.stringify([sabuni]) };
    }) as unknown as typeof fetch;

    return { fetchFn, sent, saleKeys: () => sent.filter((r) => r.url.includes('/sales')) };
  }

  it('retries with the very same idempotency key, so the backend can recognise it', async () => {
    const { fetchFn, saleKeys } = flakyBackend();

    renderSale(fetchFn);
    await openPayment();

    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.changeText(screen.getByTestId('payment-cash-cash'), '3000');

    await waitFor(() => {
      expect(screen.getByTestId('payment-confirm').props.accessibilityState.disabled).toBe(false);
    });

    // First attempt — the connection dies.
    fireEvent.press(screen.getByTestId('payment-confirm'));
    await waitFor(() => expect(screen.getByTestId('payment-error')).toBeTruthy());

    // The seller presses Lipa again, exactly as they would in a shop.
    fireEvent.press(screen.getByTestId('payment-confirm'));

    await waitFor(() => expect(saleKeys()).toHaveLength(2));

    const [first, second] = saleKeys().map(
      (request) => (request.body as Record<string, unknown>).idempotencyKey,
    );

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('tells the seller that pressing again is safe, rather than leaving them guessing', async () => {
    const { fetchFn } = flakyBackend();

    renderSale(fetchFn);
    await openPayment();

    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.press(screen.getByTestId('payment-confirm'));

    await waitFor(() => expect(screen.getByTestId('payment-error')).toBeTruthy());

    // The one thing a seller standing in front of a customer needs to know.
    expect(screen.getByText(/hakitauzwa mara mbili/)).toBeTruthy();
  });

  it('mints a fresh key for the next sale, so two customers are never merged', async () => {
    const { fetchFn, sent } = stubBackend({
      ...defaults,
      '/products?': { body: [sabuni] },
      '/sales': { status: 201, body: completedSale },
    });

    const { onDone } = renderSale(fetchFn);
    await openPayment();
    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.press(screen.getByTestId('payment-confirm'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    // Back to an empty cart, and a second customer.
    await openPayment();
    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.press(screen.getByTestId('payment-confirm'));

    await waitFor(() => {
      expect(sent.filter((request) => request.url.includes('/sales'))).toHaveLength(2);
    });

    const [first, second] = sent
      .filter((request) => request.url.includes('/sales'))
      .map((request) => (request.body as Record<string, unknown>).idempotencyKey);

    expect(second).not.toBe(first);
  });

  it('abandons the key when the cart is edited, because that is a different sale', async () => {
    // The mirror risk of the fix. Reusing a key across an edit would make the
    // backend answer with the sale the first attempt created — and the item
    // the seller just added would silently vanish off the receipt.
    const { fetchFn, sent } = flakyBackend();

    renderSale(fetchFn);
    await openPayment();

    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.press(screen.getByTestId('payment-confirm'));
    await waitFor(() => expect(screen.getByTestId('payment-error')).toBeTruthy());

    const failedKey = (sent.find((r) => r.url.includes('/sales'))?.body as Record<string, unknown>)
      .idempotencyKey;

    // The seller closes the sheet, adds another one, and pays again.
    fireEvent.press(screen.getByTestId('payment-cancel'));
    await waitFor(() => expect(screen.getByTestId('cart-increment-kipande')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cart-increment-kipande'));

    fireEvent.press(screen.getByTestId('sale-pay'));
    await waitFor(() => expect(screen.getByTestId('payment-total')).toBeTruthy());
    fireEvent.press(screen.getByTestId('payment-method-cash'));
    fireEvent.press(screen.getByTestId('payment-confirm'));

    await waitFor(() => {
      expect(sent.filter((request) => request.url.includes('/sales'))).toHaveLength(2);
    });

    const retriedKey = (
      sent.filter((r) => r.url.includes('/sales'))[1].body as Record<string, unknown>
    ).idempotencyKey;

    expect(retriedKey).not.toBe(failedKey);
  });
});
