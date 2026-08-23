import { PaymentEntry, PaymentMethod, changeFor, paymentState, toSalePayments } from './payment';

const cash: PaymentMethod = { id: 'cash', name: 'Taslimu', kind: 'CASH' };
const mobile: PaymentMethod = { id: 'mobile', name: 'Pesa ya simu', kind: 'MOBILE_MONEY' };
const debt: PaymentMethod = { id: 'debt', name: 'Deni', kind: 'DEBT' };

const entries = (...list: PaymentEntry[]) => list;

describe('change', () => {
  it('is what was handed over, less what it settles', () => {
    expect(changeFor({ method: cash, amountTzs: 7_500, cashReceivedTzs: 10_000 })).toBe(2_500);
  });

  it('is nothing when the money was exact', () => {
    expect(changeFor({ method: cash, amountTzs: 7_500, cashReceivedTzs: 7_500 })).toBe(0);
  });

  it('is unknown until the seller says what was handed over', () => {
    expect(changeFor({ method: cash, amountTzs: 7_500 })).toBeNull();
  });

  it('is never calculated for a payment that is not cash', () => {
    // A mobile-money transfer of the exact amount does not produce change,
    // and pretending it might would be the phone inventing money.
    expect(changeFor({ method: mobile, amountTzs: 7_500, cashReceivedTzs: 10_000 })).toBeNull();
  });

  it('is unknown while the cash entered is still short', () => {
    expect(changeFor({ method: cash, amountTzs: 7_500, cashReceivedTzs: 5_000 })).toBeNull();
  });
});

describe('whether the sale can be completed', () => {
  it('is not ready before a method is chosen', () => {
    const state = paymentState(7_500, entries());

    expect(state.ready).toBe(false);
    expect(state.blockedBecause).toMatch(/Choose how they are paying/);
    expect(state.remainingTzs).toBe(7_500);
  });

  it('is ready when one payment settles the bill exactly', () => {
    const state = paymentState(
      7_500,
      entries({ method: cash, amountTzs: 7_500, cashReceivedTzs: 10_000 }),
    );

    expect(state.ready).toBe(true);
    expect(state.blockedBecause).toBeNull();
    expect(state.changeTzs).toBe(2_500);
    expect(state.remainingTzs).toBe(0);
  });

  it('is ready for a split that settles the bill exactly', () => {
    const state = paymentState(
      20_000,
      entries(
        { method: cash, amountTzs: 5_000, cashReceivedTzs: 5_000 },
        { method: mobile, amountTzs: 15_000 },
      ),
    );

    expect(state.ready).toBe(true);
  });

  it('is not ready while part of the bill is unpaid, and says how much is left', () => {
    const state = paymentState(
      20_000,
      entries({ method: cash, amountTzs: 5_000 }, { method: mobile, amountTzs: 10_000 }),
    );

    expect(state.ready).toBe(false);
    expect(state.remainingTzs).toBe(5_000);
    expect(state.blockedBecause).toMatch(/still unpaid/);
  });

  it('is not ready when the payments overshoot the bill', () => {
    const state = paymentState(20_000, entries({ method: mobile, amountTzs: 25_000 }));

    expect(state.ready).toBe(false);
    expect(state.remainingTzs).toBe(-5_000);
    expect(state.blockedBecause).toMatch(/more than the total/);
  });

  it('is not ready while the cash entered is less than the amount it settles', () => {
    const state = paymentState(
      7_500,
      entries({ method: cash, amountTzs: 7_500, cashReceivedTzs: 5_000 }),
    );

    expect(state.ready).toBe(false);
    expect(state.blockedBecause).toMatch(/cash given is less/);
  });

  it('is not ready for a debt with no name', () => {
    const state = paymentState(6_000, entries({ method: debt, amountTzs: 6_000 }));

    expect(state.ready).toBe(false);
    expect(state.blockedBecause).toMatch(/debtor’s name/);
  });

  it('is not ready for a debt named only with spaces', () => {
    const state = paymentState(
      6_000,
      entries({ method: debt, amountTzs: 6_000, debtorName: '   ' }),
    );

    expect(state.ready).toBe(false);
  });

  it('is ready for part cash and part debt against a name', () => {
    const state = paymentState(
      6_000,
      entries(
        { method: cash, amountTzs: 4_000, cashReceivedTzs: 4_000 },
        { method: debt, amountTzs: 2_000, debtorName: 'Mama Asha' },
      ),
    );

    expect(state.ready).toBe(true);
  });

  it('is not ready for two debts on one sale', () => {
    const state = paymentState(
      6_000,
      entries(
        { method: debt, amountTzs: 3_000, debtorName: 'Mama Asha' },
        { method: debt, amountTzs: 3_000, debtorName: 'Baba Juma' },
      ),
    );

    expect(state.ready).toBe(false);
    expect(state.blockedBecause).toMatch(/Only one debt/);
  });

  it('is not ready while an amount is still blank', () => {
    const state = paymentState(6_000, entries({ method: cash, amountTzs: 0 }));

    expect(state.ready).toBe(false);
    expect(state.blockedBecause).toMatch(/needs an amount/);
  });
});

describe('handing the payments to the API', () => {
  it('sends cash received only on a cash payment', () => {
    expect(
      toSalePayments(
        entries({ method: cash, amountTzs: 7_500, cashReceivedTzs: 10_000 }),
      ),
    ).toEqual([{ paymentMethodId: 'cash', amountTzs: 7_500, cashReceivedTzs: 10_000 }]);
  });

  it('leaves cash received out when the money was exact', () => {
    expect(toSalePayments(entries({ method: cash, amountTzs: 7_500 }))).toEqual([
      { paymentMethodId: 'cash', amountTzs: 7_500 },
    ]);
  });

  it('sends a debtor name only on a debt', () => {
    expect(
      toSalePayments(
        entries({ method: debt, amountTzs: 6_000, debtorName: '  Mama Asha  ' }),
      ),
    ).toEqual([{ paymentMethodId: 'debt', amountTzs: 6_000, debtorName: 'Mama Asha' }]);
  });

  it('never sends a field the backend would refuse for that kind', () => {
    // The backend rejects cashReceivedTzs on a non-cash payment outright, so
    // the sheet must not carry one over when the seller changes their mind
    // about which method they were using.
    expect(
      toSalePayments(
        entries({
          method: mobile,
          amountTzs: 7_500,
          cashReceivedTzs: 10_000,
          debtorName: 'Mama Asha',
        }),
      ),
    ).toEqual([{ paymentMethodId: 'mobile', amountTzs: 7_500 }]);
  });
});
