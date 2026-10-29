import type { Step, ToolName } from '@autochrome/shared';
import type { ToolSource } from '../safety/types';

/** `repaired` means the step failed and the AI completed it instead. */
export type StepStatus = 'ok' | 'repaired' | 'failed';

export type StepLog = {
  /** Position of the step in the workflow. */
  index: number;
  tool: ToolName;
  note: string;
  status: StepStatus;
  durationMs: number;
  /** Why the step failed (or, for a repaired step, why the recorded way did not work). */
  error?: string;
  /** Screenshot of the page when the step failed. */
  screenshot?: { data: string; mimeType: string };
  /** What the AI did in place of the step; "Update workflow" swaps it in. */
  repair?: { steps: Step[]; summary: string };
};

/** A run stops at the first failed step; `stopped` means the user stopped it. */
export type RunStatus = 'ok' | 'repaired' | 'failed' | 'stopped';

export type RunResult = {
  id: string;
  workflowId: string;
  workflowName: string;
  source: ToolSource;
  startedAt: number;
  finishedAt: number;
  status: RunStatus;
  /** Why the run failed or stopped before or between steps. */
  error?: string;
  totalSteps: number;
  /** Names only: the values may be passwords. */
  variableNames: string[];
  steps: StepLog[];
};

export type RunSummary = Pick<
  RunResult,
  'id' | 'workflowId' | 'workflowName' | 'source' | 'startedAt' | 'finishedAt' | 'status' | 'error'
>;

/** Progress of a run, for the live log. */
export type RunEvent =
  | { type: 'run_started'; runId: string; workflowName: string; totalSteps: number }
  | { type: 'step_started'; index: number; note: string }
  | { type: 'step_finished'; step: StepLog }
  | { type: 'run_finished'; run: RunResult };
