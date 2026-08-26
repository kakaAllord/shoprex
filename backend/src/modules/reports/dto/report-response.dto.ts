import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethodKind } from '@prisma/client';
import type {
  DailyTotals,
  DebtRow,
  PaymentBreakdownRow,
  ReceivedRow,
  ReceivedSummary,
  SellerRow,
  TopProductRow,
} from '../../../domain/report';
import type {
  BranchComparisonRow,
  BranchComparisonView,
  DailyReportView,
  ReportBranchView,
  ReportTransactionView,
  ReportWindowView,
} from '../reports.service';

/**
 * Response DTOs `implement` the service interfaces they document, so the
 * published OpenAPI contract cannot silently drift from what the code returns.
 * Keep that pattern — it is what `test/openapi.e2e-spec.ts` leans on.
 */

class ReportBusinessViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Duka la Mfano' })
  name!: string;
}

export class ReportBranchViewDto implements ReportBranchView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Tawi la Kariakoo' })
  name!: string;
}

export class ReportWindowViewDto implements ReportWindowView {
  @ApiProperty({
    example: '2026-08-21',
    description: 'The shop-local calendar day this report covers.',
  })
  date!: string;

  @ApiProperty({
    example: 'Africa/Dar_es_Salaam',
    description: 'The zone the day was resolved in, from `Business.timezone`.',
  })
  timezone!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-20T21:00:00.000Z',
    description:
      'Inclusive. The UTC instant local midnight happened. Returned rather than assumed, so a reader can check which instants were counted instead of taking “Tuesday” on trust.',
  })
  startUtc!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-21T21:00:00.000Z',
    description:
      'Exclusive. The instant the **next** local midnight happens, so no sale can fall into two days at once or between them.',
  })
  endUtc!: Date;
}

export class DailyTotalsDto implements DailyTotals {
  @ApiProperty({ example: 34 })
  saleCount!: number;

  @ApiProperty({ example: 412000, description: 'The sum of every bill — what the shop sold, paid or not.' })
  salesTotalTzs!: number;

  @ApiProperty({ example: 18000, description: 'What walked out unpaid, against a name. Part of `salesTotalTzs`.' })
  debtTzs!: number;

  @ApiProperty({
    example: 394000,
    description:
      '`salesTotalTzs − debtTzs`. What actually settled — the number an owner means by “how much did we take today”.',
  })
  collectedTzs!: number;

  @ApiProperty({
    example: 27000,
    description:
      'Cash handed back across the day. Reported but never subtracted from a total: a customer who hands over 10,000 for a 7,000 bill paid 7,000.',
  })
  changeTzs!: number;

  @ApiProperty({ example: 61 })
  lineCount!: number;

  @ApiProperty({
    example: 1,
    description: 'How many sales sold more than the branch’s records held. Something to recount, not a failure.',
  })
  salesWithShortfall!: number;
}

export class PaymentBreakdownRowDto implements PaymentBreakdownRow {
  @ApiProperty({ format: 'uuid' })
  paymentMethodId!: string;

  @ApiProperty({
    example: 'Taslimu',
    description:
      'The name **snapshotted on the payment**, not the method’s name today. Renaming a method never rewrites a past report.',
  })
  methodName!: string;

  @ApiProperty({ enum: PaymentMethodKind })
  methodKind!: PaymentBreakdownRow['methodKind'];

  @ApiProperty({ example: 21 })
  saleCount!: number;

  @ApiProperty({ example: 260000 })
  amountTzs!: number;
}

export class DebtRowDto implements DebtRow {
  @ApiProperty({ example: 'Mama Neema', description: 'A free-text name, as written. V1 records nothing else.' })
  debtorName!: string;

  @ApiProperty({ example: 18000 })
  amountTzs!: number;

  @ApiProperty({ example: 2 })
  saleCount!: number;
}

export class SellerRowDto implements SellerRow {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Neema' })
  name!: string;

  @ApiProperty({ example: 19 })
  saleCount!: number;

  @ApiProperty({ example: 240000 })
  salesTotalTzs!: number;

  @ApiProperty({ example: 6000 })
  debtTzs!: number;
}

export class ReceivedRowDto implements ReceivedRow {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Coca-Cola 500ml' })
  productName!: string;

  @ApiProperty({ format: 'uuid' })
  productUnitId!: string;

  @ApiProperty({ example: 'Kreti' })
  unitName!: string;

  @ApiProperty({ example: 6, description: 'In the packaging it arrived in. Six Cartons are 6, not 36.' })
  quantity!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 32400,
    description:
      'The cost of the lines that recorded one. **Null**, never zero, when none did — a shop may record what arrived without recording what it paid.',
  })
  costTzs!: number | null;

  @ApiProperty({ example: false, description: 'True when some lines carried a cost and others did not.' })
  costIsPartial!: boolean;
}

