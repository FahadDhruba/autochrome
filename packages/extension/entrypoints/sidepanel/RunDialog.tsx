import { useState } from 'react';
import IconButton from '@/src/ui/IconButton';
import { Play, X } from 'lucide-react';
import type { Workflow } from '@autochrome/shared';

type Props = {
  workflow: Workflow;
  onRun: (variables: Record<string, string>) => void;
  onCancel: () => void;
};

export const isSecretName = (name: string): boolean => /pass|secret|token|pin/i.test(name);

/** Asks for the value of each variable before a run. */
export default function RunDialog({ workflow, onRun, onCancel }: Props) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(workflow.variables.map((v) => [v.name, v.default ?? ''])),
  );

  return (
    <form
      className="wf-panel"
      aria-label={`Run ${workflow.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        onRun(values);
      }}
    >
      <h2>Run “{workflow.name}”</h2>
      {workflow.variables.map((variable) => (
        <label key={variable.name} className="wf-field">
          {variable.label}
          <input
            type={isSecretName(variable.name) ? 'password' : 'text'}
            value={values[variable.name] ?? ''}
            autoComplete="off"
            onChange={(event) => setValues({ ...values, [variable.name]: event.target.value })}
          />
        </label>
      ))}
      <div className="button-row">
        <button type="submit" className="with-icon">
          <Play size={14} aria-hidden="true" />
          Run
        </button>
        <IconButton label="Cancel" icon={X} onClick={onCancel} />
      </div>
    </form>
  );
}
