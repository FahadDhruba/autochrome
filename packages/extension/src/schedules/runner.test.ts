import type { Workflow } from '@autochrome/shared';
import { describe, expect, it, vi } from 'vitest';
import type { RunResult } from '../workflows/types';
import { createRunner, RUN_LIMIT_MS, TIMEOUT_TEXT, type RunnerDeps } from './runner';
import type { Schedule } from './types';

const NOW = Date.parse('2026-02-10T12:00:00Z');

const schedule = (patch: Partial<Schedule> = {}): Schedule => ({
  id: 's1',
  name: 'Morning check',
  enabled: true,
  run: { kind: 'workflow', workflowId: 'w1', variables: { user: 'ada' } },
  when: { every: 'minutes', minutes: 30 },
  sites: [],
  nextRunAt: NOW - 1000,
  ...patch,
});

const workflow: Workflow = {
  id: 'w1',
  name: 'Check',
  variables: [],
  steps: [{ tool: 'go_back', input: {} }],
  createdFrom: 'recording',
  updatedAt: 1,
};

const run = (patch: Partial<RunResult> = {}): RunResult => ({
  id: 'r1',
  workflowId: 'w1',
  workflowName: 'Check',
  source: 'scheduled',
  trigger: 'schedule',
  startedAt: NOW,
  finishedAt: NOW + 100,
  status: 'ok',
  totalSteps: 1,
  variableNames: [],
  steps: [],
  ...patch,
});

/** An in-memory store of one schedule plus fakes for everything that touches the browser. */
function setup(initial: Schedule | null = schedule(), overrides: Partial<RunnerDeps> = {}) {
  let stored = initial ?? undefined;
  const log: string[] = [];
  const saved: RunResult[] = [];
  const notifications: RunResult[] = [];
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const deps: Partial<RunnerDeps> = {
    loadSchedule: async () => stored,
    patchSchedule: async (_id, patch) => (stored = stored && { ...stored, ...patch }),
    loadWorkflow: async () => workflow,
    runWorkflow: vi.fn(async () => run()),
    runPrompt: vi.fn(async () => run({ kind: 'prompt', workflowId: '' })),
    saveRun: async (r) => void saved.push(r),
    notify: async (r) => void notifications.push(r),
    syncAlarm: async (s) => void log.push(`alarm ${s.nextRunAt}`),
    setGroupTitle: (title) => void log.push(`group ${title}`),
    closeGroup: async (title) => void log.push(`close ${title}`),
    keepAlive: () => {
      log.push('keepalive on');
      return () => log.push('keepalive off');
    },
    now: () => NOW,
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return () => (timer.cancelled = true);
    },
    ...overrides,
  };
  return {
    runner: createRunner(deps),
    deps,
    log,
    saved,
    notifications,
    timers,
    stored: () => stored,
  };
}

