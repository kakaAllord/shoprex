import { describe, expect, it } from 'vitest';
import { lastSeen, money, priceOrUnpriced } from './format';

describe('money', () => {
  it('writes whole Tanzanian shillings, grouped', () => {
    expect(money(0)).toBe('TSh 0');
    expect(money(1_000)).toBe('TSh 1,000');
    expect(money(1_250_000)).toBe('TSh 1,250,000');
  });
});

describe('priceOrUnpriced', () => {
  it('says a price that was never set is not a price of zero', () => {
    // A product added mid-sale or during a delivery may have no price yet.
    // Rendering it as TSh 0 would say the shop gives it away.
    expect(priceOrUnpriced(null)).toBe('Haijawekwa bei · Not priced');
    expect(priceOrUnpriced(0)).toBe('TSh 0');
    expect(priceOrUnpriced(1_500)).toBe('TSh 1,500');
  });
});

describe('lastSeen', () => {
  it('says "not yet" rather than leaving a cell empty, which reads as a bug', () => {
    expect(lastSeen(null)).toBe('Bado · Not yet');
  });

  it('renders a timestamp the backend stamped', () => {
    expect(lastSeen('2026-08-23T09:15:00.000Z')).toMatch(/2026/);
  });
});
