import QRCode from 'qrcode';

/**
 * The enrollment code, drawn as a QR the phone's camera can read.
 *
 * Two people standing next to each other should not have to read a
 * fourteen-character secret aloud across a shop and hope it was heard right.
 * The QR carries **exactly the code and nothing else** — no URL, no JSON, no
 * server address — so scanning it and typing it produce the identical string,
 * and the backend cannot tell which of the two happened. That is deliberate:
 * one redemption path, one set of rules, one thing to test.
 *
 * It is an **SVG string**, not a PNG. The console renders it inline with no
 * extra request and no image host, it stays sharp at whatever size the owner's
 * screen or a printed page gives it, and it costs a few hundred bytes on a
 * response that is already only sent once.
 *
 * ## Error correction
 *
 * Level **M** (~15% recoverable). A shop phone reads this off a laptop screen
 * across a counter, often at an angle and sometimes with a thumb partly over
 * it — L is meaningfully less forgiving of that, and H would inflate the
 * module count for a payload this short without buying anything a screen
 * needs. The code is short enough that M still fits a small, chunky symbol.
 *
 * ## The secret is still a secret
 *
 * This renders the same one-time code the JSON carries, under exactly the same
 * rule: returned once at issue and never again. It is never logged, never put
 * in an audit summary, and never stored — the database keeps only the SHA-256
 * hash, and this function's output is not persisted anywhere.
 */

/** Roughly the on-screen size an owner can hold a phone up to comfortably. */
const QR_WIDTH_PX = 220;

/**
 * Renders a one-time enrollment code as a self-contained SVG string.
 *
 * Throws whatever `qrcode` throws for input it cannot encode. For a generated
 * enrollment code that cannot happen in practice — it is short, alphanumeric,
 * and far inside the smallest symbol's capacity — but the error is left to
 * propagate rather than swallowed: an enrollment that came back silently
 * *without* its QR would be a worse failure than one that came back as an
 * error the owner can retry.
 *
 * Note where this sits in `DevicesService.issueEnrollment`: **after** the
 * transaction commits. So a throw here would leave a valid enrollment row
 * behind whose code the owner never saw — one wasted, unusable code, expiring
 * on its own. That is the right trade against generating the QR inside the
 * transaction and holding a database write open on rendering work.
 */
export async function enrollmentQrSvg(code: string): Promise<string> {
  return QRCode.toString(code, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    width: QR_WIDTH_PX,
    // A quiet zone is part of the spec, not decoration: a symbol butted
    // against surrounding text is one many readers refuse to see at all.
    margin: 2,
    color: {
      // Shoprex's own dark neutral rather than pure black, so the symbol sits
      // in the console's palette instead of on top of it.
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
