import { describe, expect, it } from 'vitest';
import type { ScheduleWhen } from './types';
import { checkWhen, describeWhen, isOverdue, nextRunAfter, zonedTime } from './next-run';

const NY = 'America/New_York';
const iso = (ms: number) => new Date(ms).toISOString();
const at = (value: string) => Date.parse(value);

describe('nextRunAfter: every N minutes', () => {
  it('adds the interval', () => {
    expect(nextRunAfter({ every: 'minutes', minutes: 15 }, at('2026-03-01T10:00:00Z'), NY)).toBe(
      at('2026-03-01T10:15:00Z'),
    );
  });
});

describe('nextRunAfter: daily', () => {
  const daily = { every: 'day', time: '09:00' } as const;

  it('runs later today when the time is still ahead', () => {
    // 07:00 in New York (EST)
    expect(iso(nextRunAfter(daily, at('2026-02-10T12:00:00Z'), NY))).toBe(
      '2026-02-10T14:00:00.000Z',
    );
  });

  it('runs tomorrow when the time has passed, and never at the same instant', () => {
    const nine = at('2026-02-10T14:00:00Z');
    expect(iso(nextRunAfter(daily, nine, NY))).toBe('2026-02-11T14:00:00.000Z');
    expect(iso(nextRunAfter(daily, nine - 1, NY))).toBe('2026-02-10T14:00:00.000Z');
  });

  it('only runs on the chosen weekdays', () => {
    const weekdays: ScheduleWhen = { every: 'day', time: '09:00', weekdays: [1, 3] }; // Mon, Wed
    // Tue 2026-02-10 -> Wed 2026-02-11
    expect(iso(nextRunAfter(weekdays, at('2026-02-10T15:00:00Z'), NY))).toBe(
      '2026-02-11T14:00:00.000Z',
    );
    // Wed after 09:00 -> Mon 2026-02-16
    expect(iso(nextRunAfter(weekdays, at('2026-02-11T15:00:00Z'), NY))).toBe(
      '2026-02-16T14:00:00.000Z',
    );
  });

  it('uses the weekday of the local date, not the UTC date', () => {
    // Tuesday 2026-02-10 23:30 in New York is already Wednesday in UTC (04:30Z on the 11th).
    const tuesdays: ScheduleWhen = { every: 'day', time: '08:00', weekdays: [2] };
    expect(iso(nextRunAfter(tuesdays, at('2026-02-11T04:30:00Z'), NY))).toBe(
      '2026-02-17T13:00:00.000Z',
    );
  });
});

describe('nextRunAfter: weekly', () => {
  it('finds the next matching day, a week ahead when today has passed', () => {
    const friday = { every: 'week', day: 5, time: '17:30' } as const;
    // Wed 2026-02-11 -> Fri 2026-02-13 17:30 EST
    expect(iso(nextRunAfter(friday, at('2026-02-11T12:00:00Z'), NY))).toBe(
      '2026-02-13T22:30:00.000Z',
    );
    // Right after it ran -> next Friday
    expect(iso(nextRunAfter(friday, at('2026-02-13T22:30:00Z'), NY))).toBe(
      '2026-02-20T22:30:00.000Z',
    );
  });
});

