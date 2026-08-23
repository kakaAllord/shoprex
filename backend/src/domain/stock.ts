import { UnitGraph } from './units';

/**
 * Physical stock, and the arithmetic over it.
 *
 * Shoprex keeps two views of the same truth. The **normalized quantity** is one
 * number in base units, used for arithmetic and reconciliation. The **physical
 * package state** is what a shopkeeper would actually recite — `5 Cartons +
 * 5 Pieces` — and it is what the shop sees.
 *
 * Two rules make this more than bookkeeping, both from doc 02 §5:
 *
 * - Selling a Piece when none are loose **breaks open** a Carton. That is what
 *   physically happens, so the record should say so.
 * - The engine **never repackages upward**. Six loose Pieces do not silently
 *   become a Carton, because in the shop they are still six loose Pieces and
 *   nobody taped a box around them.
 *
 * Every function here is pure and returns a new state, so a transaction that
 * turns out to be impossible cannot leave stock half-changed.
 */

/** How many of each unit are physically present. Absent means none. */
export type PhysicalState = ReadonlyMap<string, number>;

export class InsufficientStockError extends Error {
  constructor(
    readonly requestedNormalized: number,
    readonly availableNormalized: number,
  ) {
    super('There is not enough stock to cover that');
  }
}

export function emptyState(): PhysicalState {
  return new Map<string, number>();
}

export function stateFrom(entries: Iterable<readonly [string, number]>): PhysicalState {
  const state = new Map<string, number>();

  for (const [unitId, quantity] of entries) {
    if (quantity !== 0) {
      state.set(unitId, (state.get(unitId) ?? 0) + quantity);
    }
  }

  return state;
}

/** The whole holding expressed in base units. */
export function normalizedTotal(state: PhysicalState, graph: UnitGraph): number {
  let total = 0;

  for (const [unitId, quantity] of state) {
    total += graph.normalize(quantity, unitId);
  }

  return total;
}

/**
 * Receiving adds packages exactly as they arrived. Six Cartons are six Cartons;
 * they are not converted into thirty-six Pieces, because the shop has six boxes
 * on the floor.
 */
export function receive(
  state: PhysicalState,
  unitId: string,
  quantity: number,
  graph: UnitGraph,
): PhysicalState {
  assertPositive(quantity);
  graph.factorToBase(unitId);

  const next = new Map(state);

  next.set(unitId, (next.get(unitId) ?? 0) + quantity);

  return next;
}

/**
 * Removing stock, breaking larger packages open only as far as necessary.
 *
 * Refuses before changing anything when the shop simply does not hold enough:
 * doc 02 §5 says the transaction fails safely rather than hiding a deficit by
 * changing a unit or a price.
 */
export function issue(
  state: PhysicalState,
  unitId: string,
  quantity: number,
  graph: UnitGraph,
): PhysicalState {
  assertPositive(quantity);

  const requested = graph.normalize(quantity, unitId);
  const available = normalizedTotal(state, graph);

  if (requested > available) {
    throw new InsufficientStockError(requested, available);
  }

  const next = new Map(state);

  while ((next.get(unitId) ?? 0) < quantity) {
    breakOneOpen(next, unitId, graph);
  }

  const remaining = (next.get(unitId) ?? 0) - quantity;

  if (remaining === 0) {
    next.delete(unitId);
  } else {
    next.set(unitId, remaining);
  }

  return next;
}

/**
 * Opens the nearest larger package that has any stock, so a Sack is not torn
 * apart when breaking a single kg would have served.
 */
function breakOneOpen(state: Map<string, number>, unitId: string, graph: UnitGraph): void {
  const source = graph
    .ancestorsOf(unitId)
    .find((ancestorId) => (state.get(ancestorId) ?? 0) > 0);

  if (source === undefined) {
    // normalizedTotal already proved the stock exists, so reaching here would
    // mean the graph and the state disagree about which units belong together.
    throw new InsufficientStockError(0, 0);
  }

  const held = state.get(source)!;

  if (held === 1) {
    state.delete(source);
  } else {
    state.set(source, held - 1);
  }

  for (const relation of graph.childrenOf(source)) {
    state.set(
      relation.childUnitId,
      (state.get(relation.childUnitId) ?? 0) + relation.factor,
    );
  }
}

/**
 * The physical state in the order a person would say it, largest package
 * first: `5 Cartons + 5 Pieces`. Units holding nothing are left out entirely
 * rather than shown as zero.
 */
export function describeState(
  state: PhysicalState,
  graph: UnitGraph,
): Array<{ unitId: string; quantity: number }> {
  return [...state]
    .filter(([, quantity]) => quantity > 0)
    .sort(([a], [b]) => graph.factorToBase(b) - graph.factorToBase(a))
    .map(([unitId, quantity]) => ({ unitId, quantity }));
}

function assertPositive(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('A stock quantity must be greater than zero');
  }
}
