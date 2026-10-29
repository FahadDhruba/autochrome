import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runStore } from '../workflows/store';
import { triggerForSource, triggerOf, type RunResult } from '../workflows/types';
import { patchSchedule, scheduleStore } from './store';
import type { Schedule } from './types';

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: async (keys: string | string[]) =>
          Object.fromEntries([keys].flat().flatMap((k) => (k in data ? [[k, data[k]]] : []))),
        set: async (items: Record<string, unknown>) => void Object.assign(data, items),
        remove: async (keys: string | string[]) =>
          void [keys].flat().forEach((k) => delete data[k]),
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const schedule = (id: string): Schedule => ({
  id,
  name: `Schedule ${id}`,
  enabled: true,
  run: { kind: 'workflow', workflowId: 'w', variables: {} },
  when: { every: 'day', time: '09:00' },
  sites: [],
  nextRunAt: 1000,
});

describe('scheduleStore', () => {
  it('keeps schedules under schedule:<id> with an index holding them whole', async () => {
    await scheduleStore.save(schedule('a'));
    await scheduleStore.save(schedule('b'));
    expect(Object.keys(data).sort()).toEqual(['schedule:a', 'schedule:b', 'schedule:index']);
    expect(await scheduleStore.list()).toHaveLength(2);
    await scheduleStore.remove('a');
    expect((await scheduleStore.list()).map((s) => s.id)).toEqual(['b']);
  });

  it('patches a schedule and ignores one that is gone', async () => {
    await scheduleStore.save(schedule('a'));
    const patched = await patchSchedule('a', { nextRunAt: 5000, enabled: false });
    expect(patched).toMatchObject({ nextRunAt: 5000, enabled: false, name: 'Schedule a' });
    expect(await scheduleStore.load('a')).toEqual(patched);
    expect((await scheduleStore.list())[0]).toEqual(patched);
    expect(await patchSchedule('nope', { enabled: false })).toBeUndefined();
    expect(data['schedule:nope']).toBeUndefined();
  });
});

describe('run triggers', () => {
  it('read as manual on runs saved before schedules existed', () => {
    expect(triggerOf({})).toBe('manual');
    expect(triggerOf({ trigger: 'schedule' })).toBe('schedule');
  });

  it('follow the tool source', () => {
    expect(triggerForSource('workflow')).toBe('manual');
    expect(triggerForSource('agent')).toBe('manual');
    expect(triggerForSource('bridge')).toBe('bridge');
    expect(triggerForSource('scheduled')).toBe('schedule');
  });

  it('are kept in the run index, with the schedule and chat', async () => {
    const run: RunResult = {
      id: 'r1',
      workflowId: '',
      workflowName: 'News',
      source: 'scheduled',
      trigger: 'schedule',
      kind: 'prompt',
      scheduleId: 's1',
      scheduleName: 'News',
      chatId: 'c1',
      startedAt: 1,
      finishedAt: 2,
      status: 'ok',
      totalSteps: 0,
      variableNames: [],
      steps: [],
      summary: 'long text',
    };
    await runStore.save(run);
    expect((await runStore.list())[0]).toEqual({
      id: 'r1',
      workflowId: '',
      workflowName: 'News',
      source: 'scheduled',
      trigger: 'schedule',
      kind: 'prompt',
      scheduleId: 's1',
      scheduleName: 'News',
      chatId: 'c1',
      startedAt: 1,
      finishedAt: 2,
      status: 'ok',
      error: undefined,
    });
  });
});
