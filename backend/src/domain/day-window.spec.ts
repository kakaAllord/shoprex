import {
  DayWindowError,
  dayWindow,
  localDateOf,
  nextDay,
  parseLocalDate,
  previousDay,
  todayIn,
} from './day-window';

const DAR = 'Africa/Dar_es_Salaam';

describe('parseLocalDate', () => {
  it('reads a well-formed date', () => {
    expect(parseLocalDate('2026-08-21')).toEqual({ year: 2026, month: 8, day: 21 });
  });

  it.each(['21-08-2026', '2026/08/21', '2026-8-21', 'today', '', '2026-08-21T00:00:00Z'])(
    'refuses %p, which is not YYYY-MM-DD',
    (value) => {
      expect(() => parseLocalDate(value)).toThrow(DayWindowError);
    },
  );

  it('refuses a date that no calendar has, rather than rolling it over', () => {
    // new Date('2026-02-30') is 2 March. A report that silently answers for a
    // different day than the one asked for is worse than one that refuses.
    expect(() => parseLocalDate('2026-02-30')).toThrow(DayWindowError);
    expect(() => parseLocalDate('2026-04-31')).toThrow(DayWindowError);
    expect(() => parseLocalDate('2026-13-01')).toThrow(DayWindowError);
    expect(() => parseLocalDate('2026-00-10')).toThrow(DayWindowError);
  });

  it('accepts 29 February in a leap year and refuses it otherwise', () => {
    expect(parseLocalDate('2028-02-29').day).toBe(29);
    expect(() => parseLocalDate('2026-02-29')).toThrow(DayWindowError);
  });
});

