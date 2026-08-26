/**
 * A very small PDF writer, for one kind of document: a page of numbers.
 *
 * Shoprex generates its daily report as a PDF on the **backend**, from the
 * same service that answers the dashboard, so the two can never disagree —
 * that is the whole of Phase 7's acceptance check. Doing it here rather than
 * in the browser also means the PDF is produced from the authoritative
 * figures rather than from whatever a page happened to be rendering.
 *
 * It is written by hand, with no dependency, because what it has to draw is
 * headings and right-aligned money in columns, and because a hand-written
 * document whose text stream is plain and uncompressed is one a test can read
 * back — which is exactly how "the same totals in the dashboard and the PDF"
 * is proven rather than asserted.
 *
 * ## Two fonts, and why
 *
 * Only the fourteen fonts every PDF reader is required to have are used, so
 * nothing is embedded and the file stays a few kilobytes:
 *
 * - **Helvetica** and **Helvetica-Bold** for labels and headings. These are
 *   only ever drawn left-aligned, so their glyph widths never need measuring.
 * - **Courier** and **Courier-Bold** for every number. Courier is monospaced —
 *   every glyph advances exactly 600/1000 of the font size — so a right-aligned
 *   column is plain arithmetic rather than a 224-entry width table, and the
 *   digits line up under each other the way a column of money must.
 *
 * A left-hand label that would otherwise run into a number is truncated to a
 * character budget computed at a deliberately generous 0.6 em per character.
 * Helvetica's real average is nearer 0.5, so the budget errs toward truncating
 * slightly early rather than toward letting a long product name collide with
 * the shillings beside it.
 *
 * ## What it does not do
 *
 * No images, no colour beyond greys and one accent, no compression, no
 * encryption, no word wrapping. Every function is pure: it takes a document
 * description and returns bytes. Nothing here knows about sales, Nest, or the
 * database — the daily report is composed in the reports module and handed
 * over as blocks.
 */

export class PdfError extends Error {}

/** A4, in PostScript points, which is the only unit a PDF has. */
export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;

export const MARGIN_X = 42;
export const MARGIN_TOP = 46;
export const MARGIN_BOTTOM = 48;

/** The right edge text may reach. */
export const CONTENT_RIGHT = PAGE_WIDTH - MARGIN_X;

const COURIER_ADVANCE = 0.6;
/** Deliberately wider than Helvetica's real average, so labels truncate early. */
const LABEL_ADVANCE_BUDGET = 0.6;

type FontName = 'Helvetica' | 'Helvetica-Bold' | 'Courier' | 'Courier-Bold';

const FONT_RESOURCE: Record<FontName, string> = {
  Helvetica: 'F1',
  'Helvetica-Bold': 'F2',
  Courier: 'F3',
  'Courier-Bold': 'F4',
};

/** One cell of one row. */
export interface PdfCell {
  text: string;
  /**
   * Where the cell sits. A left cell starts at `x`; a right cell *ends* at
   * `x`, which is what makes a money column line up.
   */
  x: number;
  align: 'left' | 'right';
  /** Numbers use Courier so a right-aligned column is exact. */
  font: FontName;
  size: number;
  /** 0 is black, 1 is white. */
  grey?: number;
}

export type PdfBlock =
  | { kind: 'row'; cells: PdfCell[]; height: number }
  | { kind: 'rule'; grey?: number; height: number }
  | { kind: 'gap'; height: number }
  /** Forces what follows onto a new page. */
  | { kind: 'break' };

export interface PdfDocument {
  title: string;
  /** Drawn at the foot of every page, with the page number appended. */
  footer: string;
  blocks: PdfBlock[];
}

/**
 * How many characters of a label fit in `width` points at `size`.
 *
 * Used to truncate rather than to lay out: see the note on the budget above.
 */
export function labelBudget(width: number, size: number): number {
  return Math.max(0, Math.floor(width / (size * LABEL_ADVANCE_BUDGET)));
}

