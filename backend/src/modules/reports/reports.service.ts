import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { requireBranchAccess } from '../../common/branch-access';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { requireBusiness } from '../../common/tenancy';
import { PrismaService } from '../../database/prisma.service';
import {
  DayWindow,
  DayWindowError,
  dayWindow,
  todayIn,
} from '../../domain/day-window';
import {
  DailyReportFigures,
  ReportReceipt,
  ReportSale,
  figuresOf,
} from '../../domain/report';
import type { PaymentKind } from '../../domain/sale';

/**
 * How many of the day's sales the report carries in full.
 *
 * A day is naturally bounded, but a busy shop is not, and a report that
 * quietly stopped at row 500 without saying so would read as a complete day.
 * Past this point the list is cut and `transactionsTruncated` says so — the
 * **totals above it are always the whole day**, computed from every sale, and
 * the properly paged list is `GET /branches/{branchId}/sales?date=…`.
 */
export const REPORT_TRANSACTION_LIMIT = 500;

const TOP_PRODUCTS = 8;

export interface ReportBranchView {
  id: string;
  name: string;
}

export interface ReportTransactionView {
  id: string;
  soldById: string;
  soldByName: string;
  totalTzs: number;
  debtTzs: number;
  lineCount: number;
  paymentMethods: string[];
  hasStockInconsistency: boolean;
  createdAt: Date;
}

/**
 * The window the report was computed over, spelled out.
 *
 * Returned rather than assumed so a reader — a person, a test, or the PDF —
 * can see exactly which instants were totalled and in whose calendar. "Trust
 * me, this is Tuesday" is not a verifiable claim; `2026-08-20T21:00:00Z` to
 * `2026-08-21T21:00:00Z` in `Africa/Dar_es_Salaam` is.
 */
export interface ReportWindowView {
  date: string;
  timezone: string;
  startUtc: Date;
  endUtc: Date;
}

export interface DailyReportView extends DailyReportFigures {
  business: { id: string; name: string };
  branch: ReportBranchView;
  window: ReportWindowView;
  transactions: ReportTransactionView[];
  /** True when the day held more sales than the list above carries. */
  transactionsTruncated: boolean;
  /** The server clock at the moment the report was produced. */
  generatedAt: Date;
}

export interface BranchComparisonRow {
  branchId: string;
  branchName: string;
  saleCount: number;
  salesTotalTzs: number;
  debtTzs: number;
  collectedTzs: number;
}

export interface BranchComparisonView {
  business: { id: string; name: string };
  window: ReportWindowView;
  branches: BranchComparisonRow[];
  totals: {
    saleCount: number;
    salesTotalTzs: number;
    debtTzs: number;
    collectedTzs: number;
  };
  generatedAt: Date;
}

const SALE_INCLUDE = {
  soldBy: { select: { fullName: true } },
  lines: true,
  payments: true,
} satisfies Prisma.SaleInclude;

const RECEIPT_INCLUDE = {
  receivedBy: { select: { fullName: true } },
  lines: { include: { product: { select: { name: true } }, productUnit: { select: { name: true } } } },
} satisfies Prisma.StockReceiptInclude;

