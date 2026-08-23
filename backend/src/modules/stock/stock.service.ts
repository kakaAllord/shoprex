import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  StockDirection,
  StockMovementReason,
} from '@prisma/client';
import { requireBranchAccess } from '../../common/branch-access';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { requireBusiness } from '../../common/tenancy';
import { PrismaService } from '../../database/prisma.service';
import {
  PhysicalState,
  describeState,
  issue,
  normalizedTotal,
  receive,
  stateFrom,
} from '../../domain/stock';
import { UnitGraph } from '../../domain/units';
import { AuditService } from '../audit/audit.service';
import { actorFrom } from '../users/users.service';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';

export interface StockUnitView {
  unitId: string;
  unitName: string;
  quantity: number;
  factorToBase: number;
}

/** What a removal did, and what it revealed about the count. */
export interface IssuedStock {
  stock: ProductStockView;
  /**
   * How much the records could not cover, in base units. Zero on an ordinary
   * sale; above zero means the count was already wrong and the branch balance
   * has gone negative by this much.
   */
  shortfallNormalized: number;
}

export interface ProductStockView {
  productId: string;
  productName: string;
  branchId: string;
  /** The physical package state, largest packaging first: 5 Cartons + 5 Pieces. */
  packages: StockUnitView[];
  /** The same holding as one number in base units. */
  normalizedQuantity: number;
  baseUnitId: string;
  baseUnitName: string;
}

export interface StockReceiptView {
  id: string;
  branchId: string;
  receivedById: string;
  receivedByName: string;
  deviceId: string | null;
  note: string | null;
  lines: Array<{
    productId: string;
    productName: string;
    unitId: string;
    unitName: string;
    quantity: number;
    normalizedQuantity: number;
    unitCostTzs: number | null;
  }>;
  createdAt: Date;
}

/** What one movement changes, in the caller's own words rather than rows. */
export interface StockChange {
  productId: string;
  unitId: string;
  quantity: number;
}

/**
 * A product, one of its units, and the unit graph they belong to — looked up
 * once and passed around, so a caller that already needs the price and the
 * conversion factor does not query for them a second time.
 */
export type ResolvedUnit = Awaited<ReturnType<StockService['resolveUnit']>>;

/**
 * Either the Prisma client or a transaction handle. Every read below accepts
 * one, so a caller running inside its own transaction sees its own writes.
 */
