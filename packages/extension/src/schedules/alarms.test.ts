import { describe, expect, it, vi } from 'vitest';
import {
  alarmName,
  clearAlarm,
  overdueSchedules,
  scheduleIdOfAlarm,
  syncAlarm,
  syncAllAlarms,
  type AlarmsApi,
} from './alarms';
import type { Schedule } from './types';

const schedule = (id: string, patch: Partial<Schedule> = {}): Schedule => ({
  id,
  name: id,
  enabled: true,
  run: { kind: 'workflow', workflowId: 'w', variables: {} },
  when: { every: 'minutes', minutes: 15 },
  sites: [],
  nextRunAt: 5000,
  ...patch,
});

function fakeApi(existing: string[] = []) {
  const alarms = new Map(existing.map((name) => [name, { name, scheduledTime: 1 }]));
  const api = {
    create: vi.fn(async (name: string, info: { when?: number }) => {
      alarms.set(name, { name, scheduledTime: info.when ?? 0 });
    }),
    clear: vi.fn(async (name: string) => alarms.delete(name)),
    getAll: vi.fn(async () => [...alarms.values()]),
  };
  return { api: api as unknown as AlarmsApi, alarms, spies: api };
}

describe('alarm names', () => {
  it('map a schedule id to one alarm and back', () => {
    expect(alarmName('abc')).toBe('schedule:abc');
    expect(scheduleIdOfAlarm('schedule:abc')).toBe('abc');
    expect(scheduleIdOfAlarm('something-else')).toBeUndefined();
  });
});

describe('syncAlarm', () => {
  it('creates one alarm at the next run time for an enabled schedule', async () => {
    const { api, alarms } = fakeApi();
    await syncAlarm(schedule('a', { nextRunAt: 1234 }), api);
    expect(alarms.get('schedule:a')?.scheduledTime).toBe(1234);
  });

  it('clears the alarm of a disabled schedule, and of a deleted one', async () => {
    const { api, alarms } = fakeApi(['schedule:a', 'schedule:b']);
    await syncAlarm(schedule('a', { enabled: false }), api);
    await clearAlarm('b', api);
    expect(alarms.size).toBe(0);
  });
});

describe('syncAllAlarms', () => {
  it('recreates missing alarms, keeps others untouched and drops stale ones', async () => {
    const { api, alarms } = fakeApi(['schedule:gone', 'schedule:off', 'not-ours']);
    await syncAllAlarms([schedule('a'), schedule('off', { enabled: false })], api);
    expect([...alarms.keys()].sort()).toEqual(['not-ours', 'schedule:a']);
  });
});

describe('overdueSchedules', () => {
  it('lists only enabled schedules whose time passed', () => {
    const list = [
      schedule('late', { nextRunAt: 100 }),
      schedule('later', { nextRunAt: 101 }),
      schedule('future', { nextRunAt: 500 }),
      schedule('off', { nextRunAt: 100, enabled: false }),
    ];
    expect(overdueSchedules(list, 200).map((s) => s.id)).toEqual(['late', 'later']);
    expect(overdueSchedules(list, 100).map((s) => s.id)).toEqual(['late']);
  });
});
