/**
 * What "a day" means, decided once.
 *
 * Every authoritative Shoprex timestamp is UTC, stamped by the backend server
 * clock — a phone with the wrong local time must never decide which day a sale
 * is reported under (doc 03, Timestamp rule). But a shopkeeper does not think
 * in UTC. They think in *their* Monday, which in Dar es Salaam begins three
 * hours before UTC's does, and a report that quietly used UTC midnight would
 * push every sale made between 21:00 and midnight into the following day.
 *
 * So the conversion between "the 21st, in this shop's terms" and a pair of UTC
 * instants lives here, in one pure module, and both the dashboard and the PDF
 * read it. Doing it twice is how the two come to disagree — the Phase 6 sales
 * list deliberately shipped without a date filter for exactly this reason (see
 * PROGRESS.md §6's handoff notes).
 *
 * The zone comes from `Business.timezone`, which defaults to
 * `Africa/Dar_es_Salaam`. Nothing here hard-codes +03:00: the offset is asked
 * of the platform's own IANA database through `Intl`, so a shop in a zone that
 * observes daylight saving gets the right answer, and so does Tanzania on the
 * day the rules change.
 *
 * Every function is pure. Nothing here knows about the database, HTTP, or
 * Nest, and it stays that way — beside `units.ts`, `stock.ts`, and `sale.ts`.
 */

export class DayWindowError extends Error {}

/** A calendar date in a shop's own zone, as `YYYY-MM-DD`. */
export type LocalDate = string;

/**
 * One shop-local day, expressed as the half-open UTC interval `[start, end)`
 * that a `createdAt` comparison can actually use.
 *
 * Half-open deliberately. A closed interval has to pick between including
 * midnight in both days and excluding the last millisecond from either, and
 * both are wrong in a way that only shows up in a total nobody can reconcile.
 */
export interface DayWindow {
  /** The local calendar date this window is the whole of. */
  date: LocalDate;
  /** The IANA zone it was resolved in — echoed so a reader can check it. */
  timeZone: string;
  /** Inclusive. The instant local midnight happened. */
  startUtc: Date;
  /** Exclusive. The instant the *next* local midnight happens. */
  endUtc: Date;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Reads `YYYY-MM-DD` strictly.
 *
 * Strictly, because `new Date('2026-02-30')` is a date in March and a report
 * that silently answers for a different day than the one asked for is worse
 * than one that refuses. The round-trip check below is what catches that.
 */
export function parseLocalDate(value: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(value);

  if (!match) {
    throw new DayWindowError(`A date must be written as YYYY-MM-DD, not "${value}"`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new DayWindowError(`"${value}" is not a date on any calendar`);
  }

  // 31 April and 29 February in a common year both parse and both roll over.
  const rolled = new Date(Date.UTC(year, month - 1, day));

  if (
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() !== month - 1 ||
    rolled.getUTCDate() !== day
  ) {
    throw new DayWindowError(`"${value}" is not a date on any calendar`);
  }

  return { year, month, day };
}

/**
 * Refuses a zone the platform does not know.
 *
 * `Intl` throws a `RangeError` for an unknown zone, which would otherwise
 * surface as a 500 on a report route because somebody typed a business
 * timezone wrong. Better to say which zone was not recognised.
 */
function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
  } catch {
    throw new DayWindowError(`"${timeZone}" is not a time zone this server knows`);
  }
}

const PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** One formatter per zone, kept: building one is the expensive part. */
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = PART_FORMATTERS.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    PART_FORMATTERS.set(timeZone, formatter);
  }

  return formatter;
}

/** The wall-clock reading a zone shows at a given instant. */
function wallClock(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);

    return part ? Number(part.value) : 0;
  };

  // Some platforms render midnight as hour 24 rather than 0.
  const hour = read('hour') % 24;

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/**
 * How far ahead of UTC a zone is at a given instant, in milliseconds.
 *
 * Derived rather than looked up: read the zone's wall clock at the instant,
 * pretend that reading is UTC, and the difference is the offset. That works
 * for whole-hour zones, for the half-hour and three-quarter-hour ones, and
 * across a daylight-saving change, because the platform's own IANA database
 * did the deciding.
 */
function offsetMs(instant: Date, timeZone: string): number {
  const local = wallClock(instant, timeZone);

  const asIfUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );

  // Seconds are the finest thing the formatter reports, so the instant's own
  // milliseconds are added back rather than lost.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds()) - instant.getMilliseconds();
}

/**
 * The UTC instant at which a given local wall-clock time happened.
 *
 * The offset depends on the instant, and the instant is what is being solved
 * for, so this guesses and corrects: assume the naive reading is UTC, apply
 * the offset in force *there*, then re-apply the offset in force at the
 * answer. One correction is enough — the second pass only differs when the
 * first guess landed on the far side of a daylight-saving change, and the
 * corrected instant is then inside the right offset.
 */
function utcOfLocal(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const firstGuess = naive - offsetMs(new Date(naive), timeZone);

  return new Date(naive - offsetMs(new Date(firstGuess), timeZone));
}

/**
 * A shop-local calendar date, as the UTC interval it actually occupies.
 *
 * The end is the *next* local midnight rather than 23:59:59.999, so a day that
 * is 23 or 25 hours long because its zone changed offset is still exactly one
 * day, and no sale can fall between two consecutive windows.
 */
export function dayWindow(date: LocalDate, timeZone: string): DayWindow {
  assertTimeZone(timeZone);

  const { year, month, day } = parseLocalDate(date);

  const startUtc = utcOfLocal(year, month, day, timeZone);
  // Built from the calendar rather than by adding 24 hours, so the next
  // window begins exactly where this one ends whatever the offset did.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const endUtc = utcOfLocal(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );

  if (endUtc.getTime() <= startUtc.getTime()) {
    throw new DayWindowError(`Could not resolve ${date} in ${timeZone}`);
  }

  return { date, timeZone, startUtc, endUtc };
}

/** Which shop-local calendar date an instant fell on. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  assertTimeZone(timeZone);

  const local = wallClock(instant, timeZone);

  return [
    String(local.year).padStart(4, '0'),
    String(local.month).padStart(2, '0'),
    String(local.day).padStart(2, '0'),
  ].join('-');
}

/**
 * "Today", in the shop's terms.
 *
 * `now` is passed in rather than read here so that callers stay testable and
 * so that it is obvious at every call site that this is the *server* clock —
 * the only clock Shoprex trusts.
 */
export function todayIn(timeZone: string, now: Date): LocalDate {
  return localDateOf(now, timeZone);
}

/** The day before a local date, on the local calendar. */
export function previousDay(date: LocalDate): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day - 1));

  return localDateOf(shifted, 'UTC');
}

/** The day after a local date, on the local calendar. */
export function nextDay(date: LocalDate): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + 1));

  return localDateOf(shifted, 'UTC');
}
