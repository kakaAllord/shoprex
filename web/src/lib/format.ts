/**
 * How Shoprex writes numbers, dates, and names down.
 *
 * One place, because a console that renders `TSh 12000` on one screen and
 * `12,000 TSh` on the next reads as two products stitched together.
 */

/**
 * Whole Tanzanian shillings. Prices are integers throughout — TZS is not
 * divided into subunits in practice — so there is deliberately no decimal
 * handling here to get wrong.
 */
export function money(amountTzs: number): string {
  return `TSh ${amountTzs.toLocaleString('en-GB')}`;
}

/** A price that has not been set yet is not a price of zero. */
export function priceOrUnpriced(priceTzs: number | null): string {
  return priceTzs === null ? 'Haijawekwa bei · Not priced' : money(priceTzs);
}

/**
 * A timestamp in the shop's own terms.
 *
 * The backend stamps every authoritative event with its own clock and returns
 * ISO-8601; this only decides how it reads. Anywhere a *day boundary* matters,
 * the answer comes from the backend, not from here — see Phase 7.
 */
export function moment(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "Bado hajaingia" rather than an empty cell, which reads as a bug. */
export function lastSeen(iso: string | null): string {
  return iso === null ? 'Bado · Not yet' : moment(iso);
}
