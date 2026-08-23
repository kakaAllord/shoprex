import {
  enrollmentHashesMatch,
  generateEnrollmentCode,
  hashEnrollmentCode,
  normalizeEnrollmentCode,
} from './enrollment-token';

describe('enrollment codes', () => {
  describe('generateEnrollmentCode', () => {
    it('produces three readable groups of four', () => {
      expect(generateEnrollmentCode()).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    });

    it('never emits a character that is misread by hand', () => {
      const forbidden = /[01OILU]/;

      for (let i = 0; i < 200; i += 1) {
        expect(generateEnrollmentCode().replace(/-/g, '')).not.toMatch(forbidden);
      }
    });

    it('does not repeat itself', () => {
      const codes = new Set(Array.from({ length: 500 }, () => generateEnrollmentCode()));

      expect(codes.size).toBe(500);
    });
  });

  describe('normalizeEnrollmentCode', () => {
    it('accepts the code exactly as it was issued', () => {
      const code = generateEnrollmentCode();

      expect(normalizeEnrollmentCode(code)).toBe(code);
    });

    it.each([
      ['lower case', (code: string) => code.toLowerCase()],
      ['no dashes', (code: string) => code.replace(/-/g, '')],
      ['spaces instead of dashes', (code: string) => code.replace(/-/g, ' ')],
      ['surrounding whitespace', (code: string) => `  ${code}\n`],
    ])('forgives %s, because a worker types this on a phone', (_label, mangle) => {
      const code = generateEnrollmentCode();

      expect(normalizeEnrollmentCode(mangle(code))).toBe(code);
    });

    it.each([
      ['too short', 'ABCD-EFGH'],
      ['too long', 'ABCD-EFGH-JKMN-PQRS'],
      ['empty', ''],
      ['a character the alphabet excludes', 'ABCD-EFGH-JKM0'],
      ['an excluded look-alike letter', 'ABCD-EFGH-JKMI'],
    ])('rejects %s', (_label, input) => {
      expect(normalizeEnrollmentCode(input)).toBeNull();
    });
  });

  describe('hashEnrollmentCode', () => {
    it('is deterministic, so a redemption can find the row', () => {
      const code = generateEnrollmentCode();

      expect(hashEnrollmentCode(code)).toBe(hashEnrollmentCode(code));
    });

    it('does not contain the code it hashes', () => {
      const code = generateEnrollmentCode();
      const hash = hashEnrollmentCode(code);

      expect(hash).toHaveLength(64);
      expect(hash).not.toContain(code.replace(/-/g, ''));
    });

    it('separates two different codes', () => {
      expect(hashEnrollmentCode('AAAA-BBBB-CCCC')).not.toBe(
        hashEnrollmentCode('AAAA-BBBB-CCCD'),
      );
    });
  });

  describe('enrollmentHashesMatch', () => {
    it('matches a hash with itself', () => {
      const hash = hashEnrollmentCode(generateEnrollmentCode());

      expect(enrollmentHashesMatch(hash, hash)).toBe(true);
    });

    it('rejects a different hash', () => {
      expect(
        enrollmentHashesMatch(
          hashEnrollmentCode('AAAA-BBBB-CCCC'),
          hashEnrollmentCode('DDDD-EEEE-FFFF'),
        ),
      ).toBe(false);
    });

    it('rejects a length mismatch without throwing', () => {
      expect(enrollmentHashesMatch('abc', 'abcd')).toBe(false);
    });
  });
});
