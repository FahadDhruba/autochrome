import type { Workflow } from '@autochrome/shared';
import { closeGroupTabs, scheduleGroupTitle, setScheduledGroupTitle } from '../tabGroup';
import { runWorkflow, type RunOptions } from '../workflows/replay';
import { runStore, workflowStore, summaryOfRun } from '../workflows/store';
import type { RunResult } from '../workflows/types';
import { nextRunAfter } from './next-run';
import { showRunNotification } from './notify';
import { runPromptSchedule, type PromptSchedule } from './prompt';
import { patchSchedule, scheduleStore } from './store';
import type { Schedule } from './types';
import { syncAlarm } from './alarms';

/** A scheduled run is stopped after this long. */
export const RUN_LIMIT_MS = 10 * 60_000;
export const TIMEOUT_TEXT = 'Timed out after 10 minutes.';

/** Alarms fire at or just after their time; this much earlier still counts as due. */
const DUE_TOLERANCE_MS = 1_000;
const KEEP_ALIVE_MS = 20_000;

/**
 * - `alarm`: the schedule's time came (or was missed while the browser was closed). Skipped when
 *   disabled or not due yet; moves the next run time forward before running, so a crash cannot
 *   cause a second catch-up.
 * - `test-alarm`: the same without the due check, for tests.
 * - `now`: "Run now" from the side panel. Runs even when disabled and leaves the next run alone.
 */
export type RunMode = 'alarm' | 'test-alarm' | 'now';

export type RunOutcome = { ran: true; run: RunResult } | { ran: false; reason: string };

export type RunnerDeps = {
  loadSchedule: (id: string) => Promise<Schedule | undefined>;
  patchSchedule: (
    id: string,
    patch: Partial<Omit<Schedule, 'id'>>,
  ) => Promise<Schedule | undefined>;
  loadWorkflow: (id: string) => Promise<Workflow | undefined>;
  runWorkflow: (
    workflow: Workflow,
    variables: Record<string, string>,
    options: RunOptions,
  ) => Promise<RunResult>;
  runPrompt: (schedule: PromptSchedule, signal: AbortSignal) => Promise<RunResult>;
  saveRun: (run: RunResult) => Promise<void>;
  notify: (run: RunResult, scheduleName: string) => Promise<void>;
  syncAlarm: (schedule: Schedule) => Promise<void>;
  /** Tab group for the run, and what to do with its tabs. */
  setGroupTitle: (title: string | undefined) => void;
  closeGroup: (title: string) => Promise<void>;
  /** Keeps the service worker alive while a run is going; returns the function that stops it. */
  keepAlive: () => () => void;
  now: () => number;
  /** Calls `fn` after `ms`; returns the function that cancels it. */
  setTimer: (fn: () => void, ms: number) => () => void;
  limitMs: number;
};

