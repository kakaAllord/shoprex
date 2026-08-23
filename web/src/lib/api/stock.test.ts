import { describe, expect, it } from 'vitest';
import { describePackages, needsRecount, type ProductStockView } from './stock';

const stock = (
  packages: Array<{ unitName: string; quantity: number; factorToBase?: number }>,
): ProductStockView => ({
  productId: 'p1',
  productName: 'Coca-Cola 500ml',
  branchId: 'b1',
  packages: packages.map((entry, index) => ({
    unitId: `u${index}`,
    unitName: entry.unitName,
    quantity: entry.quantity,
    factorToBase: entry.factorToBase ?? 1,
  })),
  normalizedQuantity: 0,
  baseUnitId: 'u1',
  baseUnitName: 'Piece',
});

describe('describePackages', () => {
  it('recites what a shopkeeper would recite', () => {
    expect(
      describePackages(stock([
        { unitName: 'Carton', quantity: 5, factorToBase: 6 },
        { unitName: 'Piece', quantity: 5 },
      ]).packages),
    ).toBe('5 Carton + 5 Piece');
  });

  it('never shows the normalized figure, which is the engine’s business', () => {
    const rendered = describePackages(
      stock([{ unitName: 'Carton', quantity: 5, factorToBase: 6 }]).packages,
    );

    // 5 Cartons of 6 is 30 base units. The shop counts boxes.
    expect(rendered).toBe('5 Carton');
    expect(rendered).not.toContain('30');
  });

  it('drops a packaging the branch holds none of, rather than printing "0 Carton"', () => {
    expect(
      describePackages(stock([
        { unitName: 'Carton', quantity: 0 },
        { unitName: 'Piece', quantity: 4 },
      ]).packages),
    ).toBe('4 Piece');
  });

  it('says so in words when there is nothing at all', () => {
    expect(describePackages([])).toBe('Hakuna · None');
    expect(describePackages(stock([{ unitName: 'Piece', quantity: 0 }]).packages)).toBe(
      'Hakuna · None',
    );
  });

  it('shows a negative rather than hiding it', () => {
    // Doc 02 §5: the negative exists to make a wrong count findable. Hiding it
    // on the screen somebody opens to find it would defeat the policy.
    expect(describePackages(stock([{ unitName: 'Piece', quantity: -3 }]).packages)).toBe(
      '-3 Piece',
    );
  });
});

describe('needsRecount', () => {
  it('is true only when a packaging has gone negative', () => {
    expect(needsRecount(stock([{ unitName: 'Piece', quantity: 4 }]))).toBe(false);
    expect(needsRecount(stock([{ unitName: 'Piece', quantity: 0 }]))).toBe(false);
    expect(needsRecount(stock([{ unitName: 'Piece', quantity: -1 }]))).toBe(true);
  });

  it('catches a negative on one packaging while another is fine', () => {
    // Selling a Carton from twelve loose Pieces takes the Carton line to -1
    // and leaves the Pieces alone — the engine never repackages upward.
    expect(
      needsRecount(stock([
        { unitName: 'Carton', quantity: -1, factorToBase: 6 },
        { unitName: 'Piece', quantity: 12 },
      ])),
    ).toBe(true);
  });
});
