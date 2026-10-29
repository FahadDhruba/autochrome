import { MIN_INTERVAL_MINUTES, WEEKDAY_NAMES, type ScheduleWhen } from './types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The browser's own time zone. */
export const localZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

type Wall = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** The wall clock in `zone` at a moment, as a UTC timestamp (so `getUTC*` reads the wall clock). */
function wallAsUtc(zone: string, at: number): number {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(zone).formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
}

/** Offset of `zone` from UTC at a moment, in ms (positive east of Greenwich). */
const offsetAt = (zone: string, at: number): number =>
  wallAsUtc(zone, Math.floor(at / 1000) * 1000) - Math.floor(at / 1000) * 1000;

/**
 * The moment a wall-clock time happens in `zone`. A time that happens twice (clocks going back)
 * is the first one; a time that does not exist (clocks going forward) is the moment the clock
 * would have shown it had the jump not happened, so a 02:30 job runs at 03:30.
 */
export function zonedTime(zone: string, wall: Wall): number {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const offsets = new Set([offsetAt(zone, asUtc - DAY), offsetAt(zone, asUtc + DAY)]);
  const valid = [...offsets]
    .map((offset) => ({ offset, at: asUtc - offset }))
    .filter(({ offset, at }) => offsetAt(zone, at) === offset)
    .map(({ at }) => at);
  if (valid.length > 0) return Math.min(...valid);
  // In the gap: use the offset from before the jump.
  return asUtc - offsetAt(zone, asUtc - DAY);
}

export function parseTime(time: string): { hour: number; minute: number } | undefined {
  const match = TIME_PATTERN.exec(time);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : undefined;
}

/** Why a schedule's timing is not valid, or undefined. */
export function checkWhen(when: ScheduleWhen): string | undefined {
  if (when.every === 'minutes') {
    return Number.isInteger(when.minutes) && when.minutes >= MIN_INTERVAL_MINUTES
      ? undefined
      : `Run at most every ${MIN_INTERVAL_MINUTES} minutes (a whole number).`;
  }
  if (!parseTime(when.time)) return 'Pick a time of day.';
  if (when.every === 'day') {
    const days = when.weekdays;
    if (days && (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))) {
      return 'Pick at least one weekday.';
    }
    return undefined;
  }
  return Number.isInteger(when.day) && when.day >= 0 && when.day <= 6
    ? undefined
    : 'Pick a day of the week.';
}

/**
 * The first run time after `after` (epoch ms). Day and week schedules follow the wall clock of
 * `zone`, so they stay at the same local time across daylight saving changes.
 */
export function nextRunAfter(when: ScheduleWhen, after: number, zone = localZone()): number {
  if (when.every === 'minutes') return after + Math.max(when.minutes, 1) * MINUTE;

  const time = parseTime(when.time);
  if (!time) throw new Error(`Invalid time "${when.time}".`);
  const days =
    when.every === 'week' ? [when.day] : when.weekdays?.length ? when.weekdays : undefined;

  const today = new Date(wallAsUtc(zone, after));
  // Calendar arithmetic on the wall-clock date; the weekday of that date does not depend on zone.
  for (let offset = 0; offset <= 8; offset++) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    date.setUTCDate(date.getUTCDate() + offset);
    if (days && !days.includes(date.getUTCDay())) continue;
    const at = zonedTime(zone, {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      ...time,
    });
    if (at > after) return at;
  }
  throw new Error('No run time found.');
}

/** True when the run time has passed, which happens when the browser was closed at that time. */
export const isOverdue = (nextRunAt: number, now: number): boolean => nextRunAt <= now;

/** A short description for the list, such as "Every day at 09:00" or "Mon, Wed at 18:30". */
export function describeWhen(when: ScheduleWhen): string {
  const names = WEEKDAY_NAMES;
  if (when.every === 'minutes') {
    if (when.minutes % 60 === 0) {
      const hours = when.minutes / 60;
      return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
    }
    return `Every ${when.minutes} minutes`;
  }
  if (when.every === 'week') return `Every ${names[when.day]} at ${when.time}`;
  const days = when.weekdays?.length ? [...when.weekdays].sort((a, b) => a - b) : undefined;
  if (!days || days.length === 7) return `Every day at ${when.time}`;
  return `${days.map((d) => names[d]).join(', ')} at ${when.time}`;
}