/**
 * Shortens a label to fit, with an ellipsis, rather than letting it collide
 * with the column beside it.
 */
export function truncate(text: string, budget: number): string {
  if (budget <= 0) {
    return '';
  }

  if (text.length <= budget) {
    return text;
  }

  if (budget === 1) {
    return '…';
  }

  return `${text.slice(0, budget - 1)}…`;
}

/** How wide a Courier string is, exactly. */
export function courierWidth(text: string, size: number): number {
  return text.length * size * COURIER_ADVANCE;
}

// ---------------------------------------------------------------------------
// Text encoding.
//
// A PDF string in a base-14 font is bytes in WinAnsiEncoding, which agrees
// with Latin-1 everywhere except 0x80–0x9F. Shoprex's copy is ASCII plus a few
// punctuation marks — the interpunct in "Mauzo · Sales" above all — so the map
// below covers the handful that are not simply Latin-1 and everything else
// falls through.
// ---------------------------------------------------------------------------

const WIN_ANSI_OVERRIDES = new Map<number, number>([
  [0x20ac, 0x80], // €
  [0x201a, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201e, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02c6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8a], // Š
  [0x2039, 0x8b], // ‹
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e], // Ž
  [0x2018, 0x91], // ‘
  [0x2019, 0x92], // ’
  [0x201c, 0x93], // “
  [0x201d, 0x94], // ”
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9a], // š
  [0x203a, 0x9b], // ›
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e], // ž
  [0x0178, 0x9f], // Ÿ
]);

/**
 * A PDF literal string: WinAnsi bytes, with the three characters that would
 * otherwise end the string escaped.
 *
 * Anything the encoding cannot carry becomes `?` rather than a mangled byte —
 * a report with a question mark in a product name is readable, and one with a
 * broken string object is not.
 */
export function pdfString(text: string): Buffer {
  const bytes: number[] = [0x28]; // (

  for (const character of text) {
    const code = character.codePointAt(0) ?? 0x3f;
    const mapped = WIN_ANSI_OVERRIDES.get(code) ?? (code <= 0xff ? code : 0x3f);

    if (mapped === 0x28 || mapped === 0x29 || mapped === 0x5c) {
      bytes.push(0x5c); // backslash-escape ( ) and \
    }

    bytes.push(mapped);
  }

  bytes.push(0x29); // )

  return Buffer.from(bytes);
}

/** Points are written with at most two decimals and no exponent. */
function num(value: number): string {
  if (!Number.isFinite(value)) {
    throw new PdfError('A coordinate must be a finite number');
  }

  return (Math.round(value * 100) / 100).toString();
}

// ---------------------------------------------------------------------------
// Layout: blocks are poured into pages, top to bottom.
// ---------------------------------------------------------------------------

interface PlacedRow {
  cells: PdfCell[];
  y: number;
}

interface PlacedRule {
  y: number;
  grey: number;
}

interface Page {
  rows: PlacedRow[];
  rules: PlacedRule[];
}

const FOOTER_SIZE = 8;
const FOOTER_Y = MARGIN_BOTTOM - 18;

/**
 * Pours blocks into pages.
 *
 * A block never straddles a page: when the next one will not fit above the
 * bottom margin, a page is started. That is enough for a report of rows —
 * there is no widow-and-orphan handling and none is wanted, because a table
 * that repeats its heading on page two is a table nobody has to scroll back
 * from.
 */
function paginate(blocks: PdfBlock[]): Page[] {
  const pages: Page[] = [];
  let current: Page = { rows: [], rules: [] };
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const startPage = (): void => {
    pages.push(current);
    current = { rows: [], rules: [] };
    y = PAGE_HEIGHT - MARGIN_TOP;
  };

  for (const block of blocks) {
    if (block.kind === 'break') {
      if (current.rows.length > 0 || current.rules.length > 0) {
        startPage();
      }

      continue;
    }

    if (y - block.height < MARGIN_BOTTOM) {
      startPage();
    }

    y -= block.height;

    if (block.kind === 'row') {
      current.rows.push({ cells: block.cells, y });
    } else if (block.kind === 'rule') {
      current.rules.push({ y: y + block.height / 2, grey: block.grey ?? 0.8 });
    }
  }

  pages.push(current);

  return pages;
}