/**
 * The day, read back.
 *
 * Two rules shape everything here, and both are the phase's whole point:
 *
 * - **The day boundary is decided once**, by `dayWindow()`, from the shop's own
 *   `Business.timezone` and the backend's own clock. Nothing accepts a
 *   timestamp, an offset, or a "today" from a client. A phone with the wrong
 *   local time cannot move a sale into a different day's takings (doc 03,
 *   Timestamp rule).
 * - **Every figure is computed from snapshots.** The queries below read
 *   `SaleLine.productName`, `SaleLine.unitPriceTzs`, and
 *   `SalePayment.methodName` — the values the sale itself stored — and never
 *   join back to the live `Product`, `ProductUnit`, or `PaymentMethod` row.
 *   Joining back would report last month using this month's names and prices,
 *   which is the specific way a report starts lying quietly.
 *
 * The arithmetic itself is in `src/domain/report.ts` as pure functions, so
 * this service only fetches and hands over. The PDF is rendered from the very
 * same `DailyReportView` this returns — see `daily-report.pdf.ts` — which is
 * what makes "the same totals in the dashboard and the PDF" true by
 * construction rather than by two implementations agreeing by luck.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async daily(
    principal: AuthenticatedUser,
    branchId: string,
    date: string | undefined,
  ): Promise<DailyReportView> {
    const businessId = requireBusiness(principal);
    const branch = await requireBranchAccess(this.prisma, principal, branchId);
    const business = await this.requireBusinessRecord(businessId);
    const window = this.resolveWindow(business.timezone, date);

    const [saleRows, receiptRows] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          businessId,
          branchId: branch.id,
          createdAt: { gte: window.startUtc, lt: window.endUtc },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: SALE_INCLUDE,
      }),
      this.prisma.stockReceipt.findMany({
        where: {
          businessId,
          branchId: branch.id,
          createdAt: { gte: window.startUtc, lt: window.endUtc },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: RECEIPT_INCLUDE,
      }),
    ]);

    const sales: ReportSale[] = saleRows.map((sale) => ({
      id: sale.id,
      soldById: sale.soldById,
      soldByName: sale.soldBy.fullName,
      totalTzs: sale.totalTzs,
      changeTzs: sale.changeTzs,
      debtTzs: sale.debtTzs,
      createdAt: sale.createdAt,
      lines: sale.lines.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        unitName: line.unitName,
        quantity: line.quantity,
        lineTotalTzs: line.lineTotalTzs,
        shortfallNormalized: line.shortfallNormalized,
      })),
      payments: sale.payments.map((payment) => ({
        paymentMethodId: payment.paymentMethodId,
        methodName: payment.methodName,
        methodKind: payment.methodKind as PaymentKind,
        amountTzs: payment.amountTzs,
        debtorName: payment.debtorName,
      })),
    }));

    const receipts: ReportReceipt[] = receiptRows.map((receipt) => ({
      id: receipt.id,
      receivedById: receipt.receivedById,
      receivedByName: receipt.receivedBy.fullName,
      createdAt: receipt.createdAt,
      lines: receipt.lines.map((line) => ({
        productId: line.productId,
        productName: line.product.name,
        productUnitId: line.productUnitId,
        unitName: line.productUnit.name,
        quantity: line.quantity,
        unitCostTzs: line.unitCostTzs,
      })),
    }));

    // Newest first for reading, though the figures above were computed over
    // every sale in the day regardless of this order or this cut.
    const ordered = [...saleRows].reverse();

    return {
      ...figuresOf(sales, receipts, { topProducts: TOP_PRODUCTS }),
      business: { id: business.id, name: business.name },
      branch: { id: branch.id, name: branch.name },
      window,
      transactions: ordered.slice(0, REPORT_TRANSACTION_LIMIT).map((sale) => ({
        id: sale.id,
        soldById: sale.soldById,
        soldByName: sale.soldBy.fullName,
        totalTzs: sale.totalTzs,
        debtTzs: sale.debtTzs,
        lineCount: sale.lines.length,
        paymentMethods: sale.payments.map((payment) => payment.methodName),
        hasStockInconsistency: sale.lines.some((line) => line.shortfallNormalized > 0),
        createdAt: sale.createdAt,
      })),
      transactionsTruncated: ordered.length > REPORT_TRANSACTION_LIMIT,
      generatedAt: new Date(),
    };
  }

  /**
   * The same day, across every branch the caller may see.
   *
   * Scoped rather than owner-only. `GET /branches`, `GET /devices`, and
   * `GET /users` all answer "the ones that are yours", and a manager over two
   * branches has the same honest reason to compare them that an owner does —
   * while a manager over one sees a table of one, which is simply the truth.
   * The branch list is built by the same rule the single-branch report uses,
   * so a branch that answers 404 there cannot appear as a row here.
   */
  async branchComparison(
    principal: AuthenticatedUser,
    date: string | undefined,
  ): Promise<BranchComparisonView> {
    const businessId = requireBusiness(principal);
    const business = await this.requireBusinessRecord(businessId);
    const window = this.resolveWindow(business.timezone, date);

    const branches = await this.prisma.branch.findMany({
      where: {
        businessId,
        ...(principal.role === UserRole.OWNER
          ? {}
          : { assignments: { some: { userId: principal.userId } } }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    // A comparison row is four numbers, not a receipt — an aggregate query
    // asks the database for the sum rather than pulling every sale into
    // memory to add up with `totalsOf()`, which is for the single-branch
    // report's fuller figures (payment breakdown, debts by name, sellers).
    const rows = await Promise.all(
      branches.map(async (branch) => {
        const totals = await this.prisma.sale.aggregate({
          where: {
            businessId,
            branchId: branch.id,
            createdAt: { gte: window.startUtc, lt: window.endUtc },
          },
          _count: true,
          _sum: { totalTzs: true, debtTzs: true },
        });

        const salesTotalTzs = totals._sum.totalTzs ?? 0;
        const debtTzs = totals._sum.debtTzs ?? 0;

        return {
          branchId: branch.id,
          branchName: branch.name,
          saleCount: totals._count,
          salesTotalTzs,
          debtTzs,
          collectedTzs: salesTotalTzs - debtTzs,
        };
      }),
    );

    const ranked = [...rows].sort(
      (a, b) => b.salesTotalTzs - a.salesTotalTzs || a.branchName.localeCompare(b.branchName),
    );

    return {
      business: { id: business.id, name: business.name },
      window,
      branches: ranked,
      totals: {
        saleCount: ranked.reduce((sum, row) => sum + row.saleCount, 0),
        salesTotalTzs: ranked.reduce((sum, row) => sum + row.salesTotalTzs, 0),
        debtTzs: ranked.reduce((sum, row) => sum + row.debtTzs, 0),
        collectedTzs: ranked.reduce((sum, row) => sum + row.collectedTzs, 0),
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Resolves the day being asked for, in the shop's own calendar.
   *
   * An omitted date means **today**, decided from the server clock and the
   * shop's zone — never from a client, which is the whole of doc 03's
   * Timestamp rule. A malformed date is a 400 rather than a silent fallback
   * to today: a report that quietly answers for a different day than the one
   * asked for is worse than one that refuses.
   */
  private resolveWindow(timezone: string, date: string | undefined): ReportWindowView {
    let window: DayWindow;

    try {
      window = dayWindow(date ?? todayIn(timezone, new Date()), timezone);
    } catch (error) {
      if (error instanceof DayWindowError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }

    // The domain says `timeZone`, after Intl; the schema and every client say
    // `timezone`, after `Business.timezone`. Renamed here, once, rather than
    // either side bending to the other's spelling.
    return {
      date: window.date,
      timezone: window.timeZone,
      startUtc: window.startUtc,
      endUtc: window.endUtc,
    };
  }

  private async requireBusinessRecord(
    businessId: string,
  ): Promise<{ id: string; name: string; timezone: string }> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, timezone: true },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return business;
  }
}
