import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  PaymentMethodKind,
  Prisma,
  StockMovementReason,
} from '@prisma/client';
import { requireBranchAccess } from '../../common/branch-access';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { requireBusiness } from '../../common/tenancy';
import { PrismaService } from '../../database/prisma.service';
import {
  PaymentInput,
  PaymentKind,
  SaleMathError,
  lineTotal,
  saleTotal,
  settle,
} from '../../domain/sale';
import { AuditService } from '../audit/audit.service';
import { PaymentMethodsService } from '../payments/payment-methods.service';
import { ResolvedUnit, StockService } from '../stock/stock.service';
import { actorFrom } from '../users/users.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesDto, SALES_PAGE_DEFAULT } from './dto/list-sales.dto';

/**
 * One row of the owner's sales list.
 *
 * Deliberately not a whole `SaleView`. A list is read to find a sale, not to
 * re-read every sale — sending each one's lines and payments would put a
 * day's entire trading through the wire to render fifty rows of a table.
 * Opening a row fetches the receipt.
 */
export interface SaleSummaryView {
  id: string;
  branchId: string;
  soldById: string;
  soldByName: string;
  totalTzs: number;
  changeTzs: number;
  debtTzs: number;
  /** How many commercial units went over the counter, as lines. */
  lineCount: number;
  /** The snapshotted method names, so a renamed method never rewrites a row. */
  paymentMethods: string[];
  /** True when a line sold more than the branch's records held. */
  hasStockInconsistency: boolean;
  createdAt: Date;
}

export interface SalesPageView {
  sales: SaleSummaryView[];
  /** Pass back as `cursor` for the next page. Null when this was the last. */
  nextCursor: string | null;
}

export interface SaleLineView {
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  quantity: number;
  unitPriceTzs: number;
  lineTotalTzs: number;
  conversionFactor: number;
  normalizedQuantity: number;
  /**
   * How much of this line the records could not cover, in base units. Zero on
   * an ordinary sale.
   */
  shortfallNormalized: number;
}

export interface SalePaymentView {
  paymentMethodId: string;
  methodName: string;
  methodKind: PaymentMethodKind;
  amountTzs: number;
  cashReceivedTzs: number | null;
  changeTzs: number | null;
  debtorName: string | null;
}

/** The receipt. Everything a customer was shown, kept as it was shown. */
export interface SaleView {
  id: string;
  branchId: string;
  soldById: string;
  soldByName: string;
  deviceId: string | null;
  totalTzs: number;
  changeTzs: number;
  debtTzs: number;
  lines: SaleLineView[];
  payments: SalePaymentView[];
  /**
   * True when at least one line took more than the branch had recorded. The
   * sale completed regardless — this is a flag for the owner to recount, not a
   * failure the seller did anything about.
   */
  hasStockInconsistency: boolean;
  createdAt: Date;
}

const SALE_INCLUDE = {
  soldBy: { select: { fullName: true } },
  lines: true,
  payments: true,
} satisfies Prisma.SaleInclude;

