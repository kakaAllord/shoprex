import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StockScreen } from './StockScreen';
import { ApiClient, ProductStock } from '../../core/api/apiClient';

/**
 * Stoo, on the phone.
 *
 * The arithmetic behind these numbers is the backend's and is proven in
 * `backend/test/stock-engine.e2e-spec.ts`. What is proven here is what a
 * person sees: shop language rather than ledger language, a negative balance
 * shown rather than swallowed, and every one of the four states nobody
 * normally looks at — loading, empty, error, and permission refused.
 */
const baseUrl = 'http://api.test/api/v1';

const coke: ProductStock = {
  productId: 'coke',
  productName: 'Coca-Cola 500ml',
  branchId: 'branch-1',
  packages: [
    { unitId: 'carton', unitName: 'Carton', quantity: 5, factorToBase: 6 },
    { unitId: 'piece', unitName: 'Piece', quantity: 5, factorToBase: 1 },
  ],
  normalizedQuantity: 35,
  baseUnitId: 'piece',
  baseUnitName: 'Piece',
};

const sabuni: ProductStock = {
  productId: 'sabuni',
  productName: 'Sabuni ya Mche',
  branchId: 'branch-1',
  packages: [{ unitId: 'kipande', unitName: 'Kipande', quantity: -3, factorToBase: 1 }],
  normalizedQuantity: -3,
  baseUnitId: 'kipande',
  baseUnitName: 'Kipande',
};

function stub(answer: { status?: number; body: unknown }) {
  let calls = 0;

  const fetchFn = jest.fn(async () => {
    calls += 1;

    return { status: answer.status ?? 200, text: async () => JSON.stringify(answer.body) };
  }) as unknown as typeof fetch;

  return { fetchFn, callCount: () => calls };
}

const renderStock = (fetchFn: typeof fetch, overrides: Record<string, unknown> = {}) =>
  render(
    <StockScreen
      apiClient={new ApiClient({ baseUrl, fetchFn })}
      branchId="branch-1"
      onBack={jest.fn()}
      onSessionOver={jest.fn()}
      {...overrides}
    />,
  );

