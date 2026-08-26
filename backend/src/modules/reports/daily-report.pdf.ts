import {
  CONTENT_RIGHT,
  PdfBlock,
  gap,
  heading,
  paragraph,
  renderPdf,
  rule,
  subheading,
  tableRow,
} from '../../domain/pdf';
import type { DailyReportView } from './reports.service';

/**
 * The daily report, as a page.
 *
 * This takes **the `DailyReportView` the dashboard is given**, unmodified, and
 * lays it out. It computes nothing: there is no arithmetic in this file at all,
 * not even a subtraction, because the moment a PDF works out its own totals it
 * has become a second implementation that can disagree with the first. That
 * disagreement is exactly what Phase 7's acceptance check exists to catch, and
 * the cheapest way to pass it is to make it impossible.
 *
 * The one thing done here that is not pure formatting is choosing which rows
 * to show, and even then the numbers shown are the ones handed over.
 */

/** Right-hand column positions, so every number in the report lines up. */
const COL_RIGHT = CONTENT_RIGHT;
const COL_MIDDLE = CONTENT_RIGHT - 116;
const COL_LEFT = CONTENT_RIGHT - 232;

/** Whole shillings, grouped, exactly as the console writes them. */
function money(amountTzs: number): string {
  return `TSh ${amountTzs.toLocaleString('en-GB')}`;
}

/** A count, right-aligned like the money beside it. */
function count(value: number): string {
  return value.toLocaleString('en-GB');
}

