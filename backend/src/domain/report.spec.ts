import {
  ReportMathError,
  ReportReceipt,
  ReportSale,
  debtsOf,
  figuresOf,
  paymentBreakdownOf,
  receivedOf,
  sellersOf,
  topProductsOf,
  totalsOf,
} from './report';

const CASH = 'pm-cash';
const MOBILE = 'pm-mobile';
const DEBT = 'pm-debt';

let sequence = 0;

function sale(overrides: Partial<ReportSale> = {}): ReportSale {
  sequence += 1;

  return {
    id: `sale-${sequence}`,
    soldById: 'neema',
    soldByName: 'Neema',
    totalTzs: 1_000,
    changeTzs: 0,
    debtTzs: 0,
    createdAt: new Date(`2026-08-21T0${(sequence % 9) + 1}:00:00Z`),
    lines: [
      {
        productId: 'coke',
        productName: 'Coca-Cola 500ml',
        unitName: 'Kipande',
        quantity: 1,
        lineTotalTzs: 1_000,
        shortfallNormalized: 0,
      },
    ],
    payments: [
      {
        paymentMethodId: CASH,
        methodName: 'Taslimu',
        methodKind: 'CASH',
        amountTzs: 1_000,
        debtorName: null,
      },
    ],
    ...overrides,
  };
}

function receipt(overrides: Partial<ReportReceipt> = {}): ReportReceipt {
  sequence += 1;

  return {
    id: `receipt-${sequence}`,
    receivedById: 'juma',
    receivedByName: 'Juma',
    createdAt: new Date('2026-08-21T08:00:00Z'),
    lines: [
      {
        productId: 'coke',
        productName: 'Coca-Cola 500ml',
        productUnitId: 'carton',
        unitName: 'Kreti',
        quantity: 2,
        unitCostTzs: 5_400,
      },
    ],
    ...overrides,
  };
}

describe('totalsOf', () => {
  it('answers zero for a day with no sales, rather than nothing', () => {
    expect(totalsOf([])).toEqual({
      saleCount: 0,
      salesTotalTzs: 0,
      debtTzs: 0,
      collectedTzs: 0,
      changeTzs: 0,
      lineCount: 0,
      salesWithShortfall: 0,
    });
  });

  it('adds the bills up', () => {
    const totals = totalsOf([sale({ totalTzs: 1_500 }), sale({ totalTzs: 2_500 })]);

    expect(totals.saleCount).toBe(2);
    expect(totals.salesTotalTzs).toBe(4_000);
  });

  /**
   * The subtraction an owner would otherwise do in their head on a busy day.
   * The bills say 10,000 but 3,000 of it walked out against a name, so what is
   * actually in the till and on the phone is 7,000.
   */
  it('separates what was collected from what was merely sold', () => {
    const totals = totalsOf([
      sale({ totalTzs: 7_000 }),
      sale({ totalTzs: 3_000, debtTzs: 3_000 }),
    ]);

    expect(totals.salesTotalTzs).toBe(10_000);
    expect(totals.debtTzs).toBe(3_000);
    expect(totals.collectedTzs).toBe(7_000);
  });

  it('reports change but never subtracts it from a total', () => {
    // 10,000 handed over for a 7,000 bill: the customer paid 7,000, and the
    // 3,000 that went back was never the shop's.
    const totals = totalsOf([sale({ totalTzs: 7_000, changeTzs: 3_000 })]);

    expect(totals.salesTotalTzs).toBe(7_000);
    expect(totals.collectedTzs).toBe(7_000);
    expect(totals.changeTzs).toBe(3_000);
  });

  it('counts lines and the sales that sold more than the records held', () => {
    const short = sale({
      lines: [
        {
          productId: 'coke',
          productName: 'Coca-Cola 500ml',
          unitName: 'Kipande',
          quantity: 5,
          lineTotalTzs: 5_000,
          shortfallNormalized: 3,
        },
        {
          productId: 'sugar',
          productName: 'Sukari',
          unitName: 'Kilo',
          quantity: 1,
          lineTotalTzs: 3_000,
          shortfallNormalized: 0,
        },
      ],
    });

    const totals = totalsOf([sale(), short]);

    expect(totals.lineCount).toBe(3);
    expect(totals.salesWithShortfall).toBe(1);
  });

  it('refuses a fractional shilling rather than absorbing it', () => {
    expect(() => totalsOf([sale({ totalTzs: 1_000.5 })])).toThrow(ReportMathError);
  });
});

