/**
 * Barcodes. V1 accepts **EAN-13**, confirmed by the owner on 2026-08-22.
 *
 * A UPC-A code is accepted too, because a 12-digit UPC-A *is* an EAN-13 with a
 * leading zero — same digits, same check digit — so goods packaged for the
 * American market scan without anyone having to know that. It is normalised to
 * its 13-digit form on the way in, so one product cannot end up with two
 * barcodes that are really the same code.
 *
 * The check digit is verified rather than trusted. A 13-digit string that fails
 * it is a mis-scan or a typo, not a product, and storing it would create a
 * phantom that the real item can never match again.
 */
const EAN13_LENGTH = 13;
const UPCA_LENGTH = 12;

/**
 * Turns what a scanner or a person actually produced into the one canonical
 * form, or null if it could not be a barcode Shoprex accepts.
 *
 * Returning null rather than throwing keeps the decision at the caller: an
 * empty barcode field is perfectly normal (a shop may sell loose goods that
 * carry no barcode at all), while a *supplied* barcode that will not normalise
 * is an error worth reporting.
 */
export function normalizeBarcode(input: string): string | null {
  const digits = input.trim().replace(/[\s-]/g, '');

  if (!/^\d+$/.test(digits)) {
    return null;
  }

  // A UPC-A is an EAN-13 whose leading digit happens to be zero.
  const candidate = digits.length === UPCA_LENGTH ? `0${digits}` : digits;

  if (candidate.length !== EAN13_LENGTH) {
    return null;
  }

  return isValidEan13(candidate) ? candidate : null;
}

/** True when the string is 13 digits and its final digit is the correct check. */
export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) {
    return false;
  }

  return ean13CheckDigit(value.slice(0, 12)) === Number(value[12]);
}

/**
 * The check digit for the first twelve digits: weight each by 1 and 3
 * alternately, sum, and take what is needed to reach the next multiple of ten.
 */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error('An EAN-13 check digit is computed from exactly 12 digits');
  }

  const sum = [...first12].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );

  return (10 - (sum % 10)) % 10;
}