export class ReceivedSummaryDto implements ReceivedSummary {
  @ApiProperty({ example: 2 })
  receiptCount!: number;

  @ApiProperty({ example: 7 })
  lineCount!: number;

  @ApiProperty({ type: [ReceivedRowDto] })
  rows!: ReceivedRowDto[];

  @ApiProperty({ type: Number, nullable: true, example: 190000 })
  totalCostTzs!: number | null;

  @ApiProperty({ example: false })
  costIsPartial!: boolean;
}

export class TopProductRowDto implements TopProductRow {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Coca-Cola 500ml' })
  productName!: string;

  @ApiProperty({ example: 'Kipande' })
  unitName!: string;

  @ApiProperty({ example: 48 })
  quantity!: number;

  @ApiProperty({ example: 48000 })
  totalTzs!: number;
}

export class ReportTransactionViewDto implements ReportTransactionView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  soldById!: string;

  @ApiProperty({ example: 'Neema' })
  soldByName!: string;

  @ApiProperty({ example: 12000 })
  totalTzs!: number;

  @ApiProperty({ example: 0 })
  debtTzs!: number;

  @ApiProperty({ example: 3 })
  lineCount!: number;

  @ApiProperty({ type: [String], example: ['Taslimu'] })
  paymentMethods!: string[];

  @ApiProperty({ example: false })
  hasStockInconsistency!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class DailyReportViewDto implements DailyReportView {
  @ApiProperty({ type: ReportBusinessViewDto })
  business!: ReportBusinessViewDto;

  @ApiProperty({ type: ReportBranchViewDto })
  branch!: ReportBranchViewDto;

  @ApiProperty({ type: ReportWindowViewDto })
  window!: ReportWindowViewDto;

  @ApiProperty({ type: DailyTotalsDto })
  totals!: DailyTotalsDto;

  @ApiProperty({ type: [PaymentBreakdownRowDto], description: 'Adds up to `totals.salesTotalTzs` exactly.' })
  paymentBreakdown!: PaymentBreakdownRowDto[];

  @ApiProperty({ type: [DebtRowDto], description: 'Biggest first. One row per debtor name.' })
  debts!: DebtRowDto[];

  @ApiProperty({ type: [SellerRowDto], description: 'Attribution comes from the session, never from the handset.' })
  sellers!: SellerRowDto[];

  @ApiProperty({ type: ReceivedSummaryDto })
  received!: ReceivedSummaryDto;

  @ApiProperty({ type: [TopProductRowDto], description: 'Ranked by money taken, because units of different sizes do not add up.' })
  topProducts!: TopProductRowDto[];

  @ApiProperty({
    type: [ReportTransactionViewDto],
    description:
      'The day’s sales, newest first, cut at 500. The **totals above always cover the whole day**; use `GET /branches/{branchId}/sales?date=…` for a properly paged list.',
  })
  transactions!: ReportTransactionViewDto[];

  @ApiProperty({ example: false, description: 'True when the day held more sales than `transactions` carries.' })
  transactionsTruncated!: boolean;

  @ApiProperty({ type: String, format: 'date-time', description: 'The backend server clock.' })
  generatedAt!: Date;
}

export class BranchComparisonRowDto implements BranchComparisonRow {
  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ example: 'Tawi la Kariakoo' })
  branchName!: string;

  @ApiProperty({ example: 34 })
  saleCount!: number;

  @ApiProperty({ example: 412000 })
  salesTotalTzs!: number;

  @ApiProperty({ example: 18000 })
  debtTzs!: number;

  @ApiProperty({ example: 394000 })
  collectedTzs!: number;
}

class BranchComparisonTotalsDto {
  @ApiProperty({ example: 51 })
  saleCount!: number;

  @ApiProperty({ example: 610000 })
  salesTotalTzs!: number;

  @ApiProperty({ example: 18000 })
  debtTzs!: number;

  @ApiProperty({ example: 592000 })
  collectedTzs!: number;
}

export class BranchComparisonViewDto implements BranchComparisonView {
  @ApiProperty({ type: ReportBusinessViewDto })
  business!: ReportBusinessViewDto;

  @ApiProperty({ type: ReportWindowViewDto })
  window!: ReportWindowViewDto;

  @ApiProperty({
    type: [BranchComparisonRowDto],
    description:
      'Every branch the caller may see, busiest first. An owner sees all of their own; a manager sees only the branches they were assigned.',
  })
  branches!: BranchComparisonRowDto[];

  @ApiProperty({ type: BranchComparisonTotalsDto })
  totals!: BranchComparisonTotalsDto;

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: Date;
}
