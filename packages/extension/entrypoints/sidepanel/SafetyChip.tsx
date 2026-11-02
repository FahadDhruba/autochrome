import { useCallback, useId, useRef, useState } from 'react';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { saveMode, type SafetyMode } from '@/src/safety/settings';
import { useDismiss } from '@/src/ui/useDismiss';
import { MODES } from './SafetySettings';

const SHORT: Record<SafetyMode, string> = { ask: 'Ask', 'per-site': 'Per-site', auto: 'Auto' };
const ICON = { ask: ShieldQuestion, 'per-site': ShieldCheck, auto: ShieldAlert };

type Props = { mode: SafetyMode; disabled: boolean };

/** The safety mode next to the model chip, so it is visible and changeable where tasks start. */
export default function SafetyChip({ mode, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmingAuto, setConfirmingAuto] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setConfirmingAuto(false);
  }, []);
  useDismiss(open, close, root, trigger);
  if (disabled && open) close();
  const Icon = ICON[mode];

  const choose = (next: SafetyMode) => {
    if (next === 'auto' && mode !== 'auto') return setConfirmingAuto(true);
    void saveMode(next);
    close();
  };

  return (
    <div className="model-chip-wrap" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={`model-chip safety-chip${mode === 'auto' ? ' safety-chip-auto' : ''}`}
        aria-label={`Safety: ${SHORT[mode]}`}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        title="How much the AI may do without asking"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon size={13} aria-hidden="true" />
        {SHORT[mode]}
      </button>
      {open && (
        <div className="model-pop" id={popId} role="dialog" aria-label="Safety mode">
          {confirmingAuto ? (
            <div className="warning">
              <p>
                The AI can act on any site, including ones where you are signed in, without asking.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    void saveMode('auto');
                    close();
                  }}
                >
                  Turn on Auto
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirmingAuto(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="radio-group" role="radiogroup" aria-label="Safety mode">
              {MODES.map(({ id, label, description }) => (
                <label key={id} className="radio-option">
                  <input
                    type="radio"
                    name="chip-safety-mode"
                    checked={mode === id}
                    onChange={() => choose(id)}
                  />
                  <span>
                    {label}
                    <span className="muted option-description">{description}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
