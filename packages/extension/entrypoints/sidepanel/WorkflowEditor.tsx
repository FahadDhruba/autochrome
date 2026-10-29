import { useState } from 'react';
import type { Step, Workflow } from '@autochrome/shared';
import {
  editableFields,
  isValidVariableName,
  makeVariable,
  moveStep,
  removeStep,
  removeVariable,
  type ValueField,
} from '@/src/workflows/editing';
import { saveWorkflow } from '@/src/workflows/store';
import { isSecretName } from './RunDialog';

type Pick = { index: number; field: ValueField; start: number; end: number; name: string };

const selectionWatchers = new WeakMap<HTMLInputElement, () => void>();

/** React's onSelect misses selections made from code, so listen for the native event. */
function watchSelection(
  input: HTMLInputElement | null,
  onSelect: (input: HTMLInputElement) => void,
) {
  if (!input) return;
  const previous = selectionWatchers.get(input);
  if (previous) input.removeEventListener('select', previous);
  const listener = () => onSelect(input);
  selectionWatchers.set(input, listener);
  input.addEventListener('select', listener);
}

type Props = {
  workflow: Workflow;
  onRun: (workflow: Workflow) => void;
  onExport: (workflow: Workflow) => void;
  onClose: () => void;
};

function targetLabel(step: Step): string {
  const { target } = step;
  if (!target) return '';
  const label = target.name || target.text || '';
  return [target.role, label && `“${label}”`].filter(Boolean).join(' ');
}

function StepInputJson({
  step,
  onChange,
}: {
  step: Step;
  onChange: (input: Step['input']) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(step.input, null, 2));
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      setInvalid(false);
      onChange(parsed as Step['input']);
    } catch {
      setInvalid(true);
    }
  };

  return (
    <details className="wf-json">
      <summary>Input</summary>
      <textarea
        value={text}
        rows={Math.min(8, text.split('\n').length)}
        spellCheck={false}
        aria-label="Step input (JSON)"
        aria-invalid={invalid}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
      {invalid && <p className="wf-error">This is not a JSON object.</p>}
    </details>
  );
}

export default function WorkflowEditor({ workflow, onRun, onExport, onClose }: Props) {
  const [draft, setDraft] = useState(workflow);
  const [saved, setSaved] = useState(true);
  const [pick, setPick] = useState<Pick>();

  const change = (next: Workflow) => {
    setDraft(next);
    setSaved(false);
  };
  const changeStep = (index: number, patch: Partial<Step>) =>
    change({ ...draft, steps: draft.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  const save = async () => {
    await saveWorkflow(draft);
    setSaved(true);
  };

  /** What is selected in a step's value, kept for "Make variable" after the field loses focus. */
  const rememberSelection = (index: number, field: ValueField, input: HTMLInputElement) => {
    const { selectionStart: start, selectionEnd: end } = input;
    if (start === null || end === null || start === end) return;
    setPick((current) => ({
      index,
      field,
      start,
      end,
      name: current?.index === index ? current.name : '',
    }));
  };

  const createVariable = () => {
    if (!pick) return;
    const next = makeVariable(draft, pick.index, pick.field, pick, pick.name);
    if (!next) return;
    change(next);
    setPick(undefined);
  };

  return (
    <section className="wf-panel" aria-label="Workflow editor">
      <h2>Edit workflow</h2>
      <label className="wf-field">
        Name
        <input value={draft.name} onChange={(e) => change({ ...draft, name: e.target.value })} />
      </label>
      <label className="wf-field">
        Description
        <input
          value={draft.description ?? ''}
          onChange={(e) => change({ ...draft, description: e.target.value || undefined })}
        />
      </label>

      <h3>Variables</h3>
      {draft.variables.length === 0 && (
        <p className="muted">
          None. Select text in a step below and choose “Make variable” to ask for it on each run.
        </p>
      )}
      <ul className="wf-variables">
        {draft.variables.map((variable, index) => (
          <li key={variable.name}>
            <code>{`{{${variable.name}}}`}</code>
            <input
              aria-label={`Label for ${variable.name}`}
              value={variable.label}
              onChange={(e) =>
                change({
                  ...draft,
                  variables: draft.variables.map((v, i) =>
                    i === index ? { ...v, label: e.target.value } : v,
                  ),
                })
              }
            />
            {!isSecretName(variable.name) && (
              <input
                aria-label={`Default for ${variable.name}`}
                placeholder="Default"
                value={variable.default ?? ''}
                onChange={(e) =>
                  change({
                    ...draft,
                    variables: draft.variables.map((v, i) =>
                      i === index ? { ...v, default: e.target.value || undefined } : v,
                    ),
                  })
                }
              />
            )}
            <button
              className="link"
              aria-label={`Remove variable ${variable.name}`}
              onClick={() => change(removeVariable(draft, variable.name))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <h3>Steps ({draft.steps.length})</h3>
      <ol className="wf-steps">
        {draft.steps.map((step, index) => (
          <li key={index} className="wf-step" data-testid="editor-step">
            <div className="wf-step-head">
              <span className="wf-step-index">{index + 1}</span>
              <input
                className="wf-step-note-input"
                aria-label={`Note for step ${index + 1}`}
                value={step.note ?? ''}
                onChange={(e) => changeStep(index, { note: e.target.value })}
              />
              <button
                className="link"
                aria-label={`Move step ${index + 1} up`}
                disabled={index === 0}
                onClick={() => change({ ...draft, steps: moveStep(draft.steps, index, -1) })}
              >
                ↑
              </button>
              <button
                className="link"
                aria-label={`Move step ${index + 1} down`}
                disabled={index === draft.steps.length - 1}
                onClick={() => change({ ...draft, steps: moveStep(draft.steps, index, 1) })}
              >
                ↓
              </button>
              <button
                className="link"
                aria-label={`Delete step ${index + 1}`}
                onClick={() => change({ ...draft, steps: removeStep(draft.steps, index) })}
              >
                ✕
              </button>
            </div>
            <p className="muted wf-step-meta">
              <code>{step.tool}</code> {targetLabel(step)}
            </p>
            {editableFields(step).map((field) => (
              <label key={field} className="wf-field wf-value">
                {field}
                <input
                  value={String(step.input[field])}
                  aria-label={`${field} of step ${index + 1}`}
                  onChange={(e) =>
                    changeStep(index, { input: { ...step.input, [field]: e.target.value } })
                  }
                  ref={(input) =>
                    watchSelection(input, (el) => rememberSelection(index, field, el))
                  }
                />
              </label>
            ))}
            {pick?.index === index && (
              <div className="wf-pick">
                <input
                  aria-label="Variable name"
                  placeholder="Variable name"
                  value={pick.name}
                  onChange={(e) => setPick({ ...pick, name: e.target.value.trim() })}
                />
                <button disabled={!isValidVariableName(pick.name)} onClick={createVariable}>
                  Make variable
                </button>
              </div>
            )}
            <StepInputJson
              key={JSON.stringify(step.input)}
              step={step}
              onChange={(input) => changeStep(index, { input })}
            />
          </li>
        ))}
      </ol>

      <div className="button-row">
        <button disabled={saved || !draft.name.trim()} onClick={() => void save()}>
          {saved ? 'Saved' : 'Save'}
        </button>
        <button className="secondary" onClick={() => onRun(draft)} disabled={!saved}>
          Run
        </button>
        <button className="secondary" onClick={() => onExport(draft)}>
          Export
        </button>
        <button className="secondary" onClick={onClose}>
          Back to workflows
        </button>
      </div>
    </section>
  );
}
