import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReceiveScreen } from './ReceiveScreen';
import { ApiClient } from '../../core/api/apiClient';

/**
 * Phase 5's acceptance check, on the phone.
 *
 * The backend half is proven over real HTTP in
 * `backend/test/stock-receiving.e2e-spec.ts`. What is left to prove here is
 * the part that only exists on the phone: that a delivery can be found by
 * scanning, by typing, or by adding an item the shop has never carried; that
 * the packaging is asked for only when there is a genuine choice; that a cost
 * is optional; and that the whole delivery goes in one request and comes back
 * as something the person can read.
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

const mchele = {
  id: 'mchele',
  name: 'Mchele wa Kyela',
  baseUnitId: 'gunia',
  barcodes: [],
  // Never priced. A shop can shelve it long before it decides what to charge.
  units: [{ id: 'gunia', name: 'Gunia', priceTzs: null, factorToBase: 1, isBaseUnit: true }],
};

const receipt = {
  id: 'receipt-1',
  branchId: 'branch-1',
  receivedByName: 'Juma Hassan',
  note: null,
  lines: [
    {
      productId: 'coke',
      productName: 'Coca-Cola 500ml',
      unitId: 'carton',
      unitName: 'Carton',
      quantity: 6,
      normalizedQuantity: 36,
      unitCostTzs: null,
    },
  ],
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
      typeof route === 'function'
        ? route(parsed)
        : (route ?? { status: 404, body: { message: 'Not found' } });

    return { status: answer.status ?? 200, text: async () => JSON.stringify(answer.body) };
  }) as unknown as typeof fetch;

  return { fetchFn, sent };
}

function renderReceive(fetchFn: typeof fetch, overrides: Record<string, unknown> = {}) {
  return render(
    <ReceiveScreen
      apiClient={new ApiClient({ baseUrl, fetchFn })}
      branchId="branch-1"
      onBack={jest.fn()}
      onOpenStock={jest.fn()}
      onSessionOver={jest.fn()}
      {...overrides}
    />,
  );
}

/** The search box is debounced by 300ms, exactly as Mauzo's is. */
async function search(term: string) {
  fireEvent.changeText(screen.getByTestId('receive-search'), term);

  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('starting a delivery', () => {
  it('says the delivery is empty rather than showing a blank screen', () => {
    renderReceive(stubBackend({}).fetchFn);

    expect(screen.getByText(/Nothing in this delivery yet/)).toBeTruthy();
  });

  it('cannot be saved while there is nothing in it', () => {
    renderReceive(stubBackend({}).fetchFn);

    expect(screen.getByTestId('receive-save').props.accessibilityState.disabled).toBe(true);
  });
});

describe('finding what arrived', () => {
  it('adds a one-unit product immediately, without asking which packaging', async () => {
    const { fetchFn } = stubBackend({ '/products': { body: [mchele] } });

    renderReceive(fetchFn);
    await search('mchele');

    fireEvent.press(screen.getByTestId('receive-result-mchele'));

    expect(screen.getByTestId('basket-quantity-gunia').props.value).toBe('1');
    expect(screen.queryByTestId('receive-unit-choice')).toBeNull();
  });

  it('receives a product nobody has priced yet', async () => {
    // The difference from selling, and the reason receiving has its own
    // domain module: Mauzo refuses an unpriced unit, and a delivery must not.
    const { fetchFn } = stubBackend({ '/products': { body: [mchele] } });

    renderReceive(fetchFn);
    await search('mchele');

    fireEvent.press(screen.getByTestId('receive-result-mchele'));

    // In the basket (as well as still in the search results), with no
    // complaint about a missing price anywhere on the screen.
    expect(screen.getAllByText('Mchele wa Kyela').length).toBeGreaterThan(1);
    expect(screen.getByTestId('basket-quantity-gunia')).toBeTruthy();
    expect(screen.queryByText(/hakuna bei/)).toBeNull();
    expect(screen.queryByText(/has no price/)).toBeNull();
  });

  it('asks which packaging arrived when the product has more than one', async () => {
    const { fetchFn } = stubBackend({ '/products': { body: [coke] } });

    renderReceive(fetchFn);
    await search('cola');

    fireEvent.press(screen.getByTestId('receive-result-coke'));

    expect(screen.getByTestId('receive-unit-choice')).toBeTruthy();
    expect(screen.getByText(/Which packaging arrived/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('receive-unit-choice-carton'));

    expect(screen.getByTestId('basket-quantity-carton').props.value).toBe('1');
  });

  it('adds what the barcode found', async () => {
    const { fetchFn } = stubBackend({ '/products/lookup': { body: mchele } });

    renderReceive(fetchFn);

    fireEvent.press(screen.getByTestId('receive-scan'));
    fireEvent(screen.getByTestId('scanner-camera'), 'barcodeScanned', {
      data: '5901234123457',
    });

    await waitFor(() => {
      expect(screen.getByTestId('basket-quantity-gunia')).toBeTruthy();
    });
  });

  it('offers to add a product the shop has never carried', async () => {
    const { fetchFn } = stubBackend({ '/products': { body: [] } });

    renderReceive(fetchFn);
    await search('kitu kipya');

    expect(screen.getByTestId('receive-add-unknown')).toBeTruthy();
    expect(screen.getByText(/No product by that name/)).toBeTruthy();
  });

  it('creates an unknown item without demanding a price, and puts it in the delivery', async () => {
    // Doc 01 §6: Shoprex asks only for what the operation in hand needs. A box
    // going onto a shelf needs no selling price, and insisting on one would
    // stop a shop shelving anything it had not yet priced.
    const { fetchFn, sent } = stubBackend({
      '/products/unit-names': { body: ['Gunia'] },
      '/products': (body) => (body ? { status: 201, body: mchele } : { body: [] }),
    });

    renderReceive(fetchFn);
    await search('mchele');

    fireEvent.press(screen.getByTestId('receive-add-unknown'));
    fireEvent.changeText(screen.getByTestId('new-product-name'), 'Mchele wa Kyela');
    fireEvent(screen.getByTestId('unit-search'), 'focus');
    fireEvent.press(screen.getByTestId('unit-option-Gunia'));

    // No price typed at all, and the button is still live.
    expect(screen.getByTestId('new-product-submit').props.accessibilityState.disabled).toBe(false);

    fireEvent.press(screen.getByTestId('new-product-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('basket-quantity-gunia')).toBeTruthy();
    });

    const created = sent.find((request) => request.body !== undefined);

    expect(created?.body).toEqual({ name: 'Mchele wa Kyela', units: [{ name: 'Gunia' }] });
  });

  it('carries a scanned barcode into the new-product sheet', async () => {
    const { fetchFn } = stubBackend({
      '/products/lookup': { status: 404, body: { message: 'Not found' } },
      '/products/unit-names': { body: [] },
    });

    renderReceive(fetchFn);

    fireEvent.press(screen.getByTestId('receive-scan'));
    fireEvent(screen.getByTestId('scanner-camera'), 'barcodeScanned', {
      data: '5901234123457',
    });

    await waitFor(() => {
      expect(screen.getByTestId('new-product-barcode')).toBeTruthy();
    });

    expect(screen.getByText('5901234123457')).toBeTruthy();
  });
});

describe('saying how much arrived, and what it cost', () => {
  const withCoke = async () => {
    const stub = stubBackend({
      '/products': { body: [coke] },
      '/stock-receipts': { status: 201, body: receipt },
    });

    renderReceive(stub.fetchFn);
    await search('cola');
    fireEvent.press(screen.getByTestId('receive-result-coke'));
    fireEvent.press(screen.getByTestId('receive-unit-choice-carton'));

    return stub;
  };

  it('steps the quantity up and down', async () => {
    await withCoke();

    fireEvent.press(screen.getByTestId('basket-increment-carton'));
    fireEvent.press(screen.getByTestId('basket-increment-carton'));

    expect(screen.getByTestId('basket-quantity-carton').props.value).toBe('3');

    fireEvent.press(screen.getByTestId('basket-decrement-carton'));

    expect(screen.getByTestId('basket-quantity-carton').props.value).toBe('2');
  });

  it('takes a typed quantity, because a delivery is 120 as often as it is 2', async () => {
    await withCoke();

    fireEvent.changeText(screen.getByTestId('basket-quantity-carton'), '120');

    expect(screen.getByTestId('basket-quantity-carton').props.value).toBe('120');
    expect(screen.getByTestId('receive-count').props.children).toBe(120);
  });

  it('removes the line when the quantity is stepped down to nothing', async () => {
    await withCoke();

    fireEvent.press(screen.getByTestId('basket-decrement-carton'));

    expect(screen.queryByTestId('basket-quantity-carton')).toBeNull();
    expect(screen.getByText(/Nothing in this delivery yet/)).toBeTruthy();
  });

  it('removes a line outright', async () => {
    await withCoke();

    fireEvent.press(screen.getByTestId('basket-remove-carton'));

    expect(screen.queryByTestId('basket-quantity-carton')).toBeNull();
  });

  it('shows no cost at all until the shop records one', async () => {
    await withCoke();

    expect(screen.queryByTestId('receive-cost')).toBeNull();
  });

  it('shows a running cost once one is typed, and says when it is only part of it', async () => {
    await withCoke();

    fireEvent.changeText(screen.getByTestId('basket-quantity-carton'), '3');
    fireEvent.changeText(screen.getByTestId('basket-cost-carton'), '9000');

    expect(screen.getByTestId('receive-cost').props.children).toContain('TSh 27,000');

    // A second line with no cost of its own: the number on the bar is now
    // part of the delivery, not all of it, and it says so.
    fireEvent.press(screen.getByTestId('receive-result-coke'));
    fireEvent.press(screen.getByTestId('receive-unit-choice-piece'));

    expect(screen.getByTestId('receive-cost').props.children).toContain('Part of the cost');
  });

  it('keeps two packagings of one product as two lines', async () => {
    await withCoke();

    fireEvent.press(screen.getByTestId('receive-result-coke'));
    fireEvent.press(screen.getByTestId('receive-unit-choice-piece'));

    expect(screen.getByTestId('basket-quantity-carton')).toBeTruthy();
    expect(screen.getByTestId('basket-quantity-piece')).toBeTruthy();
  });
});

describe('recording the delivery', () => {
  const readyToSave = async (routes: Record<string, Answer | ((body: unknown) => Answer)> = {}) => {
    const stub = stubBackend({
      '/products': { body: [coke] },
      '/stock-receipts': { status: 201, body: receipt },
      ...routes,
    });

    renderReceive(stub.fetchFn);
    await search('cola');
    fireEvent.press(screen.getByTestId('receive-result-coke'));
    fireEvent.press(screen.getByTestId('receive-unit-choice-carton'));
    fireEvent.changeText(screen.getByTestId('basket-quantity-carton'), '6');

    return stub;
  };

  it('sends the whole delivery as one request, in the packaging it arrived in', async () => {
    const { sent } = await readyToSave();

    fireEvent.press(screen.getByTestId('receive-save'));

    await waitFor(() => {
      expect(screen.getByTestId('receive-saved')).toBeTruthy();
    });

    const posted = sent.filter((request) => request.url.includes('/stock-receipts'));

    expect(posted).toHaveLength(1);
    expect(posted[0].url).toContain('/branches/branch-1/stock-receipts');
    // Six Cartons, not thirty-six Pieces — doc 02 §5. The backend does the
    // normalizing and snapshots it.
    expect(posted[0].body).toEqual({
      lines: [{ productId: 'coke', productUnitId: 'carton', quantity: 6 }],
    });
  });

  it('omits a cost nobody recorded rather than sending zero', async () => {
    const { sent } = await readyToSave();

    fireEvent.press(screen.getByTestId('receive-save'));

    await waitFor(() => expect(screen.getByTestId('receive-saved')).toBeTruthy());

    const posted = sent.find((request) => request.url.includes('/stock-receipts'));

    expect((posted?.body as { lines: unknown[] }).lines[0]).not.toHaveProperty('unitCostTzs');
  });

  it('sends a cost when the shop recorded one', async () => {
    const { sent } = await readyToSave();

    fireEvent.changeText(screen.getByTestId('basket-cost-carton'), '9000');
    fireEvent.press(screen.getByTestId('receive-save'));

    await waitFor(() => expect(screen.getByTestId('receive-saved')).toBeTruthy());

    const posted = sent.find((request) => request.url.includes('/stock-receipts'));

    expect((posted?.body as { lines: unknown[] }).lines[0]).toMatchObject({ unitCostTzs: 9000 });
  });

  it('says what went on the shelf, in the words the person used', async () => {
    await readyToSave();

    fireEvent.press(screen.getByTestId('receive-save'));

    await waitFor(() => expect(screen.getByTestId('receive-saved')).toBeTruthy());

    expect(screen.getByText('6 × Carton — Coca-Cola 500ml')).toBeTruthy();
    // Never the normalized 36: AGENT.md keeps that arithmetic away from a
    // worker unless it explains an operational outcome, and this does not.
    expect(screen.queryByText(/36/)).toBeNull();
  });

  it('clears the delivery so the next one starts clean', async () => {
    await readyToSave();

    fireEvent.press(screen.getByTestId('receive-save'));

    await waitFor(() => expect(screen.getByTestId('receive-saved')).toBeTruthy());

    expect(screen.queryByTestId('basket-quantity-carton')).toBeNull();
    expect(screen.getByText(/Nothing in this delivery yet/)).toBeTruthy();
  });

  it('keeps the delivery in hand when the backend refuses it', async () => {
    // Nothing went onto the shelf — the receipt is one transaction — so the
    // worst possible outcome is losing the typing. It is not lost.
    await readyToSave({
      '/stock-receipts': {
        status: 403,
        body: { message: 'Huna ruhusa ya kupokea mzigo · RECEIVE_STOCK is required' },
      },
    });

    fireEvent.press(screen.getByTestId('receive-save'));

    await waitFor(() => expect(screen.getByTestId('receive-error')).toBeTruthy());

    expect(screen.getByText(/RECEIVE_STOCK is required/)).toBeTruthy();
    expect(screen.getByText(/Nothing went onto the shelf/)).toBeTruthy();
    expect(screen.getByTestId('basket-quantity-carton').props.value).toBe('6');
  });

  it('ends the session when the backend says the device is gone', async () => {
    const onSessionOver = jest.fn();
    const stub = stubBackend({
      '/products': { body: [coke] },
      '/stock-receipts': {
        status: 401,
        body: { message: 'Kifaa hiki kimefutwa · This device has been revoked.' },
      },
    });

    renderReceive(stub.fetchFn, { onSessionOver });
    await search('cola');
    fireEvent.press(screen.getByTestId('receive-result-coke'));
    fireEvent.press(screen.getByTestId('receive-unit-choice-carton'));
    fireEvent.press(screen.getByTestId('receive-save'));

    await waitFor(() => {
      expect(onSessionOver).toHaveBeenCalledWith(
        expect.stringContaining('This device has been revoked'),
      );
    });
  });

  it('offers the stock view afterwards, when the person may open it', async () => {
    const onOpenStock = jest.fn();
    const stub = stubBackend({
      '/products': { body: [coke] },
      '/stock-receipts': { status: 201, body: receipt },
    });

    renderReceive(stub.fetchFn, { onOpenStock });
    await search('cola');
    fireEvent.press(screen.getByTestId('receive-result-coke'));
    fireEvent.press(screen.getByTestId('receive-unit-choice-carton'));
    fireEvent.press(screen.getByTestId('receive-save'));

    await waitFor(() => expect(screen.getByTestId('receive-open-stock')).toBeTruthy());

    fireEvent.press(screen.getByTestId('receive-open-stock'));

    expect(onOpenStock).toHaveBeenCalled();
  });

  it('does not offer the stock view to somebody who may not see it', async () => {
    await readyToSave();

    // Re-rendered with no route out, the way App.tsx supplies it when
    // VIEW_STOCK is missing.
    screen.rerender(
      <ReceiveScreen
        apiClient={new ApiClient({ baseUrl, fetchFn: stubBackend({}).fetchFn })}
        branchId="branch-1"
        onBack={jest.fn()}
        onOpenStock={null}
        onSessionOver={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('receive-open-stock')).toBeNull();
  });
});
