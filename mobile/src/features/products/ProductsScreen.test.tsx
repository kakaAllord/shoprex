import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ProductsScreen } from './ProductsScreen';
import { ApiClient, Product } from '../../core/api/apiClient';

/**
 * Bidhaa, on the phone.
 *
 * What this screen owes is the thing that was missing before it existed:
 * a way to add a product **without** first pretending to sell or receive one.
 * So the tests below care most about two things — that the add button is
 * there without an errand attached, and that it is offered only to somebody
 * the backend would actually let create a product.
 *
 * Everything about what a product *is* — units, factors, prices — belongs to
 * the backend and is proven there. This proves what a person sees, including
 * the four states nobody normally looks at.
 */
const baseUrl = 'http://api.test/api/v1';

const sukari: Product = {
  id: 'sukari',
  name: 'Sukari',
  isActive: true,
  units: [
    { id: 'kilo', name: 'Kilo', priceTzs: 3200, factorToBase: 1, isBaseUnit: true },
    { id: 'gunia', name: 'Gunia', priceTzs: 155000, factorToBase: 50, isBaseUnit: false },
  ],
  baseUnitId: 'kilo',
  barcodes: ['5901234123457'],
};

const mafuta: Product = {
  id: 'mafuta',
  name: 'Mafuta ya kupikia',
  isActive: true,
  // Deliberately unpriced: the shop has written down what it stocks and has
  // not yet decided what to charge. Doc 01 §6's progressive enrichment.
  units: [{ id: 'chupa', name: 'Chupa', priceTzs: null, factorToBase: 1, isBaseUnit: true }],
  baseUnitId: 'chupa',
  barcodes: [],
};

function stub(answer: { status?: number; body: unknown }) {
  const fetchFn = jest.fn(async () => ({
    status: answer.status ?? 200,
    text: async () => JSON.stringify(answer.body),
  })) as unknown as typeof fetch;

  return fetchFn;
}

const renderProducts = (fetchFn: typeof fetch, overrides: Record<string, unknown> = {}) =>
  render(
    <ProductsScreen
      apiClient={new ApiClient({ baseUrl, fetchFn })}
      canAdd
      onBack={jest.fn()}
      onSessionOver={jest.fn()}
      {...overrides}
    />,
  );

describe('reading the catalogue', () => {
  it('shows what the shop sells without anybody typing a search first', async () => {
    renderProducts(stub({ body: [sukari] }));

    await waitFor(() => {
      expect(screen.getByText('Sukari')).toBeTruthy();
    });
  });

  it('gives every packaging its own price, because that is the question asked', async () => {
    renderProducts(stub({ body: [sukari] }));

    await waitFor(() => {
      expect(screen.getByText('TSh 3,200')).toBeTruthy();
    });

    expect(screen.getByText('TSh 155,000')).toBeTruthy();
  });

  /** `TSh 0` would be a lie about a real price of zero. */
  it('says an unpriced unit is unpriced rather than showing it as free', async () => {
    renderProducts(stub({ body: [mafuta] }));

    await waitFor(() => {
      expect(screen.getByText(/Haijawekwa bei/)).toBeTruthy();
    });

    expect(screen.queryByText('TSh 0')).toBeNull();
  });

  it('says so plainly when the shop has no products at all', async () => {
    renderProducts(stub({ body: [] }));

    await waitFor(() => {
      expect(screen.getByText(/Bado hakuna bidhaa/)).toBeTruthy();
    });
  });
});

describe('adding a product without an errand attached', () => {
  /**
   * The whole reason this screen exists. Before it, creating a product meant
   * scanning something unknown or searching for a name that returned nothing —
   * both of which are rescues from a different task.
   */
  it('offers the add button with nothing searched and nothing scanned', async () => {
    renderProducts(stub({ body: [sukari] }));

    await waitFor(() => {
      expect(screen.getByTestId('products-add')).toBeTruthy();
    });
  });

  it('still offers it when the shop is completely empty', async () => {
    renderProducts(stub({ body: [] }));

    await waitFor(() => {
      expect(screen.getByTestId('products-add')).toBeTruthy();
    });
  });

  /**
   * Hiding a button is not authorization — the backend refuses either way.
   * What this buys is not pointing somebody at a door that will be shut.
   */
  it('withholds it from somebody who could only look, and says why', async () => {
    renderProducts(stub({ body: [sukari] }), { canAdd: false });

    await waitFor(() => {
      expect(screen.getByText('Sukari')).toBeTruthy();
    });

    expect(screen.queryByTestId('products-add')).toBeNull();
    expect(screen.getByTestId('products-cannot-add')).toBeTruthy();
  });
});

describe('the states nobody looks at', () => {
  it('shows a refused permission as the shop’s own rule, not as a fault', async () => {
    renderProducts(
      stub({ status: 403, body: { message: 'Huna ruhusa', statusCode: 403, error: 'FORBIDDEN' } }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('products-forbidden')).toBeTruthy();
    });

    expect(screen.queryByTestId('products-error')).toBeNull();
  });

  it('offers a retry when the backend simply failed', async () => {
    renderProducts(
      stub({ status: 500, body: { message: 'Imeshindikana', statusCode: 500, error: 'ERROR' } }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('products-error')).toBeTruthy();
    });

    expect(screen.getByTestId('products-retry')).toBeTruthy();
  });

  /**
   * A 401 is a revoked handset or an expired session, and it must end the
   * session rather than being shown as a retryable error — the same rule every
   * other screen follows.
   */
  it('ends the session on a 401 instead of offering a pointless retry', async () => {
    const onSessionOver = jest.fn();

    renderProducts(
      stub({
        status: 401,
        body: { message: 'Muda umeisha', statusCode: 401, error: 'UNAUTHORIZED' },
      }),
      { onSessionOver },
    );

    await waitFor(() => {
      expect(onSessionOver).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('products-error')).toBeNull();
  });

  it('goes back where it came from', async () => {
    const onBack = jest.fn();

    renderProducts(stub({ body: [sukari] }), { onBack });

    await waitFor(() => {
      expect(screen.getByTestId('products-back')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('products-back'));

    expect(onBack).toHaveBeenCalled();
  });
});
