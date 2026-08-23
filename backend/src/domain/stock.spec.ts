import {
  describeState,
  emptyState,
  issue,
  normalizedTotal,
  receive,
  stateFrom,
} from './stock';
import { UnitGraph } from './units';

/**
 * The engine tests doc 02 §10 calls mandatory, for the parts Phase 3 owns.
 *
 * Unit ids are readable strings here rather than uuids: these are tests about
 * arithmetic, and `carton` says more at a glance than a uuid does.
 */
describe('stock engine', () => {
  /** Product A: 1 Carton = 6 Pieces. */
  const cokeGraph = UnitGraph.build(
    ['carton', 'piece'],
    [{ parentUnitId: 'carton', childUnitId: 'piece', factor: 6 }],
  );

  /** Product C: 1 Sack = 50 kg = 50,000 g. */
  const sugarGraph = UnitGraph.build(
    ['sack', 'kg', 'g'],
    [
      { parentUnitId: 'sack', childUnitId: 'kg', factor: 50 },
      { parentUnitId: 'kg', childUnitId: 'g', factor: 1000 },
    ],
  );

  describe("Phase 3's acceptance check, read literally", () => {
    it('receives 6 Cartons, sells 1 Piece, and shows 5 Cartons + 5 Pieces', () => {
      const received = receive(emptyState(), 'carton', 6, cokeGraph);

      expect(normalizedTotal(received, cokeGraph)).toBe(36);

      const afterSale = issue(received, 'piece', 1, cokeGraph).state;

      expect(describeState(afterSale, cokeGraph)).toEqual([
        { unitId: 'carton', quantity: 5 },
        { unitId: 'piece', quantity: 5 },
      ]);
    });

    it('preserves the normalized quantity across the break', () => {
      const received = receive(emptyState(), 'carton', 6, cokeGraph);
      const afterSale = issue(received, 'piece', 1, cokeGraph).state;

      // 36 in, 1 out, 35 left — the packaging changed shape, not the amount.
      expect(normalizedTotal(afterSale, cokeGraph)).toBe(35);
    });
  });

  describe('package factors belong to the product', () => {
    it('normalises the same unit names differently for different products', () => {
      const otherGraph = UnitGraph.build(
        ['carton', 'piece'],
        [{ parentUnitId: 'carton', childUnitId: 'piece', factor: 48 }],
      );

      expect(cokeGraph.normalize(1, 'carton')).toBe(6);
      expect(otherGraph.normalize(1, 'carton')).toBe(48);
    });

    it('resolves a chain down to the smallest unit', () => {
      expect(sugarGraph.normalize(1, 'sack')).toBe(50_000);
      expect(sugarGraph.normalize(1, 'kg')).toBe(1_000);
      expect(sugarGraph.normalize(1, 'g')).toBe(1);
    });
  });

  describe('receiving', () => {
    it('keeps packages in the shape they arrived in', () => {
      const state = receive(emptyState(), 'carton', 6, cokeGraph);

      expect(state.get('carton')).toBe(6);
      expect(state.get('piece')).toBeUndefined();
    });

    it('adds to what is already there', () => {
      let state = receive(emptyState(), 'carton', 2, cokeGraph);
      state = receive(state, 'carton', 3, cokeGraph);

      expect(state.get('carton')).toBe(5);
    });

    it('keeps loose pieces separate from cartons', () => {
      let state = receive(emptyState(), 'carton', 1, cokeGraph);
      state = receive(state, 'piece', 4, cokeGraph);

      expect(describeState(state, cokeGraph)).toEqual([
        { unitId: 'carton', quantity: 1 },
        { unitId: 'piece', quantity: 4 },
      ]);
    });

    it('refuses a quantity that is not positive', () => {
      expect(() => receive(emptyState(), 'carton', 0, cokeGraph)).toThrow();
      expect(() => receive(emptyState(), 'carton', -1, cokeGraph)).toThrow();
    });

    it('refuses a unit that is not this product’s', () => {
      expect(() => receive(emptyState(), 'bale', 1, cokeGraph)).toThrow();
    });
  });

  describe('breaking a package open', () => {
    it('takes loose stock first and leaves packages closed', () => {
      const state = stateFrom([
        ['carton', 2],
        ['piece', 5],
      ]);
      const after = issue(state, 'piece', 3, cokeGraph).state;

      expect(after.get('carton')).toBe(2);
      expect(after.get('piece')).toBe(2);
    });

    it('breaks exactly one carton when loose stock runs out', () => {
      const state = stateFrom([['carton', 1]]);
      const after = issue(state, 'piece', 1, cokeGraph).state;

      expect(describeState(after, cokeGraph)).toEqual([{ unitId: 'piece', quantity: 5 }]);
    });

    it('breaks more than one when the sale is larger than a package', () => {
      const state = stateFrom([['carton', 3]]);
      const after = issue(state, 'piece', 8, cokeGraph).state;

      // Two cartons opened, twelve pieces freed, eight sold, four left loose.
      expect(describeState(after, cokeGraph)).toEqual([
        { unitId: 'carton', quantity: 1 },
        { unitId: 'piece', quantity: 4 },
      ]);
    });

    it('breaks down a chain, one level at a time', () => {
      const state = stateFrom([['sack', 1]]);
      const after = issue(state, 'g', 1, sugarGraph).state;

      // One sack became 50 kg; one kg became 1,000 g; one gram sold.
      expect(describeState(after, sugarGraph)).toEqual([
        { unitId: 'kg', quantity: 49 },
        { unitId: 'g', quantity: 999 },
      ]);
      expect(normalizedTotal(after, sugarGraph)).toBe(49_999);
    });

    it('opens the nearest larger package, not the largest one', () => {
      const state = stateFrom([
        ['sack', 1],
        ['kg', 2],
      ]);
      const after = issue(state, 'g', 1, sugarGraph).state;

      // A kg was opened; the sack was left alone.
      expect(after.get('sack')).toBe(1);
      expect(after.get('kg')).toBe(1);
      expect(after.get('g')).toBe(999);
    });
  });

  describe('never repackaging upward', () => {
    it('leaves six loose pieces as six loose pieces', () => {
      const state = receive(emptyState(), 'piece', 6, cokeGraph);

      expect(describeState(state, cokeGraph)).toEqual([{ unitId: 'piece', quantity: 6 }]);
      expect(state.get('carton')).toBeUndefined();
    });

    it('does not invent a carton after pieces accumulate past a factor', () => {
      let state = receive(emptyState(), 'piece', 5, cokeGraph);
      state = receive(state, 'piece', 8, cokeGraph);

      expect(state.get('piece')).toBe(13);
      expect(state.get('carton')).toBeUndefined();
    });

    it('does not turn loose pieces into a carton to satisfy a sale', () => {
      const state = stateFrom([['piece', 12]]);

      // Normalized arithmetic says two cartons' worth is present, and it is —
      // but there is no box. Selling a Carton takes the Carton line negative
      // and leaves the twelve Pieces exactly where they are.
      expect(normalizedTotal(state, cokeGraph)).toBe(12);

      const { state: after } = issue(state, 'carton', 1, cokeGraph);

      expect(after.get('carton')).toBe(-1);
      expect(after.get('piece')).toBe(12);
    });
  });

  describe('selling more than the records show', () => {
    // The negative-stock policy, confirmed by the owner on 2026-08-23 and
    // allowed for by doc 02 §5. The seller is holding the item; the shop
    // plainly has it, whatever the count says. Refusing would make Shoprex
    // argue with physical reality in front of a customer.

    it('completes the removal and goes negative', () => {
      const state = stateFrom([['piece', 2]]);
      const { state: after } = issue(state, 'piece', 5, cokeGraph);

      expect(after.get('piece')).toBe(-3);
    });

    it('reports how much the records could not cover', () => {
      const state = stateFrom([['piece', 2]]);

      expect(issue(state, 'piece', 5, cokeGraph).shortfallNormalized).toBe(3);
    });

    it('reports no shortfall on an ordinary sale', () => {
      const state = stateFrom([['piece', 9]]);

      expect(issue(state, 'piece', 5, cokeGraph).shortfallNormalized).toBe(0);
    });

    it('sells a product the shop has no record of at all', () => {
      // Exactly the mid-sale creation case: the product was made seconds ago,
      // so of course nothing has been received against it.
      const { state: after, shortfallNormalized } = issue(emptyState(), 'piece', 1, cokeGraph);

      expect(after.get('piece')).toBe(-1);
      expect(shortfallNormalized).toBe(1);
    });

    it('measures the shortfall in base units, not in the unit sold', () => {
      const state = stateFrom([['piece', 2]]);

      // One Carton is six Pieces; two are there, so four are missing.
      expect(issue(state, 'carton', 1, cokeGraph).shortfallNormalized).toBe(4);
    });

    it('empties what it can before going negative', () => {
      const state = stateFrom([['carton', 1]]);
      const { state: after, shortfallNormalized } = issue(state, 'piece', 8, cokeGraph);

      // The carton is opened for its six, then the balance takes the last two.
      expect(after.get('carton')).toBeUndefined();
      expect(after.get('piece')).toBe(-2);
      expect(shortfallNormalized).toBe(2);
    });

    it('lets a later delivery settle the shortfall without anyone doing arithmetic', () => {
      // The whole reason the balance is allowed to go negative.
      const { state: short } = issue(stateFrom([['piece', 2]]), 'piece', 5, cokeGraph);
      const restocked = receive(short, 'piece', 10, cokeGraph);

      expect(restocked.get('piece')).toBe(7);
      expect(normalizedTotal(restocked, cokeGraph)).toBe(7);
    });

    it('still refuses to hand over a package it does not physically have', () => {
      // Twelve loose Pieces are two Cartons' worth of stock and no Cartons at
      // all. Selling one goes negative on the Carton rather than inventing a
      // box — the engine never repackages upward, shortfall or not.
      const state = stateFrom([['piece', 12]]);
      const { state: after } = issue(state, 'carton', 1, cokeGraph);

      expect(after.get('carton')).toBe(-1);
      expect(after.get('piece')).toBe(12);
    });

    it('does not mutate the state it was given', () => {
      const state = stateFrom([['carton', 1]]);
      const { state: after } = issue(state, 'piece', 1, cokeGraph);

      expect(state.get('carton')).toBe(1);
      expect(after.get('carton')).toBeUndefined();
    });
  });

  describe('describing what the shop holds', () => {
    it('says the largest package first', () => {
      const state = stateFrom([
        ['g', 200],
        ['sack', 1],
        ['kg', 3],
      ]);

      expect(describeState(state, sugarGraph).map((entry) => entry.unitId)).toEqual([
        'sack',
        'kg',
        'g',
      ]);
    });

    it('leaves out a unit the shop holds none of', () => {
      const state = stateFrom([
        ['carton', 2],
        ['piece', 0],
      ]);

      expect(describeState(state, cokeGraph)).toEqual([{ unitId: 'carton', quantity: 2 }]);
    });

    it('describes an empty shelf as nothing at all', () => {
      expect(describeState(emptyState(), cokeGraph)).toEqual([]);
      expect(normalizedTotal(emptyState(), cokeGraph)).toBe(0);
    });
  });
});
