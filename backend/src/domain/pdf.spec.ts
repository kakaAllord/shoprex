import {
  CONTENT_RIGHT,
  MARGIN_X,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  PdfBlock,
  PdfError,
  courierWidth,
  gap,
  heading,
  labelBudget,
  pageBreak,
  paragraph,
  pdfString,
  renderPdf,
  rule,
  subheading,
  tableRow,
  truncate,
} from './pdf';

const latin1 = (bytes: Buffer): string => bytes.toString('latin1');

describe('pdfString', () => {
  it('wraps text in the parentheses a PDF literal string needs', () => {
    expect(latin1(pdfString('Mauzo'))).toBe('(Mauzo)');
  });

  it('escapes the three characters that would otherwise end the string', () => {
    expect(latin1(pdfString('a(b)c\\d'))).toBe('(a\\(b\\)c\\\\d)');
  });

  /**
   * The one non-ASCII character Shoprex's copy actually uses, everywhere:
   * "Mauzo · Sales". WinAnsi carries it at 0xB7, so it must survive rather
   * than becoming a question mark.
   */
  it('carries the interpunct Shoprex writes between Swahili and English', () => {
    const bytes = pdfString('Mauzo · Sales');

    expect(bytes.includes(0xb7)).toBe(true);
    expect(latin1(bytes)).toBe('(Mauzo · Sales)');
  });

  it('maps the punctuation WinAnsi keeps outside Latin-1', () => {
    expect(pdfString('–').includes(0x96)).toBe(true);
    expect(pdfString('…').includes(0x85)).toBe(true);
    expect(pdfString('’').includes(0x92)).toBe(true);
  });

  it('carries an accented Latin-1 letter unchanged', () => {
    expect(pdfString('Café').includes(0xe9)).toBe(true);
  });

  /**
   * A readable report with a question mark in it beats a broken string object
   * that some readers repair and others refuse.
   */
  it('replaces what the encoding cannot carry with a question mark', () => {
    expect(latin1(pdfString('日本'))).toBe('(??)');
  });
});

describe('courierWidth', () => {
  it('is exactly 0.6 em per character, which is what makes a money column line up', () => {
    expect(courierWidth('12345', 10)).toBeCloseTo(30);
    expect(courierWidth('', 10)).toBe(0);
  });

  it('gives two strings of equal length equal width, whatever the digits', () => {
    expect(courierWidth('TSh 1,000', 10)).toBe(courierWidth('TSh 9,999', 10));
  });
});

describe('truncate', () => {
  it('leaves a label that fits alone', () => {
    expect(truncate('Coca-Cola', 20)).toBe('Coca-Cola');
  });

  it('shortens a long label with an ellipsis rather than letting it collide', () => {
    expect(truncate('Coca-Cola 500ml Crate of Twenty-Four', 12)).toBe('Coca-Cola 5…');
    expect(truncate('Coca-Cola 500ml Crate of Twenty-Four', 12)).toHaveLength(12);
  });

  it('handles the degenerate budgets without throwing', () => {
    expect(truncate('anything', 0)).toBe('');
    expect(truncate('anything', 1)).toBe('…');
  });
});

describe('labelBudget', () => {
  it('grows with the space and shrinks with the type size', () => {
    expect(labelBudget(120, 10)).toBe(20);
    expect(labelBudget(120, 20)).toBe(10);
  });

  it('never goes negative when a column leaves no room at all', () => {
    expect(labelBudget(-40, 10)).toBe(0);
  });
});

