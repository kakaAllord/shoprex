import { ean13CheckDigit, isValidEan13, normalizeBarcode } from './barcode';

describe('barcodes', () => {
  // Two codes whose check digits are genuinely correct, worked through by hand.
  const validEan13 = '5901234123457';
  const validUpcA = '012345678905';

  describe('ean13CheckDigit', () => {
    it('computes the digit that completes a real code', () => {
      expect(ean13CheckDigit(validEan13.slice(0, 12))).toBe(7);
    });

    it('refuses anything that is not exactly twelve digits', () => {
      expect(() => ean13CheckDigit('12345')).toThrow();
      expect(() => ean13CheckDigit('abcdefghijkl')).toThrow();
    });
  });

  describe('isValidEan13', () => {
    it('accepts a correct code', () => {
      expect(isValidEan13(validEan13)).toBe(true);
    });

    it('rejects a code whose check digit is wrong', () => {
      expect(isValidEan13('5901234123456')).toBe(false);
    });

    it.each([
      ['too short', '590123412345'],
      ['too long', '59012341234578'],
      ['not digits', '59012341234a7'],
      ['empty', ''],
    ])('rejects one that is %s', (_label, value) => {
      expect(isValidEan13(value)).toBe(false);
    });
  });

  describe('normalizeBarcode', () => {
    it('returns a valid EAN-13 unchanged', () => {
      expect(normalizeBarcode(validEan13)).toBe(validEan13);
    });

    it('forgives the spacing a scanner or a person adds', () => {
      expect(normalizeBarcode(' 590 1234-123457 ')).toBe(validEan13);
    });

    it('widens a UPC-A to the EAN-13 it already is', () => {
      // A leading zero is exactly what a UPC-A means, and the check digit
      // survives it — so American-packaged goods scan without anyone knowing.
      expect(normalizeBarcode(validUpcA)).toBe(`0${validUpcA}`);
    });

    it('still checks the digit after widening a UPC-A', () => {
      expect(normalizeBarcode('012345678904')).toBeNull();
    });

    it('rejects a mis-scan rather than storing a phantom', () => {
      // Storing this would create a product the real item can never match.
      expect(normalizeBarcode('5901234123456')).toBeNull();
    });

    it.each([
      ['a short code', '12345'],
      ['an EAN-8', '96385074'],
      ['letters', 'not-a-barcode'],
      ['nothing', '   '],
    ])('rejects %s', (_label, value) => {
      expect(normalizeBarcode(value)).toBeNull();
    });

    it('is idempotent, so re-normalising a stored value is safe', () => {
      const once = normalizeBarcode(validUpcA)!;

      expect(normalizeBarcode(once)).toBe(once);
    });
  });
});
