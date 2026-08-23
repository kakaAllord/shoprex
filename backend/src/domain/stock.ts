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

/** What a removal actually did, including what the shop turned out not to have. */
export interface Issued {
  state: PhysicalState;
  /**
   * How much of the request the records could not cover, in base units. Zero
   * on an ordinary sale. Anything above zero means the count was wrong before
   * this movement, not that the movement was.
   */
  shortfallNormalized: number;
}

/**
 * Removing stock, breaking larger packages open only as far as necessary.
 *
 * **A shortfall does not stop the removal.** The person holding the phone is
 * holding the item; the shop plainly has it, whatever the records say, and
 * refusing the sale would make Shoprex argue with physical reality in front of
 * a customer. So the removal always happens, the balance is allowed to go
 * negative, and the difference is reported back as `shortfallNormalized` for
 * the caller to record as an inconsistency.
 *
 * A negative balance is deliberate and self-correcting: received minus sold
 * always equals the balance, so a shop that sells 5 with 2 recorded sits at
 * -3, and receiving 10 later lands on the true 7 with nobody doing arithmetic
 * by hand. Doc 02 §5 allowed for this — it is the "separate approved
 * negative-stock policy", confirmed by the owner on 2026-08-23.
 *
 * What has not changed: the engine still never repackages upward, and it still
 * breaks the *nearest* larger package rather than the biggest one.
 */
export function issue(
  state: PhysicalState,
  unitId: string,
  quantity: number,
  graph: UnitGraph,
): Issued {
  assertPositive(quantity);

  const requested = graph.normalize(quantity, unitId);
  const available = normalizedTotal(state, graph);
  const shortfallNormalized = Math.max(requested - available, 0);

  const next = new Map(state);

  // Break open only what there is. Once nothing larger is left to open, the
  // loop stops and the subtraction below takes the balance negative.
  while ((next.get(unitId) ?? 0) < quantity && canBreakOpen(next, unitId, graph)) {
    breakOneOpen(next, unitId, graph);
  }

  const remaining = (next.get(unitId) ?? 0) - quantity;

  if (remaining === 0) {
    next.delete(unitId);
  } else {
    next.set(unitId, remaining);
  }

  return { state: next, shortfallNormalized };
}

/** Whether any larger package is left to open. */
function canBreakOpen(state: Map<string, number>, unitId: string, graph: UnitGraph): boolean {
  return graph.ancestorsOf(unitId).some((ancestorId) => (state.get(ancestorId) ?? 0) > 0);
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
    // canBreakOpen is checked first, so reaching here would mean the graph and
    // the state disagree about which units belong together.
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
  // Zero is left out — a unit the shop holds none of is not worth saying. A
  // *negative* one very much is: it is the shop being told its count is wrong,
  // and hiding it would defeat the whole point of letting the balance go
  // negative in the first place.
  return [...state]
    .filter(([, quantity]) => quantity !== 0)
    .sort(([a], [b]) => graph.factorToBase(b) - graph.factorToBase(a))
    .map(([unitId, quantity]) => ({ unitId, quantity }));
}

function assertPositive(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('A stock quantity must be greater than zero');
  }
}
