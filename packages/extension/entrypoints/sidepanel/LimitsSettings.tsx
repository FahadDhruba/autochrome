import { useState } from 'react';
import { saveLimits, type Limits } from '@/src/limits';
import { useLimits } from './useLimits';

/** How far one task may go, so a confused agent cannot run up a bill. */
export default function LimitsSettings() {
  const { limits } = useLimits();
  const [edited, setEdited] = useState<Limits>();
  const [justSaved, setJustSaved] = useState(false);
  const draft = edited ?? limits;
  if (!draft) return null;

  const change = (patch: Partial<Limits>) => {
    setEdited({ ...draft, ...patch });
    setJustSaved(false);
  };

  return (
    <section aria-label="Limit settings" id="settings-sec-limits">
      <h2>Limits</h2>
      <label>
        Steps per task
        <input
          type="number"
          min={1}
          max={200}
          value={draft.maxSteps}
          onChange={(e) => change({ maxSteps: Number(e.target.value) })}
        />
      </label>
      <label>
        Tokens per task (0 for no limit)
        <input
          type="number"
          min={0}
          step={10000}
          value={draft.maxTokens}
          onChange={(e) => change({ maxTokens: Number(e.target.value) })}
        />
      </label>
      <p className="muted">
        A task stops when it reaches either limit. Tokens count everything sent to and from the
        model.
      </p>
      <div className="button-row">
        <button
          type="button"
          onClick={() =>
            void saveLimits(draft).then(() => {
              setEdited(undefined);
              setJustSaved(true);
            })
          }
        >
          {justSaved ? 'Saved' : 'Save limits'}
        </button>
      </div>
    </section>
  );
}
