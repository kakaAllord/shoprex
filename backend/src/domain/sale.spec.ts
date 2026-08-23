import { PaymentInput, SaleMathError, lineTotal, saleTotal, settle } from './sale';

describe('sale arithmetic', () => {
  describe('lineTotal', () => {
    it('is quantity times unit price, and nothing else', () => {
      expect(lineTotal(3, 1_500)).toBe(4_500);
    });

    it('prices a single item', () => {
      expect(lineTotal(1, 800)).toBe(800);
    });

    it('allows a price of zero, because a shop may give something away', () => {
      expect(lineTotal(2, 0)).toBe(0);
    });

    it.each([
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
    ])('refuses a %s quantity', (_label, quantity) => {
      expect(() => lineTotal(quantity, 1_000)).toThrow(SaleMathError);
    });

    it('refuses a negative price', () => {
      expect(() => lineTotal(1, -100)).toThrow(/cannot be negative/);
    });

    it('refuses a fractional shilling, rather than rounding it away', () => {
      // TZS has no subunit in practice. A price of 999.5 is a bug upstream,
      // and absorbing it here would make the receipt disagree with the total.
      expect(() => lineTotal(2, 999.5)).toThrow(/whole number of shillings/);
    });
  });

  describe('saleTotal', () => {
    it('sums the lines', () => {
      expect(
        saleTotal([
          { quantity: 2, unitPriceTzs: 12_000 },
          { quantity: 5, unitPriceTzs: 700 },
        ]),
      ).toBe(27_500);
    });

    it('keeps the same product in different units as separate lines', () => {
      // Doc 02 §6: 2 Cartons and 5 Pieces stay two lines even though the
      // normalized quantity could be combined. The total is still their sum.
      expect(
        saleTotal([
          { quantity: 2, unitPriceTzs: 12_000 },
          { quantity: 5, unitPriceTzs: 700 },
        ]),
      ).toBe(2 * 12_000 + 5 * 700);
    });

    it('refuses a sale with no lines', () => {
      expect(() => saleTotal([])).toThrow(/at least one line/);
    });
  });

  describe('settle — cash', () => {
    it('gives change for what was handed over', () => {
      const settlement = settle(7_500, [
        { kind: 'CASH', amountTzs: 7_500, cashReceivedTzs: 10_000 },
      ]);

      expect(settlement.changeTzs).toBe(2_500);
      expect(settlement.payments[0].changeTzs).toBe(2_500);
      expect(settlement.debtTzs).toBe(0);
    });

    it('gives no change when the money was exact', () => {
      const settlement = settle(7_500, [
        { kind: 'CASH', amountTzs: 7_500, cashReceivedTzs: 7_500 },
      ]);

      expect(settlement.changeTzs).toBe(0);
    });

    it('leaves change unknown when the seller did not say what was handed over', () => {
      const settlement = settle(7_500, [{ kind: 'CASH', amountTzs: 7_500 }]);

      expect(settlement.payments[0].cashReceivedTzs).toBeNull();
      expect(settlement.payments[0].changeTzs).toBeNull();
      expect(settlement.changeTzs).toBe(0);
    });

    it('refuses cash that does not cover what it claims to settle', () => {
      expect(() =>
        settle(7_500, [{ kind: 'CASH', amountTzs: 7_500, cashReceivedTzs: 5_000 }]),
      ).toThrow(/less than the 7500/);
    });

    it('refuses an amount received on a payment that is not cash', () => {
      expect(() =>
        settle(7_500, [{ kind: 'MOBILE_MONEY', amountTzs: 7_500, cashReceivedTzs: 10_000 }]),
      ).toThrow(/Only a cash payment/);
    });
  });

  describe('settle — mixed payments', () => {
    it('accepts a split that settles the total exactly', () => {
      const settlement = settle(20_000, [
        { kind: 'CASH', amountTzs: 5_000, cashReceivedTzs: 5_000 },
        { kind: 'MOBILE_MONEY', amountTzs: 15_000 },
      ]);

      expect(settlement.payments).toHaveLength(2);
      expect(settlement.changeTzs).toBe(0);
    });

    it('allows two different mobile-money providers on one bill', () => {
      // Two methods, one kind. The rule is one payment per *method*, which the
      // service enforces because only it knows the method ids.
      const settlement = settle(20_000, [
        { kind: 'MOBILE_MONEY', amountTzs: 12_000 },
        { kind: 'MOBILE_MONEY', amountTzs: 8_000 },
      ]);

      expect(settlement.payments).toHaveLength(2);
    });

    it('refuses a split that leaves part of the bill unpaid', () => {
      expect(() =>
        settle(20_000, [
          { kind: 'CASH', amountTzs: 5_000 },
          { kind: 'MOBILE_MONEY', amountTzs: 10_000 },
        ]),
      ).toThrow(/15000 settled against 20000/);
    });

    it('refuses a split that overshoots the bill', () => {
      // Overpayment is change, and change is a cash idea. Settling 25,000
      // against a 20,000 bill on M-Pesa is a mistake, not a tip.
      expect(() =>
        settle(20_000, [
          { kind: 'CASH', amountTzs: 5_000 },
          { kind: 'MOBILE_MONEY', amountTzs: 20_000 },
        ]),
      ).toThrow(/25000 settled against 20000/);
    });

    it('adds up change from more than one cash payment', () => {
      const settlement = settle(20_000, [
        { kind: 'CASH', amountTzs: 10_000, cashReceivedTzs: 11_000 },
        { kind: 'CASH', amountTzs: 10_000, cashReceivedTzs: 10_500 },
      ]);

      expect(settlement.changeTzs).toBe(1_500);
    });
  });

  describe('settle — debt', () => {
    it('records the debtor name and the amount owed', () => {
      const settlement = settle(6_000, [
        { kind: 'DEBT', amountTzs: 6_000, debtorName: '  Mama Asha  ' },
      ]);

      expect(settlement.payments[0].debtorName).toBe('Mama Asha');
      expect(settlement.debtTzs).toBe(6_000);
    });

    it('records a part-debt beside a part-payment', () => {
      const settlement = settle(6_000, [
        { kind: 'CASH', amountTzs: 4_000, cashReceivedTzs: 4_000 },
        { kind: 'DEBT', amountTzs: 2_000, debtorName: 'Mama Asha' },
      ]);

      expect(settlement.debtTzs).toBe(2_000);
    });

    it('refuses a debt with no name, because there would be nobody to ask', () => {
      expect(() => settle(6_000, [{ kind: 'DEBT', amountTzs: 6_000 }])).toThrow(
        /needs a debtor name/,
      );
    });

    it('refuses a debt whose name is only whitespace', () => {
      expect(() =>
        settle(6_000, [{ kind: 'DEBT', amountTzs: 6_000, debtorName: '   ' }]),
      ).toThrow(/needs a debtor name/);
    });

    it('refuses two debts on one sale', () => {
      expect(() =>
        settle(6_000, [
          { kind: 'DEBT', amountTzs: 3_000, debtorName: 'Mama Asha' },
          { kind: 'DEBT', amountTzs: 3_000, debtorName: 'Baba Juma' },
        ]),
      ).toThrow(/only one debt/);
    });

    it('refuses a debtor name on a payment that is not a debt', () => {
      expect(() =>
        settle(6_000, [{ kind: 'CASH', amountTzs: 6_000, debtorName: 'Mama Asha' }]),
      ).toThrow(/Only a debt payment/);
    });
  });

  describe('settle — what it will not accept at all', () => {
    it('refuses a sale with no payment', () => {
      expect(() => settle(6_000, [])).toThrow(/at least one payment/);
    });

    it.each([
      ['zero', 0],
      ['negative', -500],
    ])('refuses a %s payment amount', (_label, amountTzs: number) => {
      expect(() => settle(6_000, [{ kind: 'CASH', amountTzs } as PaymentInput])).toThrow(
        SaleMathError,
      );
    });

    it('refuses a fractional payment amount', () => {
      expect(() => settle(6_000, [{ kind: 'CASH', amountTzs: 5_999.5 }])).toThrow(
        /whole number of shillings/,
      );
    });
  });
});