describe('daylight saving time', () => {
  const daily = (time: string) => ({ every: 'day', time }) as const;

  it('keeps the wall-clock time across the spring jump (New York, 2026-03-08)', () => {
    // Saturday 09:00 EST, then Sunday 09:00 EDT: only 23 hours apart.
    const first = nextRunAfter(daily('09:00'), at('2026-03-07T12:00:00Z'), NY);
    expect(iso(first)).toBe('2026-03-07T14:00:00.000Z');
    const second = nextRunAfter(daily('09:00'), first, NY);
    expect(iso(second)).toBe('2026-03-08T13:00:00.000Z');
    expect(second - first).toBe(23 * 3_600_000);
  });

  it('keeps the wall-clock time across the autumn jump (New York, 2026-11-01)', () => {
    const first = nextRunAfter(daily('09:00'), at('2026-10-31T12:00:00Z'), NY);
    expect(iso(first)).toBe('2026-10-31T13:00:00.000Z'); // 09:00 EDT
    const second = nextRunAfter(daily('09:00'), first, NY);
    expect(iso(second)).toBe('2026-11-01T14:00:00.000Z'); // 09:00 EST
    expect(second - first).toBe(25 * 3_600_000);
  });

  it('moves a time that does not exist to just after the jump', () => {
    // 02:30 on 2026-03-08 never happens in New York; the clock goes 02:00 -> 03:00.
    expect(iso(nextRunAfter(daily('02:30'), at('2026-03-08T00:00:00Z'), NY))).toBe(
      '2026-03-08T07:30:00.000Z', // 03:30 EDT
    );
  });

  it('runs a time that happens twice once, at its first occurrence', () => {
    // 01:30 on 2026-11-01 is 01:30 EDT (05:30Z) and again 01:30 EST (06:30Z).
    const first = nextRunAfter(daily('01:30'), at('2026-11-01T00:00:00Z'), NY);
    expect(iso(first)).toBe('2026-11-01T05:30:00.000Z');
    // Afterwards the next run is the following day, not the repeated hour.
    expect(iso(nextRunAfter(daily('01:30'), first, NY))).toBe('2026-11-02T06:30:00.000Z');
  });

  it('handles zones that change by half an hour and zones without DST', () => {
    // Lord Howe: +11:00 in summer, +10:30 in winter; the clocks go back on 2026-04-05.
    const lord = 'Australia/Lord_Howe';
    expect(zonedTime(lord, { year: 2026, month: 4, day: 6, hour: 9, minute: 0 })).toBe(
      at('2026-04-05T22:30:00Z'),
    );
    expect(iso(nextRunAfter(daily('09:00'), at('2026-07-01T00:00:00Z'), 'Asia/Kolkata'))).toBe(
      '2026-07-01T03:30:00.000Z',
    );
  });

  it('follows Europe/London across the spring jump', () => {
    const first = nextRunAfter(daily('09:00'), at('2026-03-28T12:00:00Z'), 'Europe/London');
    expect(iso(first)).toBe('2026-03-29T08:00:00.000Z'); // 09:00 BST (the jump is at 01:00 UTC)
    expect(iso(nextRunAfter(daily('09:00'), at('2026-03-28T08:00:00Z'), 'Europe/London'))).toBe(
      '2026-03-28T09:00:00.000Z', // still GMT
    );
  });

  it('keeps a weekly run at the same local time after the jump', () => {
    const monday = { every: 'week', day: 1, time: '09:00' } as const;
    expect(iso(nextRunAfter(monday, at('2026-03-05T12:00:00Z'), NY))).toBe(
      '2026-03-09T13:00:00.000Z', // EDT
    );
  });
});

describe('missed runs', () => {
  it('count as overdue, and rescheduling from now gives one future run, not a backlog', () => {
    const when = { every: 'minutes', minutes: 15 } as const;
    const nextRunAt = at('2026-02-10T10:00:00Z');
    const now = at('2026-02-10T18:07:00Z'); // the browser was closed for 8 hours
    expect(isOverdue(nextRunAt, now)).toBe(true);
    expect(isOverdue(now + 1, now)).toBe(false);
    const next = nextRunAfter(when, now, NY);
    expect(next).toBeGreaterThan(now);
    expect(next - now).toBe(15 * 60_000);
    // A daily schedule missed three mornings in a row also gets exactly the next morning.
    const daily = { every: 'day', time: '09:00' } as const;
    expect(iso(nextRunAfter(daily, at('2026-02-13T20:00:00Z'), NY))).toBe(
      '2026-02-14T14:00:00.000Z',
    );
  });
});

describe('checkWhen', () => {
  it('accepts valid timings', () => {
    expect(checkWhen({ every: 'minutes', minutes: 15 })).toBeUndefined();
    expect(checkWhen({ every: 'day', time: '23:59', weekdays: [0, 6] })).toBeUndefined();
    expect(checkWhen({ every: 'day', time: '00:00' })).toBeUndefined();
    expect(checkWhen({ every: 'week', day: 0, time: '07:05' })).toBeUndefined();
  });

  it('rejects intervals under 15 minutes, bad times and bad days', () => {
    expect(checkWhen({ every: 'minutes', minutes: 14 })).toMatch(/15 minutes/);
    expect(checkWhen({ every: 'minutes', minutes: 20.5 })).toBeDefined();
    expect(checkWhen({ every: 'day', time: '9:00' })).toBeDefined();
    expect(checkWhen({ every: 'day', time: '24:00' })).toBeDefined();
    expect(checkWhen({ every: 'day', time: '09:00', weekdays: [] })).toBeDefined();
    expect(checkWhen({ every: 'day', time: '09:00', weekdays: [7] })).toBeDefined();
    expect(checkWhen({ every: 'week', day: 7, time: '09:00' })).toBeDefined();
  });
});

describe('describeWhen', () => {
  it('reads naturally', () => {
    expect(describeWhen({ every: 'minutes', minutes: 30 })).toBe('Every 30 minutes');
    expect(describeWhen({ every: 'minutes', minutes: 60 })).toBe('Every hour');
    expect(describeWhen({ every: 'minutes', minutes: 120 })).toBe('Every 2 hours');
    expect(describeWhen({ every: 'day', time: '09:00' })).toBe('Every day at 09:00');
    expect(describeWhen({ every: 'day', time: '18:30', weekdays: [3, 1] })).toBe(
      'Mon, Wed at 18:30',
    );
    expect(describeWhen({ every: 'week', day: 5, time: '17:30' })).toBe('Every Fri at 17:30');
  });
});
