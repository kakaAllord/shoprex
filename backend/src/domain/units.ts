/**
 * Package relationships — the part of Shoprex that is not a generic POS.
 *
 * A package name carries no universal meaning. Product A defines
 * `1 Carton = 6 Pieces`; product B defines `1 Carton = 48 Pieces`. So every
 * relationship belongs to its product, and there is exactly one shape for all
 * of them:
 *
 *     one parent unit contains `factor` × child unit
 *
 * Everything else here follows from that: a product's units form a tree whose
 * leaf is the *base unit*, all arithmetic happens in base units, and a graph
 * that is not a tree — a cycle, a self-reference, two disconnected pieces — is
 * refused rather than normalised into something plausible.
 *
 * See docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md §4.
 */

export interface UnitRelation {
  parentUnitId: string;
  childUnitId: string;
  /** How many child units are inside one parent. Always a positive integer. */
  factor: number;
}

export class UnitGraphError extends Error {}

/**
 * Measurement conversions that are facts about the world, not decisions a shop
 * gets to make. A business defining `1 kg = 900 g` is refused: that is either a
 * mistake or an attempt to hide a shortfall in the arithmetic, and doc 02 §4
 * says fixed conversions stay fixed.
 *
 * Keyed by lower-cased unit name, since shops type "Kg", "kg", and "KG".
 */
export const FIXED_CONVERSIONS: ReadonlyArray<{
  parent: string;
  child: string;
  factor: number;
}> = [
  { parent: 'kg', child: 'g', factor: 1000 },
  { parent: 'l', child: 'ml', factor: 1000 },
  { parent: 'm', child: 'cm', factor: 100 },
  { parent: 'dozen', child: 'count', factor: 12 },
];

/**
 * The fixed factor between two unit names, or null when the pair is not a
 * measurement conversion at all and the shop is free to define it.
 */
export function fixedConversionFor(parentName: string, childName: string): number | null {
  const parent = parentName.trim().toLowerCase();
  const child = childName.trim().toLowerCase();

  return (
    FIXED_CONVERSIONS.find(
      (conversion) => conversion.parent === parent && conversion.child === child,
    )?.factor ?? null
  );
}

/**
 * Refuses a relationship that contradicts a fixed conversion. Passing a pair
 * that is not fixed at all is fine — most are not.
 */
export function assertFixedConversionRespected(
  parentName: string,
  childName: string,
  factor: number,
): void {
  const fixed = fixedConversionFor(parentName, childName);

  if (fixed !== null && fixed !== factor) {
    throw new UnitGraphError(
      `1 ${parentName} is always ${fixed} ${childName}, and a business cannot redefine it`,
    );
  }
}

/**
 * A validated set of a product's relationships, with the arithmetic derived
 * once so callers never walk the edges themselves.
 */
export class UnitGraph {
  private readonly factors = new Map<string, number>();

  private constructor(
    readonly unitIds: readonly string[],
    readonly baseUnitId: string,
    readonly relations: readonly UnitRelation[],
  ) {
    this.factors.set(baseUnitId, 1);
    this.resolveFactors();
  }

