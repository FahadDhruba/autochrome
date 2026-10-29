import {
  substituteVariables,
  variableNames,
  type Step,
  type TargetHint,
  type ToolCall,
  type ToolResult,
  type Workflow,
} from '@autochrome/shared';
import { callPage } from '../content';
import { executeTool } from '../executor';
import type { ResolvedTarget } from '../page/resolve';
import type { ToolSource } from '../safety/types';
import { resolveTabId, setCurrentTab } from '../target';
import { noteFor } from './note';
import { repairStep, type RepairOutcome, type RepairRequest } from './repair';
import { runStore } from './store';
import {
  triggerForSource,
  type RunEvent,
  type RunResult,
  type RunStatus,
  type StepLog,
} from './types';

/** Tools that act on an element, which the step's target hint stands for. */
const TARGET_TOOLS = new Set<Step['tool']>(['click', 'type', 'form_input', 'scroll']);

const RESOLVE_TIMEOUT_MS = 3_000;
const RESOLVE_POLL_MS = 250;

export type RunOptions = {
  /** `workflow` for the side panel, `bridge` for a bridge/MCP caller, `scheduled` for a schedule. */
  source: ToolSource;
  signal?: AbortSignal;
  onEvent?: (event: RunEvent) => void;
  /** Run in this tab instead of opening a new one. */
  tabId?: number;
  /** The schedule behind the run, kept in the run log. */
  schedule?: { id: string; name: string };
};

