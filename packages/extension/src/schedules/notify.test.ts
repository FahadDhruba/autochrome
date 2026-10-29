import { describe, expect, it, vi } from 'vitest';
import type { RunResult } from '../workflows/types';
import { notificationFor, openRun, runIdOfNotification, type OpenRunDeps } from './notify';
import { runHash, runIdFromHash } from './route';

const run = (patch: Partial<RunResult> = {}): RunResult => ({
  id: 'r1',
  workflowId: 'w1',
  workflowName: 'Check',
  scheduleName: 'Morning check',
  source: 'scheduled',
  trigger: 'schedule',
  startedAt: 1000,
  finishedAt: 5200,
  status: 'ok',
  totalSteps: 2,
  variableNames: [],
  steps: [
    { index: 0, tool: 'navigate', note: 'Go', status: 'ok', durationMs: 1 },
    { index: 1, tool: 'click', note: 'Click', status: 'ok', durationMs: 1 },
  ],
  ...patch,
});

describe('notificationFor', () => {
  it('says a workflow run finished', () => {
    expect(notificationFor(run())).toEqual({
      title: '✓ Morning check finished',
      message: '2 steps in 4.2s.',
    });
  });

  it('mentions a repaired step', () => {
    expect(notificationFor(run({ status: 'repaired' })).message).toContain('repaired a step');
  });

  it('names the step a workflow run failed at', () => {
    const failed = run({
      status: 'failed',
      steps: [
        { index: 0, tool: 'navigate', note: 'Go', status: 'ok', durationMs: 1 },
        { index: 1, tool: 'click', note: 'Click', status: 'ok', durationMs: 1 },
        {
          index: 2,
          tool: 'click',
          note: 'Click',
          status: 'failed',
          durationMs: 1,
          error: 'No such button.',
        },
      ],
    });
    expect(notificationFor(failed)).toEqual({
      title: '✗ Morning check failed at step 3',
      message: 'No such button.',
    });
  });

  it('uses the run error when no step failed, and the answer for a prompt run', () => {
    expect(
      notificationFor(run({ status: 'failed', steps: [], error: 'Timed out after 10 minutes.' })),
    ).toEqual({ title: '✗ Morning check failed', message: 'Timed out after 10 minutes.' });
    expect(
      notificationFor(run({ kind: 'prompt', steps: [], summary: 'Three new posts.' })),
    ).toEqual({ title: '✓ Morning check finished', message: 'Three new posts.' });
    expect(
      notificationFor(run({ kind: 'prompt', status: 'failed', error: 'No API key.' })).title,
    ).toBe('✗ Morning check failed');
  });

  it('shortens a long answer', () => {
    const { message } = notificationFor(run({ kind: 'prompt', summary: 'x'.repeat(500) }));
    expect(message.length).toBeLessThanOrEqual(200);
    expect(message.endsWith('…')).toBe(true);
  });
});

describe('notification ids', () => {
  it('carry the run id', () => {
    expect(runIdOfNotification('run:abc')).toBe('abc');
    expect(runIdOfNotification('other')).toBeUndefined();
  });
});

describe('openRun', () => {
  const deps = (overrides: Partial<OpenRunDeps> = {}) => {
    const calls: string[] = [];
    const value: OpenRunDeps = {
      focusedWindowId: async () => 7,
      setRoute: async (id) => void calls.push(`route ${id}`),
      openSidePanel: async (windowId) => void calls.push(`panel ${windowId}`),
      openTab: async (url) => void calls.push(`tab ${url}`),
      pageUrl: 'chrome-extension://x/sidepanel.html',
      ...overrides,
    };
    return { value, calls };
  };

  it('opens the side panel on the run', async () => {
    const { value, calls } = deps();
    expect(await openRun('r1', value)).toBe('panel');
    expect(calls).toEqual(['route r1', 'panel 7']);
  });

  it('falls back to a tab with the #run= route when the panel cannot open', async () => {
    const { value, calls } = deps({
      openSidePanel: vi.fn(async () => {
        throw new Error('sidePanel.open() may only be called in response to a user gesture.');
      }),
    });
    expect(await openRun('r1', value)).toBe('tab');
    expect(calls).toEqual([
      'route r1',
      'route undefined',
      'tab chrome-extension://x/sidepanel.html#run=r1',
    ]);
  });

  it('falls back to a tab when there is no window', async () => {
    const { value } = deps({ focusedWindowId: async () => undefined });
    expect(await openRun('r1', value)).toBe('tab');
  });
});

describe('run route', () => {
  it('round-trips a run id through the URL hash', () => {
    expect(runHash('r 1')).toBe('#run=r%201');
    expect(runIdFromHash(runHash('r 1'))).toBe('r 1');
    expect(runIdFromHash('')).toBeUndefined();
    expect(runIdFromHash('#run=')).toBeUndefined();
    expect(runIdFromHash('#other=1')).toBeUndefined();
  });
});