describe('paymentBreakdownOf', () => {
  it('groups by method and orders by the money taken', () => {
    const rows = paymentBreakdownOf([
      sale({
        totalTzs: 1_000,
        payments: [
          { paymentMethodId: CASH, methodName: 'Taslimu', methodKind: 'CASH', amountTzs: 1_000, debtorName: null },
        ],
      }),
      sale({
        totalTzs: 9_000,
        payments: [
          { paymentMethodId: MOBILE, methodName: 'Pesa ya simu', methodKind: 'MOBILE_MONEY', amountTzs: 9_000, debtorName: null },
        ],
      }),
    ]);

    expect(rows.map((row) => [row.methodName, row.amountTzs])).toEqual([
      ['Pesa ya simu', 9_000],
      ['Taslimu', 1_000],
    ]);
  });

  it('counts a mixed payment under both methods', () => {
    const rows = paymentBreakdownOf([
      sale({
        totalTzs: 10_000,
        payments: [
          { paymentMethodId: CASH, methodName: 'Taslimu', methodKind: 'CASH', amountTzs: 6_000, debtorName: null },
          { paymentMethodId: MOBILE, methodName: 'Pesa ya simu', methodKind: 'MOBILE_MONEY', amountTzs: 4_000, debtorName: null },
        ],
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.saleCount === 1)).toBe(true);
  });

  /**
   * The invariant that makes the breakdown trustworthy: a sale is only
   * complete when its payments settle the bill exactly (doc 02 §7), so the
   * breakdown must add up to the headline total with nothing left over.
   */
  it('adds up to the day’s sales total exactly', () => {
    const sales = [
      sale({
        totalTzs: 10_000,
        debtTzs: 2_000,
        payments: [
          { paymentMethodId: CASH, methodName: 'Taslimu', methodKind: 'CASH', amountTzs: 5_000, debtorName: null },
          { paymentMethodId: MOBILE, methodName: 'Pesa ya simu', methodKind: 'MOBILE_MONEY', amountTzs: 3_000, debtorName: null },
          { paymentMethodId: DEBT, methodName: 'Deni', methodKind: 'DEBT', amountTzs: 2_000, debtorName: 'Mama Neema' },
        ],
      }),
      sale({ totalTzs: 4_500, payments: [{ paymentMethodId: CASH, methodName: 'Taslimu', methodKind: 'CASH', amountTzs: 4_500, debtorName: null }] }),
    ];

    const breakdown = paymentBreakdownOf(sales);
    const summed = breakdown.reduce((total, row) => total + row.amountTzs, 0);

    expect(summed).toBe(totalsOf(sales).salesTotalTzs);
  });

  /**
   * The snapshot rule, in the one place it is easiest to get wrong. A method
   * renamed mid-day must not split its own takings into two rows — the id is
   * what identifies it, and the name is only a label.
   */
  it('keeps a renamed method as one row, labelled with the most recent name', () => {
    const rows = paymentBreakdownOf([
      sale({
        createdAt: new Date('2026-08-21T09:00:00Z'),
        payments: [{ paymentMethodId: CASH, methodName: 'Taslimu', methodKind: 'CASH', amountTzs: 1_000, debtorName: null }],
      }),
      sale({
        createdAt: new Date('2026-08-21T15:00:00Z'),
        payments: [{ paymentMethodId: CASH, methodName: 'Cash', methodKind: 'CASH', amountTzs: 2_000, debtorName: null }],
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ methodName: 'Cash', amountTzs: 3_000, saleCount: 2 });
  });

  it('is empty for a day with no sales', () => {
    expect(paymentBreakdownOf([])).toEqual([]);
  });
});

describe('debtsOf', () => {
  it('lists only debts, biggest first', () => {
    const rows = debtsOf([
      sale({
        totalTzs: 3_000,
        debtTzs: 3_000,
        payments: [{ paymentMethodId: DEBT, methodName: 'Deni', methodKind: 'DEBT', amountTzs: 3_000, debtorName: 'Juma' }],
      }),
      sale({
        totalTzs: 8_000,
        debtTzs: 8_000,
        payments: [{ paymentMethodId: DEBT, methodName: 'Deni', methodKind: 'DEBT', amountTzs: 8_000, debtorName: 'Mama Neema' }],
      }),
      sale(),
    ]);

    expect(rows).toEqual([
      { debtorName: 'Mama Neema', amountTzs: 8_000, saleCount: 1 },
      { debtorName: 'Juma', amountTzs: 3_000, saleCount: 1 },
    ]);
  });

  it('adds one debtor’s several debts together, however they were capitalised', () => {
    const rows = debtsOf([
      sale({
        debtTzs: 2_000,
        payments: [{ paymentMethodId: DEBT, methodName: 'Deni', methodKind: 'DEBT', amountTzs: 2_000, debtorName: 'Mama Neema' }],
      }),
      sale({
        debtTzs: 1_000,
        payments: [{ paymentMethodId: DEBT, methodName: 'Deni', methodKind: 'DEBT', amountTzs: 1_000, debtorName: '  mama neema ' }],
      }),
    ]);

    expect(rows).toEqual([{ debtorName: 'Mama Neema', amountTzs: 3_000, saleCount: 2 }]);
  });

  it('counts only the debt part of a mixed payment', () => {
    const rows = debtsOf([
      sale({
        totalTzs: 10_000,
        debtTzs: 4_000,
        payments: [
          { paymentMethodId: CASH, methodName: 'Taslimu', methodKind: 'CASH', amountTzs: 6_000, debtorName: null },
          { paymentMethodId: DEBT, methodName: 'Deni', methodKind: 'DEBT', amountTzs: 4_000, debtorName: 'Juma' },
        ],
      }),
    ]);

    expect(rows).toEqual([{ debtorName: 'Juma', amountTzs: 4_000, saleCount: 1 }]);
  });

  it('refuses a nameless debt rather than reporting one', () => {
    expect(() =>
      debtsOf([
        sale({
          payments: [{ paymentMethodId: DEBT, methodName: 'Deni', methodKind: 'DEBT', amountTzs: 1_000, debtorName: '   ' }],
        }),
      ]),
    ).toThrow(ReportMathError);
  });
});

describe('sellersOf', () => {
  it('totals each person’s own sales, biggest first', () => {
    const rows = sellersOf([
      sale({ soldById: 'neema', soldByName: 'Neema', totalTzs: 4_000 }),
      sale({ soldById: 'juma', soldByName: 'Juma', totalTzs: 9_000, debtTzs: 2_000 }),
      sale({ soldById: 'neema', soldByName: 'Neema', totalTzs: 1_000 }),
    ]);

    expect(rows).toEqual([
      { userId: 'juma', name: 'Juma', saleCount: 1, salesTotalTzs: 9_000, debtTzs: 2_000 },
      { userId: 'neema', name: 'Neema', saleCount: 2, salesTotalTzs: 5_000, debtTzs: 0 },
    ]);
  });

  it('adds up to the day’s sales total', () => {
    const sales = [sale({ totalTzs: 4_000 }), sale({ soldById: 'juma', totalTzs: 6_000 })];

    expect(sellersOf(sales).reduce((sum, row) => sum + row.salesTotalTzs, 0)).toBe(
      totalsOf(sales).salesTotalTzs,
    );
  });
});

describe('receivedOf', () => {
  it('answers an empty day without pretending a cost of zero', () => {
    expect(receivedOf([])).toEqual({
      receiptCount: 0,
      lineCount: 0,
      rows: [],
      totalCostTzs: null,
      costIsPartial: false,
    });
  });

  it('keeps two packagings of one product apart', () => {
    const summary = receivedOf([
      receipt({
        lines: [
          { productId: 'coke', productName: 'Coca-Cola 500ml', productUnitId: 'carton', unitName: 'Kreti', quantity: 2, unitCostTzs: 5_400 },
          { productId: 'coke', productName: 'Coca-Cola 500ml', productUnitId: 'piece', unitName: 'Kipande', quantity: 5, unitCostTzs: 900 },
        ],
      }),
    ]);

    expect(summary.rows).toHaveLength(2);
    expect(summary.lineCount).toBe(2);
    expect(summary.totalCostTzs).toBe(2 * 5_400 + 5 * 900);
  });

  it('adds the same packaging across two deliveries', () => {
    const summary = receivedOf([receipt(), receipt()]);

    expect(summary.receiptCount).toBe(2);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].quantity).toBe(4);
    expect(summary.rows[0].costTzs).toBe(4 * 5_400);
  });

  it('reports no cost as null, never as zero', () => {
    const summary = receivedOf([
      receipt({
        lines: [
          { productId: 'sugar', productName: 'Sukari', productUnitId: 'sack', unitName: 'Gunia', quantity: 3, unitCostTzs: null },
        ],
      }),
    ]);

    expect(summary.rows[0].costTzs).toBeNull();
    expect(summary.totalCostTzs).toBeNull();
    expect(summary.costIsPartial).toBe(false);
  });

  it('says so when only some of a delivery recorded a cost', () => {
    const summary = receivedOf([
      receipt({
        lines: [
          { productId: 'coke', productName: 'Coca-Cola 500ml', productUnitId: 'carton', unitName: 'Kreti', quantity: 1, unitCostTzs: 5_400 },
          { productId: 'coke', productName: 'Coca-Cola 500ml', productUnitId: 'carton', unitName: 'Kreti', quantity: 1, unitCostTzs: null },
        ],
      }),
    ]);

    expect(summary.rows[0].quantity).toBe(2);
    expect(summary.rows[0].costTzs).toBe(5_400);
    expect(summary.rows[0].costIsPartial).toBe(true);
    expect(summary.costIsPartial).toBe(true);
  });

  it('says so when one product recorded a cost and another did not', () => {
    const summary = receivedOf([
      receipt({
        lines: [
          { productId: 'coke', productName: 'Coca-Cola 500ml', productUnitId: 'carton', unitName: 'Kreti', quantity: 1, unitCostTzs: 5_400 },
          { productId: 'sugar', productName: 'Sukari', productUnitId: 'sack', unitName: 'Gunia', quantity: 1, unitCostTzs: null },
        ],
      }),
    ]);

    expect(summary.totalCostTzs).toBe(5_400);
    expect(summary.costIsPartial).toBe(true);
  });

  it('sorts by product then packaging, so the list reads the same every day', () => {
    const summary = receivedOf([
      receipt({
        lines: [
          { productId: 'sugar', productName: 'Sukari', productUnitId: 'sack', unitName: 'Gunia', quantity: 1, unitCostTzs: null },
          { productId: 'coke', productName: 'Coca-Cola 500ml', productUnitId: 'piece', unitName: 'Kipande', quantity: 1, unitCostTzs: null },
          { productId: 'coke', productName: 'Coca-Cola 500ml', productUnitId: 'carton', unitName: 'Kreti', quantity: 1, unitCostTzs: null },
        ],
      }),
    ]);

    expect(summary.rows.map((row) => `${row.productName} ${row.unitName}`)).toEqual([
      'Coca-Cola 500ml Kipande',
      'Coca-Cola 500ml Kreti',
      'Sukari Gunia',
    ]);
  });

  it('refuses a fractional or absent quantity', () => {
    expect(() =>
      receivedOf([
        receipt({
          lines: [
            { productId: 'coke', productName: 'Coke', productUnitId: 'piece', unitName: 'Kipande', quantity: 0, unitCostTzs: null },
          ],
        }),
      ]),
    ).toThrow(ReportMathError);
  });
});

describe('topProductsOf', () => {
  it('ranks by money taken, not by count', () => {
    // Twenty Pieces and one Carton are not comparable quantities — the engine
    // deliberately never adds them together — but their shillings are.
    const rows = topProductsOf(
      [
        sale({
          lines: [
            { productId: 'coke', productName: 'Coke', unitName: 'Kipande', quantity: 20, lineTotalTzs: 20_000, shortfallNormalized: 0 },
            { productId: 'rice', productName: 'Mchele', unitName: 'Gunia', quantity: 1, lineTotalTzs: 90_000, shortfallNormalized: 0 },
          ],
        }),
      ],
      5,
    );

    expect(rows.map((row) => row.productName)).toEqual(['Mchele', 'Coke']);
  });

  it('keeps one product’s two packagings apart', () => {
    const rows = topProductsOf(
      [
        sale({
          lines: [
            { productId: 'coke', productName: 'Coke', unitName: 'Kipande', quantity: 5, lineTotalTzs: 5_000, shortfallNormalized: 0 },
            { productId: 'coke', productName: 'Coke', unitName: 'Kreti', quantity: 1, lineTotalTzs: 6_000, shortfallNormalized: 0 },
          ],
        }),
      ],
      5,
    );

    expect(rows.map((row) => row.unitName)).toEqual(['Kreti', 'Kipande']);
  });

  it('honours the limit', () => {
    expect(topProductsOf([sale(), sale({ soldById: 'juma' })], 1)).toHaveLength(1);
  });

  it('refuses a limit that is not a whole number of at least one', () => {
    expect(() => topProductsOf([], 0)).toThrow(ReportMathError);
  });
});

describe('figuresOf', () => {
  it('assembles every figure from one day’s sales and deliveries', () => {
    const figures = figuresOf(
      [
        sale({
          totalTzs: 10_000,
          debtTzs: 4_000,
          payments: [
            { paymentMethodId: CASH, methodName: 'Taslimu', methodKind: 'CASH', amountTzs: 6_000, debtorName: null },
            { paymentMethodId: DEBT, methodName: 'Deni', methodKind: 'DEBT', amountTzs: 4_000, debtorName: 'Juma' },
          ],
        }),
      ],
      [receipt()],
    );

    expect(figures.totals.salesTotalTzs).toBe(10_000);
    expect(figures.totals.collectedTzs).toBe(6_000);
    expect(figures.paymentBreakdown).toHaveLength(2);
    expect(figures.debts).toEqual([{ debtorName: 'Juma', amountTzs: 4_000, saleCount: 1 }]);
    expect(figures.sellers).toHaveLength(1);
    expect(figures.received.rows).toHaveLength(1);
    expect(figures.topProducts).toHaveLength(1);
  });

  it('answers a whole empty day without throwing', () => {
    const figures = figuresOf([], []);

    expect(figures.totals.saleCount).toBe(0);
    expect(figures.paymentBreakdown).toEqual([]);
    expect(figures.debts).toEqual([]);
    expect(figures.sellers).toEqual([]);
    expect(figures.received.rows).toEqual([]);
    expect(figures.topProducts).toEqual([]);
  });
});