export type ReplayDeps = {
  execute: (call: ToolCall, source: ToolSource, signal?: AbortSignal) => Promise<ToolResult>;
  /** Looks for the element on the page of the tab; undefined when it is not there (yet). */
  resolve: (tabId: number, target: TargetHint) => Promise<ResolvedTarget | undefined>;
  repair: (request: RepairRequest) => Promise<RepairOutcome>;
  currentTab: () => Promise<number>;
  openTab: (source: ToolSource, signal?: AbortSignal) => Promise<ToolResult>;
  setTab: (tabId: number) => void;
  screenshot: () => Promise<StepLog['screenshot']>;
  save: (run: RunResult) => Promise<void>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  resolveTimeoutMs: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** For the user's own run log, so it is taken like a click on the debug page: without a prompt. */
async function failureScreenshot(): Promise<StepLog['screenshot']> {
  try {
    const call: ToolCall = { id: crypto.randomUUID(), name: 'screenshot', input: {} };
    const image = (await executeTool(call, { source: 'debug' })).content.find(
      (item) => item.type === 'image',
    );
    return image?.type === 'image' ? { data: image.data, mimeType: image.mimeType } : undefined;
  } catch {
    return undefined;
  }
}

const defaultDeps: ReplayDeps = {
  execute: (call, source, signal) => executeTool(call, { source, signal }),
  resolve: (tabId, target) => callPage(tabId, 'resolve', { target }),
  repair: (request) => repairStep(request),
  currentTab: () => resolveTabId(),
  openTab: (source, signal) =>
    executeTool({ id: crypto.randomUUID(), name: 'tab_open', input: {} }, { source, signal }),
  setTab: setCurrentTab,
  screenshot: failureScreenshot,
  save: (run) => runStore.save(run),
  now: () => Date.now(),
  sleep,
  resolveTimeoutMs: RESOLVE_TIMEOUT_MS,
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const firstText = (result: ToolResult): string =>
  result.content.find((item) => item.type === 'text')?.text ?? 'The tool failed.';

/** The values to run with: the given ones over the defaults. Names of the missing ones. */
export function resolveVariables(
  workflow: Workflow,
  given: Record<string, string>,
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  const declared = new Set(workflow.variables.map((variable) => variable.name));
  for (const variable of workflow.variables) {
    const value = Object.hasOwn(given, variable.name) ? given[variable.name] : variable.default;
    if (value === undefined) missing.push(variable.name);
    else values[variable.name] = value;
  }
  // A placeholder typed into a step by hand without being declared still has to be filled in.
  for (const name of variableNames(workflow.steps.map((step) => step.input))) {
    if (declared.has(name)) continue;
    if (Object.hasOwn(given, name)) values[name] = given[name]!;
    else missing.push(name);
  }
  return { values, missing };
}

class RunStopped extends Error {}

type Context = {
  workflow: Workflow;
  values: Record<string, string>;
  options: RunOptions;
  deps: ReplayDeps;
};

async function findTarget(target: TargetHint, { options, deps }: Context): Promise<string> {
  const deadline = deps.now() + deps.resolveTimeoutMs;
  for (;;) {
    if (options.signal?.aborted) throw new RunStopped();
    try {
      const found = await deps.resolve(await deps.currentTab(), target);
      if (found) return found.ref;
    } catch {
      // The page is probably still loading; try again until the deadline.
    }
    if (deps.now() >= deadline) {
      const label = target.name || target.text || target.role || 'element';
      throw new Error(`Could not find ${target.role || 'element'} "${label}" on the page.`);
    }
    await deps.sleep(RESOLVE_POLL_MS);
  }
}

/** The tool call for a step: variables filled in and, for an element, a fresh ref. */
async function callFor(step: Step, context: Context): Promise<ToolCall> {
  const input: Record<string, unknown> = substituteVariables(step.input, context.values);
  if (step.target && TARGET_TOOLS.has(step.tool)) {
    input.ref = await findTarget(step.target, context);
    delete input.x;
    delete input.y;
  }
  return { id: crypto.randomUUID(), name: step.tool, input };
}

async function attempt(step: Step, context: Context): Promise<void> {
  const { options, deps } = context;
  const result = await deps.execute(await callFor(step, context), options.source, options.signal);
  if (!result.ok) throw new Error(firstText(result));
}

async function runStep(step: Step, index: number, context: Context): Promise<StepLog> {
  const { workflow, deps, options } = context;
  const started = deps.now();
  const log: Omit<StepLog, 'status' | 'durationMs'> = {
    index,
    tool: step.tool,
    note: step.note ?? noteFor(step.tool, step.input, step.target),
  };
  const finish = (rest: Partial<StepLog> & Pick<StepLog, 'status'>): StepLog => ({
    ...log,
    durationMs: deps.now() - started,
    ...rest,
  });

  try {
    await attempt(step, context);
    return finish({ status: 'ok' });
  } catch (error) {
    if (options.signal?.aborted) throw new RunStopped();
    const message = errorText(error);
    const outcome = await deps.repair({
      workflow,
      step,
      index,
      error: message,
      values: context.values,
      source: options.source,
      signal: options.signal,
    });
    if (options.signal?.aborted) throw new RunStopped();
    if (outcome.ok) {
      return finish({
        status: 'repaired',
        error: message,
        repair: { steps: outcome.steps, summary: outcome.summary },
      });
    }
    return finish({
      status: 'failed',
      error: `${message} ${outcome.reason}`,
      screenshot: await deps.screenshot(),
    });
  }
}

function overallStatus(steps: StepLog[], finished: boolean): RunStatus {
  if (steps.some((step) => step.status === 'failed') || !finished) return 'failed';
  return steps.some((step) => step.status === 'repaired') ? 'repaired' : 'ok';
}

// One run at a time: runs share the current tab, and a later one waits for the earlier.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Replays a workflow: every step goes through `executeTool`, so the safety gate applies as for any
 * other caller. A step whose element cannot be found, or that fails, is handed to the AI; the run
 * stops at the first step the AI cannot do either. The result is saved in the run log.
 */
export function runWorkflow(
  workflow: Workflow,
  given: Record<string, string>,
  options: RunOptions,
  overrides: Partial<ReplayDeps> = {},
): Promise<RunResult> {
  const run = queue.then(() => replay(workflow, given, options, { ...defaultDeps, ...overrides }));
  queue = run.catch(() => undefined);
  return run;
}

async function replay(
  workflow: Workflow,
  given: Record<string, string>,
  options: RunOptions,
  deps: ReplayDeps,
): Promise<RunResult> {
  const { values, missing } = resolveVariables(workflow, given);
  const result: RunResult = {
    id: crypto.randomUUID(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    source: options.source,
    trigger: triggerForSource(options.source),
    kind: 'workflow',
    ...(options.schedule && {
      scheduleId: options.schedule.id,
      scheduleName: options.schedule.name,
    }),
    startedAt: deps.now(),
    finishedAt: 0,
    status: 'ok',
    totalSteps: workflow.steps.length,
    variableNames: Object.keys(values),
    steps: [],
  };
  const emit = (event: RunEvent) => options.onEvent?.(event);
  const context: Context = { workflow, values, options, deps };

  emit({
    type: 'run_started',
    runId: result.id,
    workflowName: workflow.name,
    totalSteps: workflow.steps.length,
  });

  let finished = false;
  try {
    if (options.signal?.aborted) throw new RunStopped();
    if (missing.length > 0) {
      throw new Error(`Missing value for ${missing.map((name) => `{{${name}}}`).join(', ')}.`);
    }
    if (options.tabId !== undefined) deps.setTab(options.tabId);
    else if (workflow.steps[0]?.tool !== 'tab_open') {
      // Start in a tab of its own, so the user's tabs are left alone.
      const opened = await deps.openTab(options.source, options.signal);
      if (!opened.ok) throw new Error(firstText(opened));
    }

    for (const [index, step] of workflow.steps.entries()) {
      if (options.signal?.aborted) throw new RunStopped();
      emit({
        type: 'step_started',
        index,
        note: step.note ?? noteFor(step.tool, step.input, step.target),
      });
      const log = await runStep(step, index, context);
      result.steps.push(log);
      emit({ type: 'step_finished', step: log });
      if (log.status === 'failed') break;
    }
    finished = result.steps.every((step) => step.status !== 'failed');
  } catch (error) {
    if (error instanceof RunStopped || options.signal?.aborted) {
      result.error = 'Stopped by the user.';
      result.status = 'stopped';
    } else {
      result.error = errorText(error);
    }
  }

  if (result.status !== 'stopped') result.status = overallStatus(result.steps, finished);
  result.finishedAt = deps.now();
  await deps
    .save(result)
    .catch((error: unknown) => console.error('autochrome: run not saved', error));
  emit({ type: 'run_finished', run: result });
  return result;
}

/** A short text for a bridge caller: one line per step. */
export function summarizeRun(run: RunResult): string {
  const seconds = ((run.finishedAt - run.startedAt) / 1000).toFixed(1);
  const lines = [`Workflow "${run.workflowName}": ${run.status} (${seconds}s)`];
  for (const step of run.steps) {
    const detail = step.error && step.status !== 'ok' ? ` — ${step.error}` : '';
    lines.push(`${step.index + 1}. ${step.note}: ${step.status} (${step.durationMs} ms)${detail}`);
  }
  if (run.steps.length < run.totalSteps) {
    lines.push(`${run.totalSteps - run.steps.length} step(s) not run.`);
  }
  if (run.error) lines.push(run.error);
  return lines.join('\n');
}
