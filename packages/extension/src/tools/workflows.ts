import { resolveVariables, runWorkflow, summarizeRun } from '../workflows/replay';
import { findWorkflow, workflowStore } from '../workflows/store';
import { text, type ToolHandlers } from './types';

export const workflowHandlers: Pick<ToolHandlers, 'workflows_list' | 'workflow_run'> = {
  async workflows_list() {
    const lines: string[] = [];
    for (const { id } of await workflowStore.list()) {
      const workflow = await workflowStore.load(id);
      if (!workflow) continue;
      const variables = workflow.variables
        .map((v) => (v.default === undefined ? v.name : `${v.name} (default "${v.default}")`))
        .join(', ');
      lines.push(
        `${workflow.id} · ${workflow.name} · ${workflow.steps.length} steps` +
          (variables ? ` · variables: ${variables}` : ''),
      );
    }
    return text(lines.join('\n') || 'No workflows saved.');
  },

  async workflow_run({ id, name, variables }, { source, signal }) {
    const workflow = await findWorkflow({ id, name });
    const { missing } = resolveVariables(workflow, variables ?? {});
    if (missing.length > 0) {
      throw new Error(`Missing value for ${missing.map((n) => `{{${n}}}`).join(', ')}.`);
    }
    const run = await runWorkflow(workflow, variables ?? {}, { source, signal });
    const summary = summarizeRun(run);
    // A failed run is an error for the caller, with the log as the message.
    if (run.status === 'failed' || run.status === 'stopped') throw new Error(summary);
    return text(summary);
  },
};