describe('what the branch holds', () => {
  it('reads the shelf back in packages, the way a shopkeeper would say it', async () => {
    renderStock(stub({ body: [coke] }).fetchFn);

    await waitFor(() => {
      expect(screen.getByTestId('stock-packages-coke')).toBeTruthy();
    });

    // `5 Carton + 5 Piece`, never `35` and never `9.67 Cartons`.
    expect(screen.getByTestId('stock-packages-coke').props.children).toBe('5 Carton  +  5 Piece');
  });

  it('keeps the normalized quantity off the screen', async () => {
    // AGENT.md: normalized stock mathematics are not put in front of a worker
    // unless they explain an operational outcome. "How many are there" is
    // answered by the packages.
    renderStock(stub({ body: [coke] }).fetchFn);

    await waitFor(() => expect(screen.getByTestId('stock-packages-coke')).toBeTruthy());

    expect(screen.queryByText(/35/)).toBeNull();
  });

  it('filters the list by name', async () => {
    renderStock(stub({ body: [coke, sabuni] }).fetchFn);

    await waitFor(() => expect(screen.getByTestId('stock-search')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('stock-search'), 'sabuni');

    expect(screen.getByTestId('stock-packages-sabuni')).toBeTruthy();
    expect(screen.queryByTestId('stock-packages-coke')).toBeNull();
  });

  it('says so rather than going blank when the filter matches nothing', async () => {
    renderStock(stub({ body: [coke] }).fetchFn);

    await waitFor(() => expect(screen.getByTestId('stock-search')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('stock-search'), 'kitu kipya');

    expect(screen.getByText(/No item by that name/)).toBeTruthy();
  });

  it('re-reads the shelf on demand', async () => {
    const { fetchFn, callCount } = stub({ body: [coke] });

    renderStock(fetchFn);

    await waitFor(() => expect(screen.getByTestId('stock-refresh')).toBeTruthy());
    expect(callCount()).toBe(1);

    fireEvent.press(screen.getByTestId('stock-refresh'));

    await waitFor(() => expect(callCount()).toBe(2));
  });
});

describe('a count that has gone wrong', () => {
  it('shows a negative balance rather than hiding it', async () => {
    // Doc 02 §5's negative-stock policy. Filtering this out would hide the one
    // number the shop needs in order to put the count right.
    renderStock(stub({ body: [sabuni] }).fetchFn);

    await waitFor(() => expect(screen.getByTestId('stock-packages-sabuni')).toBeTruthy());

    expect(screen.getByTestId('stock-packages-sabuni').props.children).toBe('-3 Kipande');
    expect(screen.getByTestId('stock-short-sabuni')).toBeTruthy();
  });

  it('names it as something to recount, not as a failure', async () => {
    renderStock(stub({ body: [sabuni] }).fetchFn);

    await waitFor(() => expect(screen.getByTestId('stock-short')).toBeTruthy());

    expect(screen.getByText(/1 item\(s\) need recounting/)).toBeTruthy();
    expect(screen.getByText(/the balance corrects itself/)).toBeTruthy();
  });

  it('says nothing about recounting when every count is sound', async () => {
    renderStock(stub({ body: [coke] }).fetchFn);

    await waitFor(() => expect(screen.getByTestId('stock-packages-coke')).toBeTruthy());

    expect(screen.queryByTestId('stock-short')).toBeNull();
  });
});

describe('the states nobody looks at', () => {
  it('says it is loading before the shelf arrives', async () => {
    renderStock(stub({ body: [] }).fetchFn);

    expect(screen.getByText(/Loading the stock/)).toBeTruthy();

    // Let the fetch settle, so the loading state is what was asserted rather
    // than a render that had not happened yet.
    await waitFor(() => expect(screen.queryByText(/Loading the stock/)).toBeNull());
  });

  it('says the shelf is empty, and what to do about it', async () => {
    renderStock(stub({ body: [] }).fetchFn);

    await waitFor(() => {
      expect(screen.getByText(/Nothing on the shelf yet/)).toBeTruthy();
    });

    expect(screen.getByText(/Receive a delivery to start/)).toBeTruthy();
  });

  it('offers a retry when the server cannot be reached', async () => {
    const { fetchFn, callCount } = stub({ status: 500, body: { message: 'Seva imeshindwa' } });

    renderStock(fetchFn);

    await waitFor(() => expect(screen.getByTestId('stock-error')).toBeTruthy());

    expect(screen.getByText('Seva imeshindwa')).toBeTruthy();

    fireEvent.press(screen.getByTestId('stock-retry'));

    await waitFor(() => expect(callCount()).toBe(2));
  });

  it('explains a refused permission instead of offering a pointless retry', async () => {
    // A permission taken away mid-shift. Retrying will keep answering the same
    // way, so there is no button that pretends otherwise.
    renderStock(
      stub({ status: 403, body: { message: 'Huna ruhusa ya kuona stoo' } }).fetchFn,
    );

    await waitFor(() => expect(screen.getByTestId('stock-forbidden')).toBeTruthy());

    expect(screen.getByText(/VIEW_STOCK permission/)).toBeTruthy();
    expect(screen.queryByTestId('stock-retry')).toBeNull();
  });

  it('ends the session when the backend says the device is gone', async () => {
    const onSessionOver = jest.fn();

    renderStock(
      stub({ status: 401, body: { message: 'Kifaa hiki kimefutwa · revoked' } }).fetchFn,
      { onSessionOver },
    );

    await waitFor(() => {
      expect(onSessionOver).toHaveBeenCalledWith(expect.stringContaining('revoked'));
    });
  });

  it('offers a way back', async () => {
    const onBack = jest.fn();

    renderStock(stub({ body: [coke] }).fetchFn, { onBack });

    await waitFor(() => expect(screen.getByTestId('stock-packages-coke')).toBeTruthy());

    fireEvent.press(screen.getByTestId('stock-back'));

    expect(onBack).toHaveBeenCalled();
  });
});