type SaleRecord = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Completes a sale: one command, one transaction, one outcome.
   *
   * Doc 02 §6 asks for the sale, its lines, the payment settlement, the
   * payment records, and the stock movements to happen together — so they do.
   * Every one of them runs inside a single `$transaction`, including the stock
   * removal, which is why `StockService.issueWithin` exists: a sale whose
   * third line overdraws the branch must leave no sale, no payment, and no
   * movement behind, not two lines' worth of missing stock.
   *
   * Three things are snapshotted onto the sale and never read live again: the
   * product and unit **names**, the **price**, and the **conversion factor**.
   * A shop that reprices Coke tomorrow has not changed what this customer paid
   * today, and a receipt reprinted next month must still say what it said.
   */
  async complete(
    principal: AuthenticatedUser,
    branchId: string,
    dto: CreateSaleDto,
  ): Promise<SaleView> {
    const businessId = requireBusiness(principal);

    await requireBranchAccess(this.prisma, principal, branchId);

    // A retry that arrives after the first attempt committed. The common case,
    // and the cheap one — no work is redone.
    const existing = await this.findByIdempotencyKey(businessId, branchId, dto.idempotencyKey);

    if (existing) {
      return existing;
    }

    const resolved = await this.resolveLines(businessId, dto);
    const priced = resolved.map(({ line, unit }) => ({
      quantity: line.quantity,
      unitPriceTzs: this.priceOf(unit),
    }));

    const totalTzs = this.asBadRequest(() => saleTotal(priced));
    const { methods, settlement } = await this.settlePayments(businessId, dto, totalTzs);

    const saleId = await this.prisma
      .$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: {
            businessId,
            branchId,
            soldById: principal.userId,
            deviceId: principal.deviceId,
            totalTzs,
            changeTzs: settlement.changeTzs,
            debtTzs: settlement.debtTzs,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        // Stock moves first, because a line cannot record its shortfall until
        // the engine has said what the shortfall was.
        const shortfalls: number[] = [];

        for (const { line, product, unit, graph } of resolved) {
          const { shortfallNormalized } = await this.stock.issueWithin(
            tx,
            principal,
            branchId,
            { product, unit, graph } as ResolvedUnit,
            { productId: product.id, unitId: unit.id, quantity: line.quantity },
            StockMovementReason.SALE,
            { type: 'Sale', id: sale.id },
          );

          shortfalls.push(shortfallNormalized);
        }

        await tx.saleLine.createMany({
          data: resolved.map(({ line, product, unit, graph }, index) => ({
            saleId: sale.id,
            productId: product.id,
            productUnitId: unit.id,
            productName: product.name,
            unitName: unit.name,
            quantity: line.quantity,
            unitPriceTzs: priced[index].unitPriceTzs,
            lineTotalTzs: lineTotal(line.quantity, priced[index].unitPriceTzs),
            conversionFactor: graph.factorToBase(unit.id),
            normalizedQuantity: graph.normalize(line.quantity, unit.id),
            shortfallNormalized: shortfalls[index],
          })),
        });

        await tx.salePayment.createMany({
          data: settlement.payments.map((payment, index) => {
            const method = methods[index];

            return {
              saleId: sale.id,
              paymentMethodId: method.id,
              methodName: method.name,
              methodKind: method.kind,
              amountTzs: payment.amountTzs,
              cashReceivedTzs: payment.cashReceivedTzs,
              changeTzs: payment.changeTzs,
              debtorName: payment.debtorName,
            };
          }),
        });

        await this.audit.record(
          actorFrom(principal),
          {
            businessId,
            branchId,
            action: AuditAction.SALE_COMPLETED,
            targetType: 'Sale',
            targetId: sale.id,
            summary: `Mauzo ya TSh ${totalTzs.toLocaleString('en-US')} yamekamilika · Sale of TSh ${totalTzs.toLocaleString('en-US')} completed`,
          },
          tx,
        );

        // One entry per product that came up short, naming what and by how
        // much, so the owner has something to act on rather than a negative
        // number to discover in a stock list weeks later.
        for (const [index, shortfall] of shortfalls.entries()) {
          if (shortfall === 0) {
            continue;
          }

          const { product, graph } = resolved[index];
          const baseUnit =
            product.units.find((candidate) => candidate.id === graph.baseUnitId)?.name ??
            'base units';

          await this.audit.record(
            actorFrom(principal),
            {
              businessId,
              branchId,
              action: AuditAction.STOCK_INCONSISTENCY,
              targetType: 'Product',
              targetId: product.id,
              summary: `Hesabu ya ${product.name} haikulingana: pungufu ${shortfall} ${baseUnit} · Stock count for ${product.name} was short by ${shortfall} ${baseUnit} at the time of sale`,
            },
            tx,
          );
        }

        return sale.id;
      })
      .catch((error) => this.asExistingSale(error, businessId, dto.idempotencyKey));

    this.logger.log(`Sale completed: ${saleId} at branch ${branchId} for ${totalTzs} TZS`);

    return this.findOne(principal, branchId, saleId);
  }

  /**
   * One sale, as a receipt.
   *
   * The sales *list* is deliberately not here: Phase 6 owns the owner-facing
   * sales list and detail screen, and Phase 4 only needs to show the seller
   * the receipt for the sale they just rang up.
   */
  /**
   * The sales a branch has rung up, newest first.
   *
   * Needs `VIEW_REPORTS`; the owner always may. This is the first consumer of
   * that permission, and it is the right shape for it: a seller needs the
   * receipt for the sale they have just made — which `findOne` still gives
   * anybody — but browsing what the shop has taken all day is a management
   * act, not part of selling.
   *
   * There is no date filter here on purpose. Selecting a day and totalling it
   * is Phase 7's dashboard, and doing local-day arithmetic in two places is
   * how the two come to disagree.
   */
  async list(
    principal: AuthenticatedUser,
    branchId: string,
    query: ListSalesDto,
  ): Promise<SalesPageView> {
    const businessId = requireBusiness(principal);

    await requireBranchAccess(this.prisma, principal, branchId);

    const limit = query.limit ?? SALES_PAGE_DEFAULT;

    if (query.cursor) {
      // A cursor is a client-supplied id and gets the same treatment as any
      // other: one from another branch or another tenant is simply not found,
      // rather than silently paging from the top of this branch.
      const anchor = await this.prisma.sale.findFirst({
        where: { id: query.cursor, businessId, branchId },
        select: { id: true },
      });

      if (!anchor) {
        throw new NotFoundException('Sale not found');
      }
    }

    // One more than asked for, so "is there another page?" is answered by
    // what came back rather than by a second count query.
    const rows = await this.prisma.sale.findMany({
      where: { businessId, branchId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        soldBy: { select: { fullName: true } },
        lines: { select: { shortfallNormalized: true } },
        payments: { select: { methodName: true } },
      },
    });

    const page = rows.slice(0, limit);

    return {
      sales: page.map((sale) => ({
        id: sale.id,
        branchId: sale.branchId,
        soldById: sale.soldById,
        soldByName: sale.soldBy.fullName,
        totalTzs: sale.totalTzs,
        changeTzs: sale.changeTzs,
        debtTzs: sale.debtTzs,
        lineCount: sale.lines.length,
        paymentMethods: sale.payments.map((payment) => payment.methodName),
        hasStockInconsistency: sale.lines.some((line) => line.shortfallNormalized > 0),
        createdAt: sale.createdAt,
      })),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async findOne(
    principal: AuthenticatedUser,
    branchId: string,
    saleId: string,
  ): Promise<SaleView> {
    const businessId = requireBusiness(principal);

    await requireBranchAccess(this.prisma, principal, branchId);

    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId, branchId },
      include: SALE_INCLUDE,
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return this.toView(sale);
  }

  /**
   * Turns each line into the product, unit, and unit graph behind it.
   *
   * The same product in two different units is two lines and stays two lines.
   * The same product in the *same* unit twice is a client that failed to merge
   * a rescan, and it is refused rather than quietly added up — the phone's
   * cart is supposed to increment the line it already has.
   */
  private async resolveLines(
    businessId: string,
    dto: CreateSaleDto,
  ): Promise<Array<{ line: CreateSaleDto['lines'][number] } & ResolvedUnit>> {
    const seen = new Set<string>();

    for (const line of dto.lines) {
      const key = `${line.productId}:${line.productUnitId}`;

      if (seen.has(key)) {
        throw new BadRequestException(
          'The same product and unit appears twice — increment the existing line instead',
        );
      }

      seen.add(key);
    }

    return Promise.all(
      dto.lines.map(async (line) => ({
        line,
        ...(await this.stock.resolveUnit(
          this.prisma,
          businessId,
          line.productId,
          line.productUnitId,
        )),
      })),
    );
  }

  /**
   * A unit with no price cannot be sold. Doc 01 §5 lets a product exist before
   * it is fully configured, but the price is the one thing a sale cannot
   * invent — a shop selling at "whatever" is a shop that cannot reconcile its
   * own till.
   */
  private priceOf(unit: { name: string; priceTzs: number | null }): number {
    if (unit.priceTzs === null) {
      throw new BadRequestException(
        `Weka bei ya ${unit.name} kwanza · ${unit.name} has no price yet, so it cannot be sold`,
      );
    }

    return unit.priceTzs;
  }

  /**
   * Checks the payments against the shop's own methods, then against the bill.
   *
   * The kind comes from the method record, not from the request: a client
   * cannot call an M-Pesa payment "cash" to make Shoprex calculate change for
   * money that was never handed over.
   */
  private async settlePayments(businessId: string, dto: CreateSaleDto, totalTzs: number) {
    const ids = dto.payments.map((payment) => payment.paymentMethodId);

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'The same payment method appears twice — combine them into one amount',
      );
    }

    const known = await this.paymentMethods.resolveActive(this.prisma, businessId, ids);
    const methods = ids.map((id) => {
      const method = known.get(id);

      if (!method) {
        // A method from another tenant, a deleted one, and one the owner has
        // switched off are one answer, for the same reason a cross-tenant read
        // is a 404: the caller learns nothing about what exists elsewhere.
        throw new NotFoundException(
          'Njia ya malipo haipatikani · That payment method is not available',
        );
      }

      return method;
    });

    const inputs: PaymentInput[] = dto.payments.map((payment, index) => ({
      kind: methods[index].kind as PaymentKind,
      amountTzs: payment.amountTzs,
      cashReceivedTzs: payment.cashReceivedTzs ?? null,
      debtorName: payment.debtorName ?? null,
    }));

    return { methods, settlement: this.asBadRequest(() => settle(totalTzs, inputs)) };
  }

  private async findByIdempotencyKey(
    businessId: string,
    branchId: string,
    idempotencyKey: string,
  ): Promise<SaleView | null> {
    const sale = await this.prisma.sale.findUnique({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
      include: SALE_INCLUDE,
    });

    if (!sale) {
      return null;
    }

    if (sale.branchId !== branchId) {
      // Same key, different branch: not a retry of the same request but a key
      // being reused, which would otherwise silently return someone else's
      // receipt.
      throw new ConflictException(
        'That idempotency key was already used for a sale in another branch',
      );
    }

    return this.toView(sale);
  }

  /**
   * The race the unique index catches: two identical requests in flight at
   * once, neither of which saw the other's row when it checked. Exactly one
   * insert wins, and the loser returns the winner's sale instead of an error.
   */
  private async asExistingSale(
    error: unknown,
    businessId: string,
    idempotencyKey: string,
  ): Promise<string> {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      String(error.meta?.target ?? '').includes('idempotency_key')
    ) {
      const winner = await this.prisma.sale.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
        select: { id: true },
      });

      if (winner) {
        this.logger.log(`Duplicate sale request collapsed onto ${winner.id}`);

        return winner.id;
      }
    }

    throw error;
  }

  /** Turns a SaleMathError into a 400 rather than a 500. */
  private asBadRequest<T>(work: () => T): T {
    try {
      return work();
    } catch (error) {
      if (error instanceof SaleMathError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  private toView(sale: SaleRecord): SaleView {
    return {
      id: sale.id,
      branchId: sale.branchId,
      soldById: sale.soldById,
      soldByName: sale.soldBy.fullName,
      deviceId: sale.deviceId,
      totalTzs: sale.totalTzs,
      changeTzs: sale.changeTzs,
      debtTzs: sale.debtTzs,
      lines: sale.lines.map((line) => ({
        productId: line.productId,
        productUnitId: line.productUnitId,
        productName: line.productName,
        unitName: line.unitName,
        quantity: line.quantity,
        unitPriceTzs: line.unitPriceTzs,
        lineTotalTzs: line.lineTotalTzs,
        conversionFactor: line.conversionFactor,
        normalizedQuantity: line.normalizedQuantity,
        shortfallNormalized: line.shortfallNormalized,
      })),
      payments: sale.payments.map((payment) => ({
        paymentMethodId: payment.paymentMethodId,
        methodName: payment.methodName,
        methodKind: payment.methodKind,
        amountTzs: payment.amountTzs,
        cashReceivedTzs: payment.cashReceivedTzs,
        changeTzs: payment.changeTzs,
        debtorName: payment.debtorName,
      })),
      hasStockInconsistency: sale.lines.some((line) => line.shortfallNormalized > 0),
      createdAt: sale.createdAt,
    };
  }
}