  /**
   * Builds the graph, refusing anything that is not a single tree.
   *
   * `unitIds` is passed separately from the relations because a product may
   * legitimately have one unit and no relationship at all — a shop selling only
   * by Carton is never asked what a Piece is until it sells one.
   */
  static build(unitIds: readonly string[], relations: readonly UnitRelation[]): UnitGraph {
    if (unitIds.length === 0) {
      throw new UnitGraphError('A product needs at least one unit');
    }

    const known = new Set(unitIds);

    for (const relation of relations) {
      if (relation.parentUnitId === relation.childUnitId) {
        throw new UnitGraphError('A unit cannot contain itself');
      }

      if (!known.has(relation.parentUnitId) || !known.has(relation.childUnitId)) {
        throw new UnitGraphError('A relationship must join two units of the same product');
      }

      if (!Number.isInteger(relation.factor) || relation.factor < 1) {
        throw new UnitGraphError('A package factor must be a whole number of at least 1');
      }
    }

    const duplicates = new Set<string>();

    for (const relation of relations) {
      const key = `${relation.parentUnitId}>${relation.childUnitId}`;

      if (duplicates.has(key)) {
        throw new UnitGraphError('Those two units are already related');
      }

      duplicates.add(key);
    }

    // One parent per unit keeps this a tree rather than a lattice: two routes
    // from Carton down to Gram could disagree, and there is no honest way to
    // pick a winner.
    const parentOf = new Map<string, string>();

    for (const relation of relations) {
      if (parentOf.has(relation.childUnitId)) {
        throw new UnitGraphError(
          'A unit can sit inside only one larger unit; remove the other relationship first',
        );
      }

      parentOf.set(relation.childUnitId, relation.parentUnitId);
    }

    UnitGraph.assertAcyclic(unitIds, relations);

    const bases = unitIds.filter(
      (unitId) => !relations.some((relation) => relation.parentUnitId === unitId),
    );

    if (bases.length !== 1) {
      throw new UnitGraphError(
        'Every unit of a product must connect to the others, so one smallest unit does the arithmetic',
      );
    }

    return new UnitGraph(unitIds, bases[0], relations);
  }

  /** How many base units are inside one of `unitId`. */
  factorToBase(unitId: string): number {
    const factor = this.factors.get(unitId);

    if (factor === undefined) {
      throw new UnitGraphError('That unit does not belong to this product');
    }

    return factor;
  }

  /** Converts a quantity of any unit into base units, for arithmetic. */
  normalize(quantity: number, unitId: string): number {
    return quantity * this.factorToBase(unitId);
  }

  /** The unit directly containing `unitId`, or null when it is the largest. */
  parentOf(unitId: string): string | null {
    return (
      this.relations.find((relation) => relation.childUnitId === unitId)?.parentUnitId ?? null
    );
  }

  /** The units directly inside `unitId`, largest-first is not meaningful here. */
  childrenOf(unitId: string): UnitRelation[] {
    return this.relations.filter((relation) => relation.parentUnitId === unitId);
  }

  /**
   * The chain from `unitId` up to the largest unit, nearest first. Used when
   * stock has to be broken open: the nearest ancestor holding stock is the one
   * to break, so a Sack is not torn apart when a kg would have done.
   */
  ancestorsOf(unitId: string): string[] {
    const chain: string[] = [];
    let current = this.parentOf(unitId);

    while (current) {
      chain.push(current);
      current = this.parentOf(current);
    }

    return chain;
  }

  private resolveFactors(): void {
    // Walk down from the base: every child's factor is already known by the
    // time its parent is computed, because the graph is a tree.
    let progress = true;

    while (progress && this.factors.size < this.unitIds.length) {
      progress = false;

      for (const relation of this.relations) {
        const childFactor = this.factors.get(relation.childUnitId);

        if (childFactor !== undefined && !this.factors.has(relation.parentUnitId)) {
          this.factors.set(relation.parentUnitId, childFactor * relation.factor);
          progress = true;
        }
      }
    }

    if (this.factors.size !== this.unitIds.length) {
      throw new UnitGraphError(
        'Every unit of a product must connect to the others, so one smallest unit does the arithmetic',
      );
    }
  }

  private static assertAcyclic(
    unitIds: readonly string[],
    relations: readonly UnitRelation[],
  ): void {
    const visiting = new Set<string>();
    const settled = new Set<string>();

    const descend = (unitId: string): void => {
      if (settled.has(unitId)) {
        return;
      }

      if (visiting.has(unitId)) {
        throw new UnitGraphError(
          'Those units would contain each other; a package cannot hold itself',
        );
      }

      visiting.add(unitId);

      for (const relation of relations.filter((edge) => edge.parentUnitId === unitId)) {
        descend(relation.childUnitId);
      }

      visiting.delete(unitId);
      settled.add(unitId);
    };

    for (const unitId of unitIds) {
      descend(unitId);
    }
  }
}