describe('renderPdf', () => {
  const simple: PdfBlock[] = [heading('Ripoti ya siku'), paragraph('Duka la Mfano')];

  it('refuses to render nothing', () => {
    expect(() => renderPdf({ title: 'x', footer: 'y', blocks: [] })).toThrow(PdfError);
  });

  it('produces a file every reader recognises as a PDF', () => {
    const bytes = renderPdf({ title: 'Ripoti', footer: 'Shoprex', blocks: simple });
    const text = latin1(bytes);

    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('declares the four base-14 fonts, so nothing has to be embedded', () => {
    const text = latin1(renderPdf({ title: 'Ripoti', footer: 'Shoprex', blocks: simple }));

    for (const font of ['/Helvetica', '/Helvetica-Bold', '/Courier', '/Courier-Bold']) {
      expect(text).toContain(`/BaseFont ${font} /Encoding /WinAnsiEncoding`);
    }
  });

  it('sets an A4 media box', () => {
    const text = latin1(renderPdf({ title: 'Ripoti', footer: 'Shoprex', blocks: simple }));

    expect(text).toContain(`/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]`);
  });

  /**
   * This is the property the acceptance check leans on: the text stream is
   * uncompressed and unencoded, so a test — and a reader — can see the same
   * numbers the dashboard showed.
   */
  it('leaves the text readable in the file, which is how the totals are checked', () => {
    const bytes = renderPdf({
      title: 'Ripoti',
      footer: 'Shoprex',
      blocks: [tableRow('Jumla ya mauzo', ['TSh 412,000'], [CONTENT_RIGHT])],
    });

    expect(latin1(bytes)).toContain('(TSh 412,000) Tj');
    expect(latin1(bytes)).toContain('(Jumla ya mauzo) Tj');
  });

  it('does not compress or filter the stream', () => {
    const text = latin1(renderPdf({ title: 'Ripoti', footer: 'Shoprex', blocks: simple }));

    expect(text).not.toContain('/Filter');
  });

  /**
   * A byte offset that is out by one produces a file some readers repair
   * silently and others refuse outright — the worst possible failure, because
   * it passes on the machine it was written on.
   */
  it('writes cross-reference offsets that actually point at their objects', () => {
    const bytes = renderPdf({ title: 'Ripoti', footer: 'Shoprex', blocks: simple });
    const text = latin1(bytes);

    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(Number.isInteger(startxref)).toBe(true);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');

    const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    expect(entries.length).toBeGreaterThan(0);

    entries.forEach((offset, index) => {
      expect(text.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj\\n`));
    });
  });

  it('counts the objects it declares', () => {
    const text = latin1(renderPdf({ title: 'Ripoti', footer: 'Shoprex', blocks: simple }));

    const size = Number(/\/Size (\d+)/.exec(text)?.[1]);
    const objects = [...text.matchAll(/^\d+ 0 obj$/gm)].length;

    expect(size).toBe(objects + 1); // +1 for the free entry every xref starts with
  });

  it('declares a stream length that matches the bytes it wrote', () => {
    const bytes = renderPdf({ title: 'Ripoti', footer: 'Shoprex', blocks: simple });
    const text = latin1(bytes);

    const match = /\/Length (\d+) >>\nstream\n/.exec(text);
    const declared = Number(match?.[1]);
    const start = (match?.index ?? 0) + (match?.[0].length ?? 0);

    expect(text.slice(start + declared, start + declared + 10)).toBe('\nendstream');
  });

  it('titles the document', () => {
    const text = latin1(renderPdf({ title: 'Ripoti ya siku', footer: 'Shoprex', blocks: simple }));

    expect(text).toContain('/Title (Ripoti ya siku)');
  });

  it('stamps every page with the footer and its page number', () => {
    const text = latin1(
      renderPdf({ title: 'Ripoti', footer: 'Duka la Mfano', blocks: simple }),
    );

    expect(text).toContain('(Duka la Mfano · 1/1) Tj');
  });
});

describe('renderPdf paginates', () => {
  const manyRows = (count: number): PdfBlock[] =>
    Array.from({ length: count }, (_unused, index) =>
      tableRow(`Bidhaa ${index}`, [`TSh ${index}`], [CONTENT_RIGHT]),
    );

  const pageCount = (bytes: Buffer): number =>
    Number(/\/Count (\d+)/.exec(bytes.toString('latin1'))?.[1]);

  it('keeps a short report on one page', () => {
    expect(pageCount(renderPdf({ title: 't', footer: 'f', blocks: manyRows(10) }))).toBe(1);
  });

  it('starts a new page rather than writing past the bottom margin', () => {
    expect(pageCount(renderPdf({ title: 't', footer: 'f', blocks: manyRows(200) }))).toBeGreaterThan(1);
  });

  it('numbers each page out of the true total', () => {
    const text = latin1(renderPdf({ title: 't', footer: 'Shoprex', blocks: manyRows(200) }));
    const total = pageCount(renderPdf({ title: 't', footer: 'Shoprex', blocks: manyRows(200) }));

    expect(text).toContain(`(Shoprex · 1/${total}) Tj`);
    expect(text).toContain(`(Shoprex · ${total}/${total}) Tj`);
  });

  it('keeps every row: nothing is dropped to make a page fit', () => {
    const text = latin1(renderPdf({ title: 't', footer: 'f', blocks: manyRows(200) }));

    for (const index of [0, 42, 199]) {
      expect(text).toContain(`(Bidhaa ${index}) Tj`);
    }
  });

  it('honours an explicit page break', () => {
    const bytes = renderPdf({
      title: 't',
      footer: 'f',
      blocks: [heading('One'), pageBreak(), heading('Two')],
    });

    expect(pageCount(bytes)).toBe(2);
  });

  it('does not open a blank page for a break at the very start', () => {
    const bytes = renderPdf({ title: 't', footer: 'f', blocks: [pageBreak(), heading('One')] });

    expect(pageCount(bytes)).toBe(1);
  });
});

describe('tableRow', () => {
  it('refuses a row whose values and columns disagree', () => {
    expect(() => tableRow('x', ['a', 'b'], [CONTENT_RIGHT])).toThrow(PdfError);
  });

  it('right-aligns a value so it ends at its column', () => {
    const block = tableRow('Jumla', ['TSh 1,000'], [CONTENT_RIGHT]);

    expect(block).toMatchObject({ kind: 'row' });

    if (block.kind !== 'row') {
      throw new Error('unreachable');
    }

    const value = block.cells[1];

    expect(value.align).toBe('right');
    expect(value.x).toBe(CONTENT_RIGHT);
    expect(value.font).toBe('Courier');
  });

  it('uses the bold pair of fonts when asked, so a total row reads as one', () => {
    const block = tableRow('Jumla', ['TSh 1,000'], [CONTENT_RIGHT], { bold: true });

    if (block.kind !== 'row') {
      throw new Error('unreachable');
    }

    expect(block.cells[0].font).toBe('Helvetica-Bold');
    expect(block.cells[1].font).toBe('Courier-Bold');
  });

  /**
   * The collision this module's character budget exists to prevent: a long
   * product name must shorten rather than run into the shillings beside it.
   */
  it('truncates a label that would otherwise reach into the number column', () => {
    const block = tableRow(
      'Coca-Cola 500ml, Kreti ya chupa ishirini na nne, mzigo wa Jumatatu uliopokelewa asubuhi',
      ['TSh 1,000,000'],
      [CONTENT_RIGHT],
    );

    if (block.kind !== 'row') {
      throw new Error('unreachable');
    }

    const label = block.cells[0];

    expect(label.text.endsWith('…')).toBe(true);
    expect(label.text.length * 10 * 0.6 + MARGIN_X).toBeLessThan(
      CONTENT_RIGHT - courierWidth('TSh 1,000,000', 10),
    );
  });

  it('leaves a short label alone', () => {
    const block = tableRow('Taslimu', ['TSh 1,000'], [CONTENT_RIGHT]);

    if (block.kind !== 'row') {
      throw new Error('unreachable');
    }

    expect(block.cells[0].text).toBe('Taslimu');
  });

  it('places several numbers at several columns', () => {
    const block = tableRow('Neema', ['3', 'TSh 9,000', 'TSh 0'], [400, 480, CONTENT_RIGHT]);

    if (block.kind !== 'row') {
      throw new Error('unreachable');
    }

    expect(block.cells.map((cell) => cell.x)).toEqual([MARGIN_X, 400, 480, CONTENT_RIGHT]);
  });
});

describe('block helpers', () => {
  it('give every block a height, so pagination can measure it', () => {
    for (const block of [heading('a'), subheading('b'), paragraph('c'), rule(), gap()]) {
      expect(block).toHaveProperty('height');
    }
  });

  it('render an empty cell as nothing rather than as an empty string object', () => {
    const text = latin1(
      renderPdf({
        title: 't',
        footer: 'f',
        blocks: [tableRow('', [''], [CONTENT_RIGHT]), heading('Real')],
      }),
    );

    expect(text).not.toContain('() Tj');
  });
});
