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

/** Provider and model for the next message of this chat. */
export default function ModelPicker({ target, state, disabled, onChange }: Props) {
  const models = useModelOptions(target.providerId, state.all[target.providerId]);
  // The chat's own provider stays listed even if it is no longer set up.
  const options: ProviderId[] = state.ready.includes(target.providerId)
    ? state.ready
    : [target.providerId, ...state.ready];

  return (
    <div className="picker">
      <select
        aria-label="Provider"
        value={target.providerId}
        disabled={disabled}
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
        disabled={disabled}
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
    </div>
  );
}
