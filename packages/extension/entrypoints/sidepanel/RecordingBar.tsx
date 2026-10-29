import { useState } from 'react';
import type { RecordingState } from '@/src/workflows/recording';
import { controlRecording } from './useRecording';

type Props = { recording: RecordingState; onFinished: (workflowId: string) => void };

/** Shown above every view while a recording is in progress, with the steps so far. */
export default function RecordingBar({ recording, onFinished }: Props) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const steps = recording.steps;

  const finish = async (action: 'stop' | 'cancel') => {
    setBusy(true);
    const result = await controlRecording(action);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (action === 'stop' && result.workflowId) onFinished(result.workflowId);
  };

  return (
    <section className="recording-bar" aria-label="Recording" data-testid="recording-bar">
      <div className="recording-head">
        <span className="recording-dot" aria-hidden="true" />
        <strong>Recording</strong>
        <span className="muted" data-testid="recording-count">
          {steps.length} {steps.length === 1 ? 'step' : 'steps'}
        </span>
        <div className="recording-actions">
          <button disabled={busy} onClick={() => void finish('stop')}>
            Stop
          </button>
          <button className="secondary" disabled={busy} onClick={() => void finish('cancel')}>
            Cancel
          </button>
        </div>
      </div>
      <ol className="recording-steps">
        {steps.slice(-4).map((step, index) => (
          <li key={steps.length - Math.min(4, steps.length) + index}>{step.note ?? step.tool}</li>
        ))}
      </ol>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
