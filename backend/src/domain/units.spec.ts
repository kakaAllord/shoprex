import {
  FIXED_CONVERSIONS,
  UnitGraph,
  UnitGraphError,
  assertFixedConversionRespected,
  fixedConversionFor,
} from './units';

describe('unit relationships', () => {
  describe('a product may be incompletely configured', () => {
    it('accepts a product with one unit and no relationship at all', () => {
      const graph = UnitGraph.build(['carton'], []);

      expect(graph.baseUnitId).toBe('carton');
      expect(graph.normalize(3, 'carton')).toBe(3);
    });

    it('accepts the relationship being added later', () => {
      const graph = UnitGraph.build(
        ['carton', 'piece'],
        [{ parentUnitId: 'carton', childUnitId: 'piece', factor: 6 }],
      );

      expect(graph.baseUnitId).toBe('piece');
      expect(graph.normalize(1, 'carton')).toBe(6);
    });

    it('refuses a product with no units', () => {
      expect(() => UnitGraph.build([], [])).toThrow(UnitGraphError);
    });
  });

  describe('rejecting a graph that is not a tree', () => {
    it('refuses a unit that contains itself', () => {
      expect(() =>
        UnitGraph.build(
          ['carton'],
          [{ parentUnitId: 'carton', childUnitId: 'carton', factor: 2 }],
        ),
      ).toThrow(/cannot contain itself/);
    });

    // These assert the *message*, not just the type. Several checks here would
    // each independently reject a cycle — the connectivity check catches one
    // too — so asserting only `UnitGraphError` would pass even with the cycle
    // detection removed, and would not prove the shop is told something useful.
    it('refuses a two-unit cycle, and says why', () => {
      expect(() =>
        UnitGraph.build(
          ['carton', 'piece'],
          [
            { parentUnitId: 'carton', childUnitId: 'piece', factor: 6 },
            { parentUnitId: 'piece', childUnitId: 'carton', factor: 1 },
          ],
        ),
      ).toThrow(/contain each other/);
    });

    it('refuses a longer cycle, and says why', () => {
      expect(() =>
        UnitGraph.build(
          ['a', 'b', 'c'],
          [
            { parentUnitId: 'a', childUnitId: 'b', factor: 2 },
            { parentUnitId: 'b', childUnitId: 'c', factor: 3 },
            { parentUnitId: 'c', childUnitId: 'a', factor: 4 },
          ],
        ),
      ).toThrow(/contain each other/);
    });

    it('refuses a cycle that leaves a valid base unit beside it', () => {
      // a -> b -> c -> a is a closed loop, while d sits apart as a plausible
      // base. Without cycle detection the loop is simply never reached and the
      // failure comes out as a confusing connectivity error instead.
      expect(() =>
        UnitGraph.build(
          ['a', 'b', 'c', 'd'],
          [
            { parentUnitId: 'a', childUnitId: 'b', factor: 2 },
            { parentUnitId: 'b', childUnitId: 'c', factor: 3 },
            { parentUnitId: 'c', childUnitId: 'a', factor: 4 },
          ],
        ),
      ).toThrow(/contain each other/);
    });

    it('refuses a unit sitting inside two different larger units', () => {
      // Carton -> Piece and Bale -> Piece would give two routes to the base
      // that could disagree, and there is no honest way to pick one.
      expect(() =>
        UnitGraph.build(
          ['carton', 'bale', 'piece'],
          [
            { parentUnitId: 'carton', childUnitId: 'piece', factor: 6 },
            { parentUnitId: 'bale', childUnitId: 'piece', factor: 24 },
          ],
        ),
      ).toThrow(/only one larger unit/);
    });

    it('refuses the same pair related twice', () => {
      expect(() =>
        UnitGraph.build(
          ['carton', 'piece'],
          [
            { parentUnitId: 'carton', childUnitId: 'piece', factor: 6 },
            { parentUnitId: 'carton', childUnitId: 'piece', factor: 8 },
          ],
        ),
      ).toThrow(/already related/);
    });

    it('refuses units that do not connect to each other', () => {
      expect(() => UnitGraph.build(['piece', 'kg'], [])).toThrow(/must connect/);
    });

    it('refuses a relationship naming a unit from another product', () => {
      expect(() =>
        UnitGraph.build(
          ['carton', 'piece'],
          [{ parentUnitId: 'carton', childUnitId: 'stranger', factor: 6 }],
        ),
      ).toThrow(/same product/);
    });

    it.each([
      ['zero', 0],
      ['negative', -6],
      ['fractional', 2.5],
    ])('refuses a %s factor', (_label, factor) => {
      expect(() =>
        UnitGraph.build(
          ['carton', 'piece'],
          [{ parentUnitId: 'carton', childUnitId: 'piece', factor }],
        ),
      ).toThrow(/whole number/);
    });
  });

  describe('fixed measurement conversions', () => {
    it.each(FIXED_CONVERSIONS.map((c) => [c.parent, c.child, c.factor]))(
      '1 %s is always %s × %s',
      (parent, child, factor) => {
        expect(fixedConversionFor(parent as string, child as string)).toBe(factor);
      },
    );

    it('does not care how a shop capitalises or spaces the unit name', () => {
      expect(fixedConversionFor(' KG ', 'G')).toBe(1000);
    });

    it('returns null for a pair the shop is free to define', () => {
      expect(fixedConversionFor('carton', 'piece')).toBeNull();
    });

    it('accepts a relationship that agrees with the fixed conversion', () => {
      expect(() => assertFixedConversionRespected('kg', 'g', 1000)).not.toThrow();
    });

    it('refuses a business redefining a fixed conversion', () => {
      expect(() => assertFixedConversionRespected('kg', 'g', 900)).toThrow(
        /cannot redefine/,
      );
    });

    it('leaves a product-specific relationship alone', () => {
      expect(() => assertFixedConversionRespected('carton', 'piece', 48)).not.toThrow();
    });
  });

  describe('walking the graph', () => {
    const graph = UnitGraph.build(
      ['sack', 'kg', 'g'],
      [
        { parentUnitId: 'sack', childUnitId: 'kg', factor: 50 },
        { parentUnitId: 'kg', childUnitId: 'g', factor: 1000 },
      ],
    );

    it('finds the chain upward, nearest first', () => {
      expect(graph.ancestorsOf('g')).toEqual(['kg', 'sack']);
      expect(graph.ancestorsOf('sack')).toEqual([]);
    });

    it('finds what is directly inside a unit', () => {
      expect(graph.childrenOf('sack')).toEqual([
        { parentUnitId: 'sack', childUnitId: 'kg', factor: 50 },
      ]);
      expect(graph.childrenOf('g')).toEqual([]);
    });

    it('refuses to price a unit that is not this product’s', () => {
      expect(() => graph.factorToBase('carton')).toThrow(/does not belong/);
    });
  });
});
