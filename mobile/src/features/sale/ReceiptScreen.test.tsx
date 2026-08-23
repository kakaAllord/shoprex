import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReceiptScreen, receiptText } from './ReceiptScreen';
import { Sale } from '../../core/api/apiClient';

/**
 * The receipt shows the commercial units actually sold, and offers a way
 * straight into the next sale.
 *
 * Doc 02 §5's normalized arithmetic — the "35 Pieces" behind `5 Cartons +
 * 5 Pieces` — is the engine's business and deliberately never reaches this
 * screen. What the customer sees is what they bought.
 */
const sale: Sale = {
  id: 'sale-1',
  branchId: 'branch-1',
  soldByName: 'Juma Hassan',
  totalTzs: 27_000,
  changeTzs: 3_000,
  debtTzs: 0,
  lines: [
    {
      productName: 'Coca-Cola 500ml',
      unitName: 'Carton',
      quantity: 2,
      unitPriceTzs: 12_000,
      lineTotalTzs: 24_000,
      shortfallNormalized: 0,
    },
    {
      productName: 'Coca-Cola 500ml',
      unitName: 'Piece',
      quantity: 3,
      unitPriceTzs: 1_000,
      lineTotalTzs: 3_000,
      shortfallNormalized: 0,
    },
  ],
  payments: [
    {
      methodName: 'Taslimu',
      methodKind: 'CASH',
      amountTzs: 27_000,
      cashReceivedTzs: 30_000,
      changeTzs: 3_000,
      debtorName: null,
    },
  ],
  hasStockInconsistency: false,
  createdAt: '2026-08-23T09:00:00.000Z',
};

const debtSale: Sale = {
  ...sale,
  totalTzs: 6_000,
  changeTzs: 0,
  debtTzs: 6_000,
  lines: [
    {
      productName: 'Sabuni ya Mche',
      unitName: 'Kipande',
      quantity: 2,
      unitPriceTzs: 3_000,
      lineTotalTzs: 6_000,
      shortfallNormalized: 0,
    },
  ],
  payments: [
    {
      methodName: 'Deni',
      methodKind: 'DEBT',
      amountTzs: 6_000,
      cashReceivedTzs: null,
      changeTzs: null,
      debtorName: 'Mama Asha',
    },
  ],
};

describe('ReceiptScreen', () => {
  it('shows the total and the change to hand back', () => {
    render(<ReceiptScreen sale={sale} onNewSale={jest.fn()} onHome={jest.fn()} />);

    expect(screen.getByTestId('receipt-total')).toHaveTextContent('TSh 27,000');
    expect(screen.getByTestId('receipt-change')).toHaveTextContent('TSh 3,000');
  });

  it('keeps the two units as two lines, in the words they were sold in', () => {
    render(<ReceiptScreen sale={sale} onNewSale={jest.fn()} onHome={jest.fn()} />);

    expect(screen.getByText('2 × Carton @ TSh 12,000')).toBeTruthy();
    expect(screen.getByText('3 × Piece @ TSh 1,000')).toBeTruthy();
    // The normalized quantity is not the customer's business.
    expect(screen.queryByText(/15 Piece/)).toBeNull();
  });

  it('names the debtor on a debt sale, and what is owed', () => {
    render(<ReceiptScreen sale={debtSale} onNewSale={jest.fn()} onHome={jest.fn()} />);

    expect(screen.getByText(/Mama Asha/)).toBeTruthy();
    expect(screen.getByTestId('receipt-debt')).toHaveTextContent('TSh 6,000');
  });

  it('shows no change row when there was none', () => {
    render(<ReceiptScreen sale={debtSale} onNewSale={jest.fn()} onHome={jest.fn()} />);

    expect(screen.queryByTestId('receipt-change')).toBeNull();
  });

  it('leads straight into the next sale', () => {
    const onNewSale = jest.fn();

    render(<ReceiptScreen sale={sale} onNewSale={onNewSale} onHome={jest.fn()} />);

    fireEvent.press(screen.getByTestId('receipt-new-sale'));

    expect(onNewSale).toHaveBeenCalled();
  });

  it('says nothing about stock on an ordinary sale', () => {
    render(<ReceiptScreen sale={sale} onNewSale={jest.fn()} onHome={jest.fn()} />);

    expect(screen.queryByTestId('receipt-stock-note')).toBeNull();
  });

  it('notes a stock inconsistency without calling the sale a failure', () => {
    // The seller did nothing wrong and the sale went through. This is the shop
    // being told its count is short, phrased as such.
    const short = { ...sale, hasStockInconsistency: true };

    render(<ReceiptScreen sale={short} onNewSale={jest.fn()} onHome={jest.fn()} />);

    expect(screen.getByTestId('receipt-done')).toBeTruthy();
    expect(screen.getByTestId('receipt-stock-note')).toBeTruthy();
    expect(screen.getByText(/went through normally/)).toBeTruthy();
    expect(screen.getByText(/notified to recount/)).toBeTruthy();
  });

  it('offers home as well, so the receipt is never a dead end', () => {
    const onHome = jest.fn();

    render(<ReceiptScreen sale={sale} onNewSale={jest.fn()} onHome={onHome} />);

    fireEvent.press(screen.getByTestId('receipt-home'));

    expect(onHome).toHaveBeenCalled();
  });
});

describe('the shareable receipt', () => {
  it('reads as a receipt, in the units sold', () => {
    const text = receiptText(sale);

    expect(text).toContain('2 × Coca-Cola 500ml (Carton) — TSh 24,000');
    expect(text).toContain('JUMLA · TOTAL: TSh 27,000');
    expect(text).toContain('Chenji · Change: TSh 3,000');
    expect(text).toContain('Juma Hassan');
  });

  it('names the debtor when there is a debt, and leaves the line out when there is not', () => {
    expect(receiptText(debtSale)).toContain('Deni: TSh 6,000 (Mama Asha)');
    expect(receiptText(sale)).not.toContain('Deni ·');
  });
});
