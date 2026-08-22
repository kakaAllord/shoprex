import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * One-time device enrollment codes.
 *
 * The code is read aloud or written on paper by an owner and typed into a
 * phone by a worker, so the alphabet excludes characters that are misread by
 * hand: `0`/`O`, `1`/`I`/`L`, and `U` (which is easily heard as "you" when
 * dictated). What is left is 30 symbols; twelve of them carry roughly 59 bits
 * of entropy, which is far beyond guessing for a secret that lives for an hour,
 * is single-use, and sits behind the strict auth rate-limit bucket.
 *
 * Only the SHA-256 hash is stored. bcrypt is deliberately not used here: a
 * redemption has to *find* the token row by its value, which needs a
 * deterministic digest, and the input is high-entropy random rather than a
 * human-chosen password.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 12;
const GROUP_SIZE = 4;

/** Generates a fresh code in its readable, grouped form: `7KQ4-9XMR-2PT8`. */
export function generateEnrollmentCode(): string {
  let raw = '';

  for (let i = 0; i < CODE_LENGTH; i += 1) {
    raw += ALPHABET[randomInt(ALPHABET.length)];
  }

  return groupCode(raw);
}

/**
 * Accepts what a worker actually types — lower case, missing dashes, stray
 * spaces — and returns the canonical grouped form, or null if the value could
 * not be a Shoprex code at all.
 */
export function normalizeEnrollmentCode(input: string): string | null {
  const stripped = input.toUpperCase().replace(/[^0-9A-Z]/g, '');

  if (stripped.length !== CODE_LENGTH) {
    return null;
  }

  if (![...stripped].every((character) => ALPHABET.includes(character))) {
    return null;
  }

  return groupCode(stripped);
}

/** The stored form. Never store or log the code itself. */
export function hashEnrollmentCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

/** Constant-time comparison, so a hash is never leaked by response timing. */
export function enrollmentHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  return left.length === right.length && timingSafeEqual(left, right);
}

function groupCode(raw: string): string {
  const groups: string[] = [];

  for (let i = 0; i < raw.length; i += GROUP_SIZE) {
    groups.push(raw.slice(i, i + GROUP_SIZE));
  }

  return groups.join('-');
}
