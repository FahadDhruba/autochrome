import { useEffect, useId, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { providers } from '@/src/providers';
import type { ChatTarget } from '@/src/history';
import type { ProviderId } from '@/src/providers/types';
import type { ProviderState } from './useProviderSettings';
import { useModelOptions } from './useModelOptions';

type Props = {
  target: ChatTarget;
  state: ProviderState;
  disabled: boolean;
  onChange: (target: ChatTarget) => void;
};

/** Provider and model for the next message of this chat: a chip that opens a small editor. */
export default function ModelChip({ target, state, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const popId = useId();
  const models = useModelOptions(target.providerId, state.all[target.providerId]);
  // The chat's own provider stays listed even if it is no longer set up.
  const options: ProviderId[] = state.ready.includes(target.providerId)
    ? state.ready
    : [target.providerId, ...state.ready];

  // A running task locks the chip, so a popover left open closes with it.
  if (disabled && open) setOpen(false);
  const visible = open;

  useEffect(() => {
    if (!visible) return;
    select.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      chip.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [visible]);

  const label = `${providers[target.providerId].label} · ${target.model || 'Choose a model'}`;

  return (
    <div className="model-chip-wrap" ref={root}>
      <button
        ref={chip}
        type="button"
        className="model-chip"
        data-testid="model-chip"
        title="Provider and model"
        aria-haspopup="true"
        aria-expanded={visible}
        aria-controls={visible ? popId : undefined}
        disabled={disabled}
        onClick={() => setOpen(!visible)}
      >
        <span className="model-chip-text">{label}</span>
        <ChevronUp className="model-chip-caret" size={12} aria-hidden="true" />
      </button>
      {visible && (
        <div className="model-pop" id={popId} role="group">
          <select
            ref={select}
            aria-label="Provider"
            value={target.providerId}
            onChange={(event) => {
              const providerId = event.target.value as ProviderId;
              onChange({ providerId, model: state.all[providerId].model });
            }}
          >
            {options.map((id) => (
              <option key={id} value={id}>
                {providers[id].label}
              </option>
            ))}
          </select>
          <input
            aria-label="Model"
            list="chat-models"
            value={target.model}
            placeholder="Model"
            spellCheck={false}
            onChange={(event) => onChange({ ...target, model: event.target.value })}
          />
          <datalist id="chat-models">
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </datalist>
          {providers[target.providerId].note && (
            <p className="muted">{providers[target.providerId].note}</p>
          )}
        </div>
      )}
    </div>
  );
}