describe('dayWindow in Africa/Dar_es_Salaam', () => {
  it('starts at local midnight, which is 21:00 UTC the day before', () => {
    const window = dayWindow('2026-08-21', DAR);

    expect(window.startUtc.toISOString()).toBe('2026-08-20T21:00:00.000Z');
    expect(window.endUtc.toISOString()).toBe('2026-08-21T21:00:00.000Z');
    expect(window.date).toBe('2026-08-21');
    expect(window.timeZone).toBe(DAR);
  });

  /**
   * This is the whole point of the module. A sale rung up at 22:30 in Dar es
   * Salaam is stamped 19:30 UTC on the same date, but one rung up at 00:30 is
   * stamped 21:30 UTC on the date *before* — and belongs to the later day's
   * takings.
   */
  it('puts a sale stamped just before the local day starts in the previous day', () => {
    const window = dayWindow('2026-08-21', DAR);
    const justBefore = new Date('2026-08-20T20:59:59.999Z'); // 23:59:59 local, 20th

    expect(justBefore.getTime()).toBeLessThan(window.startUtc.getTime());
    expect(localDateOf(justBefore, DAR)).toBe('2026-08-20');
  });

  it('puts a sale stamped at the local day boundary in the new day', () => {
    const window = dayWindow('2026-08-21', DAR);
    const firstInstant = new Date('2026-08-20T21:00:00.000Z'); // 00:00:00 local, 21st

    expect(firstInstant.getTime()).toBe(window.startUtc.getTime());
    expect(localDateOf(firstInstant, DAR)).toBe('2026-08-21');
  });

  it('excludes the next local midnight, so no sale falls in two days at once', () => {
    const window = dayWindow('2026-08-21', DAR);
    const lastInstant = new Date('2026-08-21T20:59:59.999Z');
    const firstOfNext = new Date('2026-08-21T21:00:00.000Z');

    expect(lastInstant.getTime()).toBeLessThan(window.endUtc.getTime());
    expect(firstOfNext.getTime()).toBe(window.endUtc.getTime());
    expect(localDateOf(firstOfNext, DAR)).toBe('2026-08-22');
  });

  it('hands consecutive days over without a gap or an overlap', () => {
    const first = dayWindow('2026-08-21', DAR);
    const second = dayWindow('2026-08-22', DAR);

    expect(second.startUtc.getTime()).toBe(first.endUtc.getTime());
  });

  it('is exactly twenty-four hours long in a zone with no daylight saving', () => {
    const window = dayWindow('2026-08-21', DAR);

    expect(window.endUtc.getTime() - window.startUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('crosses a month end and a year end on the local calendar', () => {
    expect(dayWindow('2026-12-31', DAR).endUtc.toISOString()).toBe('2026-12-31T21:00:00.000Z');
    expect(dayWindow('2027-01-01', DAR).startUtc.toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });
});

/**
 * Tanzania has no daylight saving, so a +03:00 constant would pass every test
 * above. These prove the offset is genuinely asked of the platform's IANA
 * database rather than assumed — which is what makes the module safe if a shop
 * is ever configured to another zone.
 */
describe('dayWindow does not assume a fixed offset', () => {
  it('resolves a zone that is behind UTC', () => {
    const window = dayWindow('2026-08-21', 'America/New_York'); // UTC-4 in August

    expect(window.startUtc.toISOString()).toBe('2026-08-21T04:00:00.000Z');
    expect(window.endUtc.toISOString()).toBe('2026-08-22T04:00:00.000Z');
  });

  it('resolves a zone offset by a part-hour', () => {
    const window = dayWindow('2026-08-21', 'Asia/Kolkata'); // UTC+5:30

    expect(window.startUtc.toISOString()).toBe('2026-08-20T18:30:00.000Z');
  });

  it('gives a 23-hour day where the clocks go forward', () => {
    // 29 March 2026, Europe/London springs from 01:00 to 02:00.
    const window = dayWindow('2026-03-29', 'Europe/London');

    expect(window.endUtc.getTime() - window.startUtc.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('gives a 25-hour day where the clocks go back', () => {
    // 25 October 2026, Europe/London falls from 02:00 to 01:00.
    const window = dayWindow('2026-10-25', 'Europe/London');

    expect(window.endUtc.getTime() - window.startUtc.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('still hands consecutive days over without a gap across that change', () => {
    const first = dayWindow('2026-10-25', 'Europe/London');
    const second = dayWindow('2026-10-26', 'Europe/London');

    expect(second.startUtc.getTime()).toBe(first.endUtc.getTime());
  });

  it('refuses a zone this server does not know', () => {
    expect(() => dayWindow('2026-08-21', 'Africa/Nowhere')).toThrow(DayWindowError);
  });

  it('refuses a malformed date before it goes looking for a zone', () => {
    expect(() => dayWindow('21st August', DAR)).toThrow(DayWindowError);
  });
});

describe('localDateOf', () => {
  it('reads an instant in the shop’s own terms, not the server’s', () => {
    const instant = new Date('2026-08-20T22:15:00.000Z');

    expect(localDateOf(instant, DAR)).toBe('2026-08-21');
    expect(localDateOf(instant, 'UTC')).toBe('2026-08-20');
  });

  it('pads a single-digit month and day', () => {
    expect(localDateOf(new Date('2026-01-05T09:00:00.000Z'), DAR)).toBe('2026-01-05');
  });

  it('round-trips: every instant inside a window reads as that window’s date', () => {
    const window = dayWindow('2026-08-21', DAR);

    for (const offset of [0, 1, 3_600_000, 12 * 3_600_000, 24 * 3_600_000 - 1]) {
      expect(localDateOf(new Date(window.startUtc.getTime() + offset), DAR)).toBe('2026-08-21');
    }
  });
});

describe('todayIn', () => {
  it('takes the server clock as an argument, so nothing here reads a device’s', () => {
    // 23:30 UTC on the 20th is already half past two in the morning of the
    // 21st in Dar es Salaam.
    expect(todayIn(DAR, new Date('2026-08-20T23:30:00.000Z'))).toBe('2026-08-21');
  });
});

describe('previousDay and nextDay', () => {
  it('step one day on the local calendar', () => {
    expect(previousDay('2026-08-21')).toBe('2026-08-20');
    expect(nextDay('2026-08-21')).toBe('2026-08-22');
  });

  it('step across a month boundary', () => {
    expect(previousDay('2026-09-01')).toBe('2026-08-31');
    expect(nextDay('2026-08-31')).toBe('2026-09-01');
  });

  it('step across a leap day', () => {
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
    expect(nextDay('2028-02-29')).toBe('2028-03-01');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
  });

  it('step across a year boundary', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
  });
});
