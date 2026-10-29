import { browser } from 'wxt/browser';
import { isOverdue } from './next-run';
import type { Schedule } from './types';

export const ALARM_PREFIX = 'schedule:';

export const alarmName = (scheduleId: string): string => `${ALARM_PREFIX}${scheduleId}`;

export const scheduleIdOfAlarm = (name: string): string | undefined =>
  name.startsWith(ALARM_PREFIX) ? name.slice(ALARM_PREFIX.length) : undefined;

/** The part of `chrome.alarms` used here. */
export type AlarmsApi = Pick<typeof browser.alarms, 'create' | 'clear' | 'getAll'>;

/** One alarm per enabled schedule, at its next run time; none for a disabled one. */
export async function syncAlarm(
  schedule: Pick<Schedule, 'id' | 'enabled' | 'nextRunAt'>,
  api: AlarmsApi = browser.alarms,
): Promise<void> {
  if (schedule.enabled) await api.create(alarmName(schedule.id), { when: schedule.nextRunAt });
  else await api.clear(alarmName(schedule.id));
}

export async function clearAlarm(id: string, api: AlarmsApi = browser.alarms): Promise<void> {
  await api.clear(alarmName(id));
}

/** Makes the alarms match the schedules exactly: creates the missing, drops the stale ones. */
export async function syncAllAlarms(
  schedules: Schedule[],
  api: AlarmsApi = browser.alarms,
): Promise<void> {
  const wanted = new Set(schedules.filter((s) => s.enabled).map((s) => alarmName(s.id)));
  for (const alarm of await api.getAll()) {
    if (alarm.name.startsWith(ALARM_PREFIX) && !wanted.has(alarm.name)) await api.clear(alarm.name);
  }
  for (const schedule of schedules) await syncAlarm(schedule, api);
}

/** The enabled schedules whose run time passed while the browser was closed. */
export const overdueSchedules = (schedules: Schedule[], now: number): Schedule[] =>
  schedules.filter((schedule) => schedule.enabled && isOverdue(schedule.nextRunAt, now));
