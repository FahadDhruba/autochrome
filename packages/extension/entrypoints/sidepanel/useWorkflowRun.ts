import { useEffect, useState } from 'react';
import type { RunKind, RunResult, RunStatus, RunTrigger, StepLog } from '@/src/workflows/types';
import type { WorkflowEvent } from '@/src/workflows/session';
import type { useChat } from './useChat';

/** A run as the log shows it, whether it is still going or loaded from storage. */
export type RunView = {
  workflowId: string;
  workflowName: string;
  status: RunStatus | 'running';
  totalSteps: number;
  steps: StepLog[];
  /** The step being run right now. */
  current?: { index: number; note: string };
  error?: string;
  /** Set for a run loaded from the log. */
  trigger?: RunTrigger;
  kind?: RunKind;
  scheduleName?: string;
  startedAt?: number;
  /** Prompt runs: the AI's answer, and the chat the run was saved as. */
  summary?: string;
  chatId?: string;
};

export const viewOf = (run: RunResult): RunView => ({
  workflowId: run.workflowId,
  workflowName: run.workflowName,
  status: run.status,
  totalSteps: run.totalSteps,
  steps: run.steps,
  error: run.error,
  trigger: run.trigger ?? 'manual',
  kind: run.kind ?? 'workflow',
  scheduleName: run.scheduleName,
  startedAt: run.startedAt,
  summary: run.summary,
  chatId: run.chatId,
});

function applyRunEvent(view: RunView | undefined, event: WorkflowEvent): RunView | undefined {
  switch (event.type) {
    case 'run_started':
      return {
        workflowId: view?.workflowId ?? '',
        workflowName: event.workflowName,
        status: 'running',
        totalSteps: event.totalSteps,
        steps: [],
      };
    case 'step_started':
      return view && { ...view, current: { index: event.index, note: event.note } };
    case 'step_finished':
      return view && { ...view, current: undefined, steps: [...view.steps, event.step] };
    case 'run_finished':
      return viewOf(event.run);
    case 'run_error':
      return {
        workflowId: view?.workflowId ?? '',
        workflowName: view?.workflowName ?? 'Workflow',
        status: 'failed',
        totalSteps: view?.totalSteps ?? 0,
        steps: view?.steps ?? [],
        error: event.message,
      };
  }
}

/** The workflow run started from the panel, live. Runs on the chat's connection to the worker. */
export function useWorkflowRun(chat: ReturnType<typeof useChat>) {
  const [run, setRun] = useState<RunView>();
  const { setWorkflowListener, runWorkflow } = chat;

  useEffect(() => {
    setWorkflowListener((event) => setRun((current) => applyRunEvent(current, event)));
    return () => setWorkflowListener(undefined);
  }, [setWorkflowListener]);

  const start = (workflowId: string, workflowName: string, variables: Record<string, string>) => {
    setRun({ workflowId, workflowName, status: 'running', totalSteps: 0, steps: [] });
    runWorkflow(workflowId, variables);
  };

  return { run, setRun, start, running: run?.status === 'running' };
}