type StockClient = Prisma.TransactionClient;

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records a delivery into one branch.
   *
   * Stock is added in the packaging it arrived in — six Cartons are six
   * Cartons, not thirty-six Pieces — because that is what is on the floor. The
   * whole receipt is one transaction: a delivery that fails on its third line
   * must not leave the first two in stock.
   */
  async receiveStock(
    principal: AuthenticatedUser,
    branchId: string,
    dto: CreateStockReceiptDto,
  ): Promise<StockReceiptView> {
    const businessId = requireBusiness(principal);

    await requireBranchAccess(this.prisma, principal, branchId);

    if (dto.lines.length === 0) {
      throw new BadRequestException('A delivery needs at least one line');
    }

    const resolved = await Promise.all(
      dto.lines.map((line) =>
        this.resolveUnit(this.prisma, businessId, line.productId, line.productUnitId),
      ),
    );

    const receipt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stockReceipt.create({
        data: {
          businessId,
          branchId,
          receivedById: principal.userId,
          deviceId: principal.deviceId,
          note: dto.note?.trim() || null,
        },
      });

      for (const [index, line] of dto.lines.entries()) {
        const { product, unit, graph } = resolved[index];
        const normalizedQuantity = graph.normalize(line.quantity, unit.id);

        await tx.stockReceiptLine.create({
          data: {
            receiptId: created.id,
            productId: product.id,
            productUnitId: unit.id,
            quantity: line.quantity,
            unitCostTzs: line.unitCostTzs ?? null,
            normalizedQuantity,
          },
        });

        const state = await this.loadState(tx, branchId, product.id);
        const next = receive(state, unit.id, line.quantity, graph);

        await this.persistState(tx, businessId, branchId, product.id, state, next);

        await tx.stockMovement.create({
          data: {
            businessId,
            branchId,
            productId: product.id,
            productUnitId: unit.id,
            direction: StockDirection.IN,
            reason: StockMovementReason.RECEIPT,
            quantity: line.quantity,
            normalizedQuantity,
            conversionFactor: graph.factorToBase(unit.id),
            sourceType: 'StockReceipt',
            sourceId: created.id,
            actorUserId: principal.userId,
            deviceId: principal.deviceId,
          },
        });
      }

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          branchId,
          action: AuditAction.STOCK_RECEIVED,
          targetType: 'StockReceipt',
          targetId: created.id,
          summary: `Mzigo wa bidhaa ${dto.lines.length} umepokelewa · Stock received, ${dto.lines.length} line(s)`,
        },
        tx,
      );

      return created.id;
    });

    this.logger.log(`Stock received: ${receipt} at branch ${branchId}`);

    return this.findReceipt(principal, branchId, receipt);
  }

  /**
   * Removes stock, breaking larger packages open as needed.
   *
   * **Phase 3 exposes this at the service level only — there is no HTTP route.**
   * Phase 4 builds the sale on top of it, so that the cart, payment settlement,
   * and idempotency are designed once, in the phase that owns them, rather than
   * guessed at here.
   */
  async issueStock(
    principal: AuthenticatedUser,
    branchId: string,
    change: StockChange,
    reason: StockMovementReason = StockMovementReason.SALE,
    source?: { type: string; id: string },
  ): Promise<IssuedStock> {
    const businessId = requireBusiness(principal);
    const resolved = await this.resolveUnit(
      this.prisma,
      businessId,
      change.productId,
      change.unitId,
    );

    return this.prisma.$transaction((tx) =>
      this.issueWithin(tx, principal, branchId, resolved, change, reason, source),
    );
  }

  /**
   * The same removal, run inside a transaction the caller already owns.
   *
   * A sale is one command: its lines, its payments, and the stock they remove
   * either all happen or none do. That is only true if the stock write joins
   * the sale's own transaction rather than opening a second one beside it, so
   * `SalesService` passes its `tx` in here — see PROGRESS.md §3's handoff note.
   */
  async issueWithin(
    tx: StockClient,
    principal: AuthenticatedUser,
    branchId: string,
    resolved: ResolvedUnit,
    change: StockChange,
    reason: StockMovementReason = StockMovementReason.SALE,
    source?: { type: string; id: string },
  ): Promise<IssuedStock> {
    const businessId = requireBusiness(principal);
    const { product, unit, graph } = resolved;
    const state = await this.loadState(tx, branchId, product.id);

    // A shortfall never stops the removal. The seller is holding the item, so
    // the shop has it whatever the records say, and refusing would make
    // Shoprex argue with physical reality in front of a customer. The balance
    // goes negative and the caller records the difference as an inconsistency.
    const { state: next, shortfallNormalized } = issue(
      state,
      unit.id,
      change.quantity,
      graph,
    );

    if (shortfallNormalized > 0) {
      this.logger.warn(
        `Stock inconsistency at branch ${branchId}: ${product.name} short by ${shortfallNormalized} ${graph.baseUnitId === unit.id ? unit.name : 'base unit(s)'}`,
      );
    }

    await this.persistState(tx, businessId, branchId, product.id, state, next);

    await tx.stockMovement.create({
      data: {
        businessId,
        branchId,
        productId: product.id,
        productUnitId: unit.id,
        direction: StockDirection.OUT,
        reason,
        quantity: change.quantity,
        normalizedQuantity: graph.normalize(change.quantity, unit.id),
        conversionFactor: graph.factorToBase(unit.id),
        sourceType: source?.type ?? null,
        sourceId: source?.id ?? null,
        actorUserId: principal.userId,
        deviceId: principal.deviceId,
      },
    });

    return { stock: this.viewFor(product, graph, branchId, next), shortfallNormalized };
  }

  /** What a branch physically holds, product by product. */
  async listForBranch(
    principal: AuthenticatedUser,
    branchId: string,
  ): Promise<ProductStockView[]> {
    const businessId = requireBusiness(principal);

    await requireBranchAccess(this.prisma, principal, branchId);

    const rows = await this.prisma.physicalStock.findMany({
      // `not: 0` rather than `gt: 0`: a negative balance is a shop being told
      // its count is wrong, and it must not be filtered out of the very list
      // the owner would look at to find it.
      where: { businessId, branchId, quantity: { not: 0 } },
      include: { product: { include: { units: true, relationships: true } } },
    });

    const byProduct = new Map<string, typeof rows>();

    for (const row of rows) {
      byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), row]);
    }

    return [...byProduct.values()]
      .map((productRows) => {
        const product = productRows[0].product;
        const graph = this.graphFor(product);

        return this.viewFor(
          product,
          graph,
          branchId,
          stateFrom(productRows.map((row) => [row.productUnitId, row.quantity] as const)),
        );
      })
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }

  /** One product's holding in one branch, including when it is zero. */
  async findForProduct(
    principal: AuthenticatedUser,
    branchId: string,
    productId: string,
  ): Promise<ProductStockView> {
    const businessId = requireBusiness(principal);

    await requireBranchAccess(this.prisma, principal, branchId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: { units: true, relationships: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const rows = await this.prisma.physicalStock.findMany({
      where: { branchId, productId },
    });

    return this.viewFor(
      product,
      this.graphFor(product),
      branchId,
      stateFrom(rows.map((row) => [row.productUnitId, row.quantity] as const)),
    );
  }

  private async findReceipt(
    principal: AuthenticatedUser,
    branchId: string,
    receiptId: string,
  ): Promise<StockReceiptView> {
    const businessId = requireBusiness(principal);

    const receipt = await this.prisma.stockReceipt.findFirst({
      where: { id: receiptId, businessId, branchId },
      include: {
        receivedBy: { select: { fullName: true } },
        lines: {
          include: {
            product: { select: { name: true } },
            productUnit: { select: { name: true } },
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Stock receipt not found');
    }

    return {
      id: receipt.id,
      branchId: receipt.branchId,
      receivedById: receipt.receivedById,
      receivedByName: receipt.receivedBy.fullName,
      deviceId: receipt.deviceId,
      note: receipt.note,
      lines: receipt.lines.map((line) => ({
        productId: line.productId,
        productName: line.product.name,
        unitId: line.productUnitId,
        unitName: line.productUnit.name,
        quantity: line.quantity,
        normalizedQuantity: line.normalizedQuantity,
        unitCostTzs: line.unitCostTzs,
      })),
      createdAt: receipt.createdAt,
    };
  }

  /**
   * A product and one of its units, or a 404. Public because the sale command
   * needs the unit's price and conversion factor for its own snapshots, and
   * looking them up twice would be one query too many and one chance to
   * disagree.
   */
  async resolveUnit(client: StockClient, businessId: string, productId: string, unitId: string) {
    const product = await client.product.findFirst({
      where: { id: productId, businessId },
      include: { units: true, relationships: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Every write path to stock comes through here - receiving, selling, and
    // the bare issue - and only the write paths do. That is why the
    // discontinued check belongs here rather than in three places: an owner who
    // stopped carrying an item says so once, and Stoo can still show what is
    // left on the shelf while a receipt can still be read back.
    if (!product.isActive) {
      throw new ConflictException(
        product.name + ' imesitishwa · That item has been discontinued and can no longer be sold or received',
      );
    }

    const unit = product.units.find((candidate) => candidate.id === unitId);

    if (!unit) {
      throw new NotFoundException('That unit does not belong to this product');
    }

    return { product, unit, graph: this.graphFor(product) };
  }

  private graphFor(product: {
    units: Array<{ id: string }>;
    relationships: Array<{ parentUnitId: string; childUnitId: string; factor: number }>;
  }): UnitGraph {
    return UnitGraph.build(
      product.units.map((unit) => unit.id),
      product.relationships.map((relation) => ({
        parentUnitId: relation.parentUnitId,
        childUnitId: relation.childUnitId,
        factor: relation.factor,
      })),
    );
  }

  private async loadState(
    tx: StockClient,
    branchId: string,
    productId: string,
  ): Promise<PhysicalState> {
    const rows = await tx.physicalStock.findMany({ where: { branchId, productId } });

    return stateFrom(rows.map((row) => [row.productUnitId, row.quantity] as const));
  }

  /** Writes only the units whose count actually moved. */
  private async persistState(
    tx: StockClient,
    businessId: string,
    branchId: string,
    productId: string,
    before: PhysicalState,
    after: PhysicalState,
  ): Promise<void> {
    const unitIds = new Set([...before.keys(), ...after.keys()]);

    for (const unitId of unitIds) {
      const next = after.get(unitId) ?? 0;

      if ((before.get(unitId) ?? 0) === next) {
        continue;
      }

      await tx.physicalStock.upsert({
        where: { branchId_productUnitId: { branchId, productUnitId: unitId } },
        create: { businessId, branchId, productId, productUnitId: unitId, quantity: next },
        update: { quantity: next },
      });
    }
  }

  private viewFor(
    product: { id: string; name: string; units: Array<{ id: string; name: string }> },
    graph: UnitGraph,
    branchId: string,
    state: PhysicalState,
  ): ProductStockView {
    const nameOf = (unitId: string) =>
      product.units.find((unit) => unit.id === unitId)?.name ?? unitId;

    return {
      productId: product.id,
      productName: product.name,
      branchId,
      packages: describeState(state, graph).map((entry) => ({
        unitId: entry.unitId,
        unitName: nameOf(entry.unitId),
        quantity: entry.quantity,
        factorToBase: graph.factorToBase(entry.unitId),
      })),
      normalizedQuantity: normalizedTotal(state, graph),
      baseUnitId: graph.baseUnitId,
      baseUnitName: nameOf(graph.baseUnitId),
    };
  }
}