function clockIn(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

function readableDate(date: string, timezone: string): string {
  // Midday avoids any question of which side of the boundary the label sits.
  const noon = new Date(`${date}T12:00:00Z`);

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(noon);
}

function section(title: string): PdfBlock[] {
  return [gap(8), subheading(title), rule()];
}

/**
 * Says what was counted and over exactly which instants.
 *
 * Printed rather than assumed, because "Tuesday's takings" is a claim nobody
 * can check and "21:00Z to 21:00Z, Africa/Dar_es_Salaam" is one anybody can.
 */
function windowNote(report: DailyReportView): PdfBlock[] {
  return [
    paragraph(
      `Siku ya duka · Shop day ${report.window.startUtc.toISOString()} → ${report.window.endUtc.toISOString()} (${report.window.timezone})`,
    ),
    paragraph(
      `Imetengenezwa · Generated ${report.generatedAt.toISOString()} · saa za seva, si za simu`,
    ),
  ];
}

function totalsSection(report: DailyReportView): PdfBlock[] {
  const { totals } = report;

  return [
    ...section('Muhtasari · Summary'),
    tableRow('Mauzo · Sales completed', [count(totals.saleCount)], [COL_RIGHT]),
    tableRow('Vitu vilivyouzwa · Lines sold', [count(totals.lineCount)], [COL_RIGHT]),
    tableRow('Jumla ya mauzo · Total sold', [money(totals.salesTotalTzs)], [COL_RIGHT]),
    tableRow('Deni · Owed', [money(totals.debtTzs)], [COL_RIGHT]),
    rule(0.6),
    tableRow('Zilizoingia · Collected', [money(totals.collectedTzs)], [COL_RIGHT], {
      bold: true,
      size: 11,
      height: 20,
    }),
    tableRow('Chenji iliyorudishwa · Change given', [money(totals.changeTzs)], [COL_RIGHT], {
      grey: 0.4,
    }),
    ...(totals.salesWithShortfall > 0
      ? [
          paragraph(
            `Mauzo ${totals.salesWithShortfall} yalizidi stoo iliyorekodiwa — hesabu upya · ${totals.salesWithShortfall} sale(s) sold more than the records held; recount`,
            0.15,
          ),
        ]
      : []),
  ];
}

function paymentsSection(report: DailyReportView): PdfBlock[] {
  if (report.paymentBreakdown.length === 0) {
    return [...section('Malipo · Payments'), paragraph('Hakuna malipo siku hii · No payments this day')];
  }

  return [
    ...section('Malipo · Payments'),
    tableRow('Njia · Method', ['Mauzo', 'Kiasi · Amount'], [COL_MIDDLE, COL_RIGHT], {
      bold: true,
      size: 9,
      grey: 0.35,
    }),
    ...report.paymentBreakdown.map((row) =>
      tableRow(row.methodName, [count(row.saleCount), money(row.amountTzs)], [COL_MIDDLE, COL_RIGHT]),
    ),
  ];
}

function debtsSection(report: DailyReportView): PdfBlock[] {
  if (report.debts.length === 0) {
    return [...section('Deni · Debts'), paragraph('Hakuna deni siku hii · No debt recorded this day')];
  }

  return [
    ...section('Deni · Debts'),
    tableRow('Mdaiwa · Debtor', ['Mauzo', 'Deni · Owed'], [COL_MIDDLE, COL_RIGHT], {
      bold: true,
      size: 9,
      grey: 0.35,
    }),
    ...report.debts.map((row) =>
      tableRow(row.debtorName, [count(row.saleCount), money(row.amountTzs)], [COL_MIDDLE, COL_RIGHT]),
    ),
  ];
}

function sellersSection(report: DailyReportView): PdfBlock[] {
  if (report.sellers.length === 0) {
    return [];
  }

  return [
    ...section('Wafanyakazi · Who sold'),
    tableRow(
      'Jina · Name',
      ['Mauzo', 'Jumla · Total', 'Deni · Owed'],
      [COL_LEFT, COL_MIDDLE, COL_RIGHT],
      { bold: true, size: 9, grey: 0.35 },
    ),
    ...report.sellers.map((row) =>
      tableRow(
        row.name,
        [count(row.saleCount), money(row.salesTotalTzs), money(row.debtTzs)],
        [COL_LEFT, COL_MIDDLE, COL_RIGHT],
      ),
    ),
  ];
}

function topProductsSection(report: DailyReportView): PdfBlock[] {
  if (report.topProducts.length === 0) {
    return [];
  }

  return [
    ...section('Bidhaa zilizouzwa zaidi · Best sellers'),
    tableRow('Bidhaa · Product', ['Idadi', 'Jumla · Total'], [COL_MIDDLE, COL_RIGHT], {
      bold: true,
      size: 9,
      grey: 0.35,
    }),
    ...report.topProducts.map((row) =>
      tableRow(
        `${row.productName} (${row.unitName})`,
        [count(row.quantity), money(row.totalTzs)],
        [COL_MIDDLE, COL_RIGHT],
      ),
    ),
  ];
}

function receivedSection(report: DailyReportView): PdfBlock[] {
  const { received } = report;

  if (received.rows.length === 0) {
    return [
      ...section('Mzigo uliopokelewa · Stock received'),
      paragraph('Hakuna mzigo siku hii · No delivery recorded this day'),
    ];
  }

  return [
    ...section('Mzigo uliopokelewa · Stock received'),
    tableRow('Bidhaa · Product', ['Idadi', 'Gharama · Cost'], [COL_MIDDLE, COL_RIGHT], {
      bold: true,
      size: 9,
      grey: 0.35,
    }),
    ...received.rows.map((row) =>
      tableRow(
        `${row.productName} (${row.unitName})`,
        [
          count(row.quantity),
          row.costTzs === null ? '—' : `${money(row.costTzs)}${row.costIsPartial ? ' *' : ''}`,
        ],
        [COL_MIDDLE, COL_RIGHT],
      ),
    ),
    ...(received.totalCostTzs === null
      ? [paragraph('Gharama haikurekodiwa · No cost was recorded', 0.4)]
      : [
          tableRow(
            'Jumla ya gharama · Total cost',
            ['', `${money(received.totalCostTzs)}${received.costIsPartial ? ' *' : ''}`],
            [COL_MIDDLE, COL_RIGHT],
            { bold: true },
          ),
        ]),
    ...(received.costIsPartial
      ? [paragraph('* Baadhi ya mistari haikuwa na gharama · Some lines recorded no cost', 0.4)]
      : []),
  ];
}

function transactionsSection(report: DailyReportView): PdfBlock[] {
  if (report.transactions.length === 0) {
    return [];
  }

  return [
    ...section('Mauzo moja moja · Transactions'),
    tableRow(
      'Saa · Time, aliyeuza · sold by',
      ['Vitu', 'Jumla · Total'],
      [COL_MIDDLE, COL_RIGHT],
      { bold: true, size: 9, grey: 0.35 },
    ),
    ...report.transactions.map((transaction) =>
      tableRow(
        `${clockIn(transaction.createdAt, report.window.timezone)}  ${transaction.soldByName}` +
          `${transaction.paymentMethods.length > 0 ? ` · ${transaction.paymentMethods.join(' + ')}` : ''}` +
          `${transaction.hasStockInconsistency ? ' · stoo pungufu' : ''}`,
        [count(transaction.lineCount), money(transaction.totalTzs)],
        [COL_MIDDLE, COL_RIGHT],
        { size: 9 },
      ),
    ),
    ...(report.transactionsTruncated
      ? [
          paragraph(
            `Orodha imekatwa baada ya ${report.transactions.length} · list cut after ${report.transactions.length}; the totals above cover the whole day`,
            0.15,
          ),
        ]
      : []),
  ];
}

/**
 * The whole report, as PDF bytes.
 *
 * Every number on the page came in on `report`. Nothing is recomputed here.
 */
export function renderDailyReportPdf(report: DailyReportView): Buffer {
  const blocks: PdfBlock[] = [
    heading(report.business.name),
    paragraph(
      `${report.branch.name} · Ripoti ya siku · Daily report`,
      0.2,
    ),
    heading(readableDate(report.window.date, report.window.timezone), 13),
    ...windowNote(report),
    ...totalsSection(report),
    ...paymentsSection(report),
    ...debtsSection(report),
    ...sellersSection(report),
    ...topProductsSection(report),
    ...receivedSection(report),
    ...transactionsSection(report),
  ];

  return renderPdf({
    title: `${report.business.name} · ${report.branch.name} · ${report.window.date}`,
    footer: `Shoprex · ${report.business.name} · ${report.branch.name} · ${report.window.date}`,
    blocks,
  });
}

/**
 * What the browser should call the file.
 *
 * Named after the branch and the shop-local day, so a folder of them sorts
 * into date order and nobody has to open one to find out which day it is.
 */
export function dailyReportFilename(report: DailyReportView): string {
  const slug = (value: string): string =>
    value
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 40) || 'ripoti';

  return `shoprex-${slug(report.branch.name)}-${report.window.date}.pdf`;
}
