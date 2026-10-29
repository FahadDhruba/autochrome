import { useState } from 'react';
import { applyRepairs, repairedSteps } from '@/src/workflows/editing';
import { saveWorkflow, workflowStore } from '@/src/workflows/store';
import type { StepLog } from '@/src/workflows/types';
import type { RunView } from './useWorkflowRun';

const STATUS_LABEL: Record<StepLog['status'], string> = {
  ok: 'ok',
  repaired: 'repaired by AI',
  failed: 'failed',
};

const RUN_LABEL: Record<RunView['status'], string> = {
  running: 'Running…',
  ok: 'Finished',
  repaired: 'Finished, with steps repaired by the AI',
  failed: 'Failed',
  stopped: 'Stopped',
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function StepRow({ step }: { step: StepLog }) {
  return (
    <li className={`wf-step wf-step-${step.status}`} data-testid="run-step">
      <div className="wf-step-head">
        <span className="wf-step-index">{step.index + 1}</span>
        <span className="wf-step-note">{step.note}</span>
        <span className={`wf-status wf-status-${step.status}`}>{STATUS_LABEL[step.status]}</span>
        <span className="muted">{seconds(step.durationMs)}</span>
      </div>
      {step.status === 'repaired' && step.repair && (
        <p className="wf-detail">
          {step.error} The AI: {step.repair.summary}
        </p>
      )}
      {step.status === 'failed' && step.error && <p className="wf-detail wf-error">{step.error}</p>}
      {step.screenshot && (
        <img
          className="tool-image"
          alt="Screenshot of the page when the step failed"
          src={`data:${step.screenshot.mimeType};base64,${step.screenshot.data}`}
        />
      )}
    </li>
  );
}

type Props = { run: RunView; onStop: () => void; onBack: () => void };

export default function RunLog({ run, onStop, onBack }: Props) {
  const [update, setUpdate] = useState<'idle' | 'saving' | 'done' | string>('idle');
  const repaired = run.steps.filter(
    (step) => step.status === 'repaired' && step.repair?.steps.length,
  );

  const updateWorkflow = async () => {
    setUpdate('saving');
    const workflow = await workflowStore.load(run.workflowId);
    if (!workflow) return setUpdate('This workflow no longer exists.');
    if (repairedSteps(workflow, run.steps).length === 0) {
      return setUpdate('The workflow was changed after this run, so it was not updated.');
    }
    await saveWorkflow(applyRepairs(workflow, run.steps));
    setUpdate('done');
  };

  return (
    <section className="wf-panel" aria-label="Run log">
      <h2>{run.workflowName}</h2>
      <p className="wf-run-status" data-testid="run-status">
        {RUN_LABEL[run.status]}
      </p>
      <ol className="wf-steps">
        {run.steps.map((step) => (
          <StepRow key={step.index} step={step} />
        ))}
        {run.current && (
          <li className="wf-step" data-testid="run-current">
            <div className="wf-step-head">
              <span className="wf-step-index">{run.current.index + 1}</span>
              <span className="wf-step-note">{run.current.note}</span>
              <span className="muted">running…</span>
            </div>
          </li>
        )}
      </ol>
      {run.error && (
        <div className="error-banner" role="alert">
          {run.error}
        </div>
      )}
      {repaired.length > 0 && run.workflowId && (
        <div className="wf-update">
          {update === 'done' ? (
            <p className="muted">Workflow updated.</p>
          ) : (
            <button disabled={update === 'saving'} onClick={() => void updateWorkflow()}>
              {repaired.length === 1
                ? 'Update workflow with repaired step'
                : `Update workflow with ${repaired.length} repaired steps`}
            </button>
          )}
          {update !== 'idle' && update !== 'saving' && update !== 'done' && (
            <p className="muted">{update}</p>
          )}
        </div>
      )}
      <div className="button-row">
        {run.status === 'running' ? (
          <button className="danger" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button className="secondary" onClick={onBack}>
            Back to workflows
          </button>
        )}
      </div>
    </section>
  );
}
