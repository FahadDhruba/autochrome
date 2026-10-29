import { runWorkflow } from './replay';
import { workflowStore } from './store';
import type { RunEvent } from './types';

/** Background to side panel, over the chat port, while a workflow runs. */
export type WorkflowEvent = RunEvent | { type: 'run_error'; message: string };

const RUN_EVENTS = new Set<string>([
  'run_started',
  'step_started',
  'step_finished',
  'run_finished',
  'run_error',
]);

export const isWorkflowEvent = (event: { type: string }): event is WorkflowEvent =>
  RUN_EVENTS.has(event.type);

/** Runs a saved workflow for the side panel: its steps are gated like the chat agent's. */
export async function runFromPanel(
  workflowId: string,
  variables: Record<string, string>,
  emit: (event: WorkflowEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const workflow = await workflowStore.load(workflowId);
  if (!workflow) return emit({ type: 'run_error', message: 'This workflow no longer exists.' });
  await runWorkflow(workflow, variables, { source: 'workflow', signal, onEvent: emit });
}