const defaultDeps: RunnerDeps = {
  loadSchedule: (id) => scheduleStore.load(id),
  patchSchedule,
  loadWorkflow: (id) => workflowStore.load(id),
  runWorkflow,
  runPrompt: (schedule, signal) => runPromptSchedule(schedule, signal),
  saveRun: (run) => runStore.save(run),
  notify: showRunNotification,
  syncAlarm,
  setGroupTitle: setScheduledGroupTitle,
  closeGroup: closeGroupTabs,
  keepAlive: () => {
    const timer = setInterval(() => void browser.runtime.getPlatformInfo(), KEEP_ALIVE_MS);
    return () => clearInterval(timer);
  },
  now: () => Date.now(),
  setTimer: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
  limitMs: RUN_LIMIT_MS,
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The run log entry for a run that could not even start. */
function failedRun(schedule: Schedule, error: string, at: number): RunResult {
  return {
    id: crypto.randomUUID(),
    workflowId: schedule.run.kind === 'workflow' ? schedule.run.workflowId : '',
    workflowName: schedule.name,
    source: 'scheduled',
    trigger: 'schedule',
    kind: schedule.run.kind,
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    startedAt: at,
    finishedAt: at,
    status: 'failed',
    error,
    totalSteps: 0,
    variableNames: [],
    steps: [],
  };
}

/**
 * Runs schedules one at a time. A schedule that is already running or waiting is not queued a
 * second time, so a slow run or a long-closed browser never piles up work.
 */
export function createRunner(overrides: Partial<RunnerDeps> = {}) {
  const deps: RunnerDeps = { ...defaultDeps, ...overrides };
  const pending = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();

  async function execute(id: string, mode: RunMode): Promise<RunOutcome> {
    let schedule = await deps.loadSchedule(id);
    if (!schedule) return { ran: false, reason: 'This schedule no longer exists.' };
    const startedAt = deps.now();
    if (mode !== 'now') {
      if (!schedule.enabled) return { ran: false, reason: 'The schedule is disabled.' };
      if (mode === 'alarm' && schedule.nextRunAt > startedAt + DUE_TOLERANCE_MS) {
        return { ran: false, reason: 'The schedule is not due yet.' };
      }
      const moved = await deps.patchSchedule(id, {
        nextRunAt: nextRunAfter(schedule.when, startedAt),
      });
      if (!moved) return { ran: false, reason: 'This schedule no longer exists.' };
      schedule = moved;
      await deps.syncAlarm(schedule).catch(() => {});
    }

    const title = scheduleGroupTitle(schedule.name);
    const controller = new AbortController();
    let timedOut = false;
    const cancelTimer = deps.setTimer(() => {
      timedOut = true;
      controller.abort();
    }, deps.limitMs);
    const stopKeepAlive = deps.keepAlive();
    deps.setGroupTitle(title);

    let run: RunResult;
    try {
      run = await perform(schedule, controller.signal);
    } catch (error) {
      run = failedRun(schedule, errorText(error), deps.now());
      await deps.saveRun(run).catch(() => {});
    } finally {
      cancelTimer();
      stopKeepAlive();
      deps.setGroupTitle(undefined);
    }

    if (timedOut && run.status !== 'ok' && run.status !== 'repaired') {
      run = { ...run, status: 'failed', error: TIMEOUT_TEXT };
      await deps.saveRun(run).catch(() => {});
    }
    // Tabs of a run that worked are closed; those of a failed run stay for inspection.
    if (run.status === 'ok' || run.status === 'repaired') {
      await deps.closeGroup(title).catch(() => {});
    }
    await deps.patchSchedule(id, { lastRun: summaryOfRun(run) }).catch(() => {});
    await deps.notify(run, schedule.name).catch(() => {});
    return { ran: true, run };
  }

  async function perform(schedule: Schedule, signal: AbortSignal): Promise<RunResult> {
    const { run } = schedule;
    if (run.kind === 'prompt') return deps.runPrompt(schedule as PromptSchedule, signal);

    const workflow = await deps.loadWorkflow(run.workflowId);
    if (!workflow) {
      const missing = failedRun(schedule, 'The workflow no longer exists.', deps.now());
      await deps.saveRun(missing);
      return missing;
    }
    return deps.runWorkflow(workflow, run.variables, {
      source: 'scheduled',
      signal,
      schedule: { id: schedule.id, name: schedule.name },
    });
  }

  return {
    run(id: string, mode: RunMode): Promise<RunOutcome> {
      if (pending.has(id)) {
        return Promise.resolve({
          ran: false,
          reason: 'This schedule is already running or queued.',
        });
      }
      pending.add(id);
      const result = queue.then(() => execute(id, mode)).finally(() => pending.delete(id));
      queue = result.catch(() => undefined);
      return result.catch((error: unknown) => ({ ran: false, reason: errorText(error) }));
    },
    isPending: (id: string) => pending.has(id),
  };
}

export type Runner = ReturnType<typeof createRunner>;