/** One page's content stream. */
function contentStream(page: Page, footer: string, pageNumber: number, pageCount: number): Buffer {
  const parts: Buffer[] = [];

  for (const rule of page.rules) {
    parts.push(
      Buffer.from(
        `${num(rule.grey)} G 0.5 w ${num(MARGIN_X)} ${num(rule.y)} m ${num(CONTENT_RIGHT)} ${num(rule.y)} l S\n`,
        'latin1',
      ),
    );
  }

  for (const row of page.rows) {
    for (const cell of row.cells) {
      if (cell.text === '') {
        continue;
      }

      const x =
        cell.align === 'right'
          ? cell.x - measure(cell.text, cell.font, cell.size)
          : cell.x;

      parts.push(
        Buffer.from(`BT ${num(cell.grey ?? 0)} g /${FONT_RESOURCE[cell.font]} ${num(cell.size)} Tf 1 0 0 1 ${num(x)} ${num(row.y)} Tm `, 'latin1'),
      );
      parts.push(pdfString(cell.text));
      parts.push(Buffer.from(' Tj ET\n', 'latin1'));
    }
  }

  const stamp = `${footer} · ${pageNumber}/${pageCount}`;

  parts.push(Buffer.from(`BT 0.45 g /${FONT_RESOURCE.Helvetica} ${FOOTER_SIZE} Tf 1 0 0 1 ${num(MARGIN_X)} ${num(FOOTER_Y)} Tm `, 'latin1'));
  parts.push(pdfString(stamp));
  parts.push(Buffer.from(' Tj ET\n', 'latin1'));

  return Buffer.concat(parts);
}

/**
 * How wide a string is.
 *
 * Exact for Courier, which is all that matters: only Courier is ever
 * right-aligned. Helvetica is measured at the same generous budget used for
 * truncation, so a Helvetica right-alignment would sit slightly left of true
 * rather than overrun — but nothing in the daily report does that.
 */
function measure(text: string, font: FontName, size: number): number {
  return font === 'Courier' || font === 'Courier-Bold'
    ? courierWidth(text, size)
    : text.length * size * LABEL_ADVANCE_BUDGET;
}

// ---------------------------------------------------------------------------
// The file itself.
// ---------------------------------------------------------------------------

/**
 * Renders a document to PDF bytes.
 *
 * The cross-reference table needs the byte offset of every object, so the file
 * is assembled as buffers and measured as it goes rather than as a string —
 * a single multi-byte character would otherwise put every offset out and
 * produce a file that some readers repair silently and others refuse.
 */
