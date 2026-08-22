/**
 * Tanzanian phone numbers, normalised to one canonical form.
 *
 * Shops write the same number many ways: 0712 345 678, +255712345678,
 * 255712345678, 712345678. All of these are the same person, so they must
 * become one stored value or "phone already registered" checks are useless.
 *
 * Canonical form: +255 followed by nine digits, the first of which is 6 or 7.
 */

export const TANZANIA_DIALLING_CODE = '255';

export class InvalidPhoneNumberError extends Error {
  constructor(input: string) {
    super(`"${input}" is not a valid Tanzanian mobile number`);
    this.name = 'InvalidPhoneNumberError';
  }
}

/** Returns the canonical +255XXXXXXXXX form, or throws. */
export function normalizeTanzanianPhone(input: string): string {
  const digits = String(input ?? '').replace(/[\s()\-.]/g, '');

  if (digits.length === 0) {
    throw new InvalidPhoneNumberError(input);
  }

  let national: string;

  if (digits.startsWith('+255')) {
    national = digits.slice(4);
  } else if (digits.startsWith('255')) {
    national = digits.slice(3);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  // Tanzanian mobile numbers are nine digits after the code and start with 6 or 7.
  if (!/^[67]\d{8}$/.test(national)) {
    throw new InvalidPhoneNumberError(input);
  }

  return `+${TANZANIA_DIALLING_CODE}${national}`;
}

export function isValidTanzanianPhone(input: string): boolean {
  try {
    normalizeTanzanianPhone(input);
    return true;
  } catch {
    return false;
  }
}
