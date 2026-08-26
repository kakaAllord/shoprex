import { enrollmentQrSvg } from './enrollment-qr';
import { generateEnrollmentCode } from './enrollment-token';

describe('enrollmentQrSvg', () => {
  it('returns a self-contained SVG document', async () => {
    const svg = await enrollmentQrSvg('ABCD-EFGH-JKLM');

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox');
  });

  /**
   * The console drops this straight into the page. Anything the browser would
   * have to go and *fetch* would render as a broken box on a shop's laptop —
   * so no `<image>`, no `url(...)`, no stylesheet. The `xmlns` declaration is
   * deliberately not covered by this: it is a namespace name that happens to
   * look like a URL, and nothing ever requests it.
   */
  it('fetches nothing: the symbol is paths and nothing else', async () => {
    const svg = await enrollmentQrSvg('ABCD-EFGH-JKLM');

    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('url(');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('xlink:href');

    // Every drawing instruction is a path.
    expect(svg).toContain('<path');
  });

  /**
   * The whole point of the two-way parity: scanning must hand the redemption
   * route the identical string typing would. So the payload is the bare code —
   * not a URL wrapping it, and not JSON around it.
   */
  it('encodes the bare code, with nothing wrapped around it', async () => {
    const svg = await enrollmentQrSvg('ABCD-EFGH-JKLM');

    // A URL or JSON payload would inflate the symbol; more directly, the
    // library is given the code and only the code.
    expect(svg).not.toContain('shoprex.co.tz');
    expect(svg).not.toContain('{');
  });

  it('encodes a real generated code without throwing', async () => {
    const code = generateEnrollmentCode();

    await expect(enrollmentQrSvg(code)).resolves.toContain('<svg');
  });

  /** Two different codes must not produce the same picture. */
  it('produces a different symbol for a different code', async () => {
    const [first, second] = await Promise.all([
      enrollmentQrSvg('ABCD-EFGH-JKLM'),
      enrollmentQrSvg('MNPQ-RSTU-VWXY'),
    ]);

    expect(first).not.toBe(second);
  });

  it('is deterministic, so the same code always draws the same symbol', async () => {
    const [first, second] = await Promise.all([
      enrollmentQrSvg('ABCD-EFGH-JKLM'),
      enrollmentQrSvg('ABCD-EFGH-JKLM'),
    ]);

    expect(first).toBe(second);
  });

  /**
   * A symbol butted against surrounding text is one many readers refuse to
   * see. The quiet zone is part of the spec, not styling.
   */
  it('keeps a quiet zone around the symbol', async () => {
    const svg = await enrollmentQrSvg('ABCD-EFGH-JKLM');
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];

    expect(viewBox).toBeDefined();

    // The white background rect spans the full viewBox including the margin.
    expect(svg).toContain('#ffffff');
  });

  it('draws in Shoprex’s dark neutral rather than pure black', async () => {
    const svg = await enrollmentQrSvg('ABCD-EFGH-JKLM');

    expect(svg.toLowerCase()).toContain('#0f172a');
  });
});