export function renderPdf(document: PdfDocument): Buffer {
  if (document.blocks.length === 0) {
    throw new PdfError('A PDF needs at least one block');
  }

  const pages = paginate(document.blocks);
  const objects: Buffer[] = [];

  /** Object numbers are 1-based; this returns the number it assigned. */
  const addObject = (body: Buffer): number => {
    objects.push(body);

    return objects.length;
  };

  // 1 catalog, 2 pages, 3-6 fonts, then two objects per page.
  const catalogNumber = 1;
  const pagesNumber = 2;
  const firstFontNumber = 3;
  const firstPageNumber = firstFontNumber + 4;

  const pageNumbers = pages.map((_page, index) => firstPageNumber + index * 2);

  addObject(Buffer.from(`<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`, 'latin1'));
  addObject(
    Buffer.from(
      `<< /Type /Pages /Count ${pages.length} /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(' ')}] >>`,
      'latin1',
    ),
  );

  for (const font of ['Helvetica', 'Helvetica-Bold', 'Courier', 'Courier-Bold'] as FontName[]) {
    addObject(
      Buffer.from(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`,
        'latin1',
      ),
    );
  }

  const fontResources = (['Helvetica', 'Helvetica-Bold', 'Courier', 'Courier-Bold'] as FontName[])
    .map((font, index) => `/${FONT_RESOURCE[font]} ${firstFontNumber + index} 0 R`)
    .join(' ');

  pages.forEach((page, index) => {
    const stream = contentStream(page, document.footer, index + 1, pages.length);
    const contentNumber = pageNumbers[index] + 1;

    addObject(
      Buffer.from(
        `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << ${fontResources} >> >> /Contents ${contentNumber} 0 R >>`,
        'latin1',
      ),
    );

    addObject(
      Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
        stream,
        Buffer.from('\nendstream', 'latin1'),
      ]),
    );
  });

  const infoNumber = addObject(
    Buffer.concat([
      Buffer.from('<< /Title ', 'latin1'),
      pdfString(document.title),
      Buffer.from(' /Producer ', 'latin1'),
      pdfString('Shoprex'),
      Buffer.from(' >>', 'latin1'),
    ]),
  );

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(offset);

    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);

    chunks.push(chunk);
    offset += chunk.length;
  });

  const xrefOffset = offset;
  const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];

  for (const objectOffset of offsets) {
    xrefLines.push(`${String(objectOffset).padStart(10, '0')} 00000 n `);
  }

  chunks.push(Buffer.from(`${xrefLines.join('\n')}\n`, 'latin1'));
  chunks.push(
    Buffer.from(
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNumber} 0 R /Info ${infoNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      'latin1',
    ),
  );

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Block helpers, so a document reads like the page it produces.
// ---------------------------------------------------------------------------

export function heading(text: string, size = 17): PdfBlock {
  return {
    kind: 'row',
    height: size + 8,
    cells: [{ text, x: MARGIN_X, align: 'left', font: 'Helvetica-Bold', size }],
  };
}

export function subheading(text: string): PdfBlock {
  return {
    kind: 'row',
    height: 20,
    cells: [{ text, x: MARGIN_X, align: 'left', font: 'Helvetica-Bold', size: 11 }],
  };
}

export function paragraph(text: string, grey = 0.35): PdfBlock {
  return {
    kind: 'row',
    height: 14,
    cells: [{ text, x: MARGIN_X, align: 'left', font: 'Helvetica', size: 9.5, grey }],
  };
}

export function rule(grey = 0.82): PdfBlock {
  return { kind: 'rule', grey, height: 8 };
}

export function gap(height = 10): PdfBlock {
  return { kind: 'gap', height };
}

export function pageBreak(): PdfBlock {
  return { kind: 'break' };
}

/**
 * A label on the left and up to three numbers right-aligned at fixed columns.
 *
 * The label is truncated to whatever is left before the first number, so a
 * long product name shortens rather than running into the shillings.
 */
export function tableRow(
  label: string,
  values: string[],
  columns: number[],
  options: { bold?: boolean; grey?: number; size?: number; height?: number } = {},
): PdfBlock {
  if (values.length !== columns.length) {
    throw new PdfError('A table row needs one column position per value');
  }

  const size = options.size ?? 10;
  const labelFont: FontName = options.bold ? 'Helvetica-Bold' : 'Helvetica';
  const valueFont: FontName = options.bold ? 'Courier-Bold' : 'Courier';

  const firstColumn = columns.length > 0 ? Math.min(...columns) : CONTENT_RIGHT;
  const widestValue = Math.max(0, ...values.map((value) => courierWidth(value, size)));
  const available = firstColumn - widestValue - MARGIN_X - 8;

  return {
    kind: 'row',
    height: options.height ?? size + 6,
    cells: [
      {
        text: truncate(label, labelBudget(available, size)),
        x: MARGIN_X,
        align: 'left',
        font: labelFont,
        size,
        grey: options.grey,
      },
      ...values.map((text, index) => ({
        text,
        x: columns[index],
        align: 'right' as const,
        font: valueFont,
        size,
        grey: options.grey,
      })),
    ],
  };
}