describe('runner: workflow schedules', () => {
  it('runs the workflow with the scheduled source, moves the next run on, and records the result', async () => {
    const t = setup();
    const outcome = await t.runner.run('s1', 'alarm');

    expect(outcome).toMatchObject({ ran: true, run: { status: 'ok' } });
    expect(t.deps.runWorkflow).toHaveBeenCalledWith(
      workflow,
      { user: 'ada' },
      expect.objectContaining({
        source: 'scheduled',
        schedule: { id: 's1', name: 'Morning check' },
      }),
    );
    // Next run: 30 minutes from the start, not from the missed time.
    expect(t.stored()?.nextRunAt).toBe(NOW + 30 * 60_000);
    expect(t.log).toContain(`alarm ${NOW + 30 * 60_000}`);
    expect(t.stored()?.lastRun).toMatchObject({ id: 'r1', status: 'ok' });
    expect(t.notifications).toHaveLength(1);
  });

  it('works in a tab group named after the schedule and closes its tabs on success', async () => {
    const t = setup();
    await t.runner.run('s1', 'alarm');
    expect(t.log.filter((line) => /group|close|keepalive/.test(line))).toEqual([
      'keepalive on',
      'group autochrome · Morning check',
      'keepalive off',
      'group undefined',
      'close autochrome · Morning check',
    ]);
  });

  it('leaves the tabs open when the run fails', async () => {
    const t = setup(schedule(), {
      runWorkflow: vi.fn(async () => run({ status: 'failed', error: 'Could not find button' })),
    });
    await t.runner.run('s1', 'alarm');
    expect(t.log.some((line) => line.startsWith('close'))).toBe(false);
    expect(t.stored()?.lastRun?.status).toBe('failed');
    expect(t.notifications[0]?.status).toBe('failed');
  });

  it('closes the tabs of a run the AI repaired', async () => {
    const t = setup(schedule(), { runWorkflow: vi.fn(async () => run({ status: 'repaired' })) });
    await t.runner.run('s1', 'alarm');
    expect(t.log).toContain('close autochrome · Morning check');
  });

  it('fails the run, and saves it, when the workflow was deleted', async () => {
    const t = setup(schedule(), { loadWorkflow: async () => undefined });
    const outcome = await t.runner.run('s1', 'alarm');
    expect(outcome).toMatchObject({
      ran: true,
      run: { status: 'failed', error: 'The workflow no longer exists.' },
    });
    expect(t.saved).toHaveLength(1);
    expect(t.log.some((line) => line.startsWith('close'))).toBe(false);
  });

  it('turns a crash in the runner into a failed run', async () => {
    const t = setup(schedule(), {
      runWorkflow: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const outcome = await t.runner.run('s1', 'alarm');
    expect(outcome).toMatchObject({ ran: true, run: { status: 'failed', error: 'boom' } });
    expect(t.saved[0]?.status).toBe('failed');
    expect(t.notifications).toHaveLength(1);
  });
});

describe('runner: prompt schedules', () => {
  it('runs the prompt with the agent and records the result', async () => {
    const prompt = schedule({
      run: { kind: 'prompt', prompt: 'Check the news', providerId: 'openai', model: 'gpt-x' },
    });
    const t = setup(prompt);
    const outcome = await t.runner.run('s1', 'alarm');
    expect(outcome).toMatchObject({ ran: true, run: { kind: 'prompt' } });
    expect(t.deps.runPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', run: prompt.run }),
      expect.any(AbortSignal),
    );
    expect(t.deps.runWorkflow).not.toHaveBeenCalled();
  });
});

describe('runner: which runs happen', () => {
  it('skips a disabled schedule on its alarm, but "Run now" runs it and keeps the next time', async () => {
    const t = setup(schedule({ enabled: false }));
    expect(await t.runner.run('s1', 'alarm')).toEqual({
      ran: false,
      reason: 'The schedule is disabled.',
    });
    expect(t.deps.runWorkflow).not.toHaveBeenCalled();

    await t.runner.run('s1', 'now');
    expect(t.deps.runWorkflow).toHaveBeenCalledTimes(1);
    expect(t.stored()?.nextRunAt).toBe(NOW - 1000);
  });

  it('skips an alarm that is not due, unless it is the test alarm', async () => {
    const t = setup(schedule({ nextRunAt: NOW + 60_000 }));
    expect(await t.runner.run('s1', 'alarm')).toMatchObject({ ran: false });
    expect(await t.runner.run('s1', 'test-alarm')).toMatchObject({ ran: true });
  });

  it('does nothing for a schedule that was deleted', async () => {
    const t = setup(null);
    expect(await t.runner.run('s1', 'alarm')).toMatchObject({ ran: false });
  });
});

describe('runner: queueing', () => {
  it('runs one schedule at a time, in the order they came', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const stored: Record<string, Schedule> = {
      a: schedule({ id: 'a', name: 'A' }),
      b: schedule({ id: 'b', name: 'B' }),
    };
    const t = setup(null, {
      loadSchedule: async (id) => stored[id],
      patchSchedule: async (id, patch) => (stored[id] = { ...stored[id]!, ...patch }),
      runWorkflow: vi.fn(async (_wf, _vars, options) => {
        order.push(`start ${options.schedule?.id}`);
        if (options.schedule?.id === 'a') await gate;
        order.push(`end ${options.schedule?.id}`);
        return run();
      }),
    });
    const first = t.runner.run('a', 'alarm');
    const second = t.runner.run('b', 'alarm');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual(['start a']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('never queues a schedule that is already running or waiting', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const t = setup(schedule(), {
      runWorkflow: vi.fn(async () => {
        await gate;
        return run();
      }),
    });
    const first = t.runner.run('s1', 'alarm');
    expect(t.runner.isPending('s1')).toBe(true);
    // The alarm fires again while it runs, and a catch-up asks as well.
    expect(await t.runner.run('s1', 'alarm')).toMatchObject({
      ran: false,
      reason: expect.stringContaining('already'),
    });
    expect(await t.runner.run('s1', 'now')).toMatchObject({ ran: false });
    release();
    await first;
    expect(t.deps.runWorkflow).toHaveBeenCalledTimes(1);
    expect(t.runner.isPending('s1')).toBe(false);
    // Free again afterwards.
    const again = await t.runner.run('s1', 'test-alarm');
    expect(again.ran).toBe(true);
  });

  it('keeps going after a run that threw', async () => {
    const t = setup(schedule(), {
      runWorkflow: vi.fn().mockRejectedValueOnce(new Error('first')).mockResolvedValueOnce(run()),
    });
    expect(await t.runner.run('s1', 'test-alarm')).toMatchObject({ run: { status: 'failed' } });
    expect(await t.runner.run('s1', 'test-alarm')).toMatchObject({ run: { status: 'ok' } });
  });
});

describe('runner: time limit', () => {
  it('stops a run after 10 minutes and records it as failed', async () => {
    let signal!: AbortSignal;
    const t = setup(schedule(), {
      runWorkflow: vi.fn(async (_wf, _vars, options) => {
        signal = options.signal!;
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
        return run({ status: 'stopped', error: 'Stopped by the user.' });
      }),
    });
    const pending = t.runner.run('s1', 'alarm');
    await vi.waitFor(() => expect(t.timers).toHaveLength(1));
    expect(t.timers[0]!.ms).toBe(RUN_LIMIT_MS);
    expect(RUN_LIMIT_MS).toBe(10 * 60_000);
    expect(signal.aborted).toBe(false);

    t.timers[0]!.fn();
    const outcome = await pending;
    expect(signal.aborted).toBe(true);
    expect(outcome).toMatchObject({ ran: true, run: { status: 'failed', error: TIMEOUT_TEXT } });
    expect(t.saved.at(-1)).toMatchObject({ status: 'failed', error: TIMEOUT_TEXT });
    expect(t.stored()?.lastRun).toMatchObject({ status: 'failed', error: TIMEOUT_TEXT });
    expect(t.log.some((line) => line.startsWith('close'))).toBe(false);
  });

  it('cancels the timer when the run ends in time', async () => {
    const t = setup();
    await t.runner.run('s1', 'alarm');
    expect(t.timers[0]!.cancelled).toBe(true);
  });
});
