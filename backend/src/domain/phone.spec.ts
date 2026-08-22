import {
  InvalidPhoneNumberError,
  isValidTanzanianPhone,
  normalizeTanzanianPhone,
} from './phone';

describe('normalizeTanzanianPhone', () => {
  it.each([
    ['0712345678', '+255712345678'],
    ['+255712345678', '+255712345678'],
    ['255712345678', '+255712345678'],
    ['712345678', '+255712345678'],
    ['0712 345 678', '+255712345678'],
    ['+255 712-345-678', '+255712345678'],
    ['(0712) 345.678', '+255712345678'],
    ['0655123456', '+255655123456'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeTanzanianPhone(input)).toBe(expected);
  });

  it('maps every spelling of one number onto a single stored value', () => {
    const spellings = ['0712345678', '+255712345678', '255712345678', '712 345 678'];
    const normalised = new Set(spellings.map(normalizeTanzanianPhone));

    expect(normalised.size).toBe(1);
  });

  it.each([
    ['', 'empty'],
    ['0812345678', 'a landline-style prefix'],
    ['071234567', 'too short'],
    ['07123456789', 'too long'],
    ['+254712345678', 'a Kenyan number'],
    ['abcdefghij', 'letters'],
  ])('rejects %s (%s)', (input) => {
    expect(() => normalizeTanzanianPhone(input)).toThrow(InvalidPhoneNumberError);
    expect(isValidTanzanianPhone(input)).toBe(false);
  });
});
