import { useEffect, useState } from 'react';
import IconButton from '@/src/ui/IconButton';
import { Save, X } from 'lucide-react';
import { providers } from '@/src/providers';
import { checkWhen, nextRunAfter, TIME_PATTERN } from '@/src/schedules/next-run';
import { scheduleStore } from '@/src/schedules/store';
import {
  MIN_INTERVAL_MINUTES,
  WEEKDAY_NAMES,
  type Schedule,
  type ScheduleWhen,
} from '@/src/schedules/types';
import { workflowStore, type WorkflowSummary } from '@/src/workflows/store';
import type { Workflow } from '@autochrome/shared';
import ModelPicker from './ModelPicker';
import { isSecretName } from './RunDialog';
import type { ProviderState } from './useProviderSettings';

type Props = {
  /** The schedule to edit; undefined for a new one. */
  schedule: Schedule | undefined;
  providers: ProviderState | undefined;
  onClose: () => void;
};

type Every = ScheduleWhen['every'];

const DEFAULT_TIME = '09:00';

function sitesFrom(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((site) => site.trim())
    .filter(Boolean);
}

/** Create or change a schedule: what to run, and when. */
export default function ScheduleEditor({ schedule, providers: providerState, onClose }: Props) {
  const [name, setName] = useState(schedule?.name ?? '');
  const [kind, setKind] = useState<'workflow' | 'prompt'>(schedule?.run.kind ?? 'workflow');
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>();
  const [workflowId, setWorkflowId] = useState(
    schedule?.run.kind === 'workflow' ? schedule.run.workflowId : '',
  );
  const [workflow, setWorkflow] = useState<Workflow>();
  const [variables, setVariables] = useState<Record<string, string>>(
    schedule?.run.kind === 'workflow' ? schedule.run.variables : {},
  );
  const [prompt, setPrompt] = useState(schedule?.run.kind === 'prompt' ? schedule.run.prompt : '');
  const [target, setTarget] = useState(() =>
    schedule?.run.kind === 'prompt'
      ? { providerId: schedule.run.providerId, model: schedule.run.model }
      : undefined,
  );

  const when = schedule?.when;
  const [every, setEvery] = useState<Every>(when?.every ?? 'day');
  const [minutes, setMinutes] = useState(when?.every === 'minutes' ? when.minutes : 60);
  const [time, setTime] = useState(when && when.every !== 'minutes' ? when.time : DEFAULT_TIME);
  const [weekdays, setWeekdays] = useState<number[]>(
    when?.every === 'day' ? (when.weekdays ?? []) : [],
  );
  const [day, setDay] = useState(when?.every === 'week' ? when.day : 1);
  const [sites, setSites] = useState((schedule?.sites ?? []).join(', '));
  const [error, setError] = useState<string>();

  useEffect(() => {
    void workflowStore.list().then(setWorkflows);
  }, []);

  useEffect(() => {
    if (!workflowId) return;
    let current = true;
    void workflowStore.load(workflowId).then((loaded) => {
      if (current) setWorkflow(loaded);
    });
    return () => {
      current = false;
    };
  }, [workflowId]);

  // A prompt schedule starts on the default provider.
  const promptTarget =
    target ??
    (providerState && {
      providerId: providerState.ready[0] ?? providerState.defaultProvider,
      model: providerState.all[providerState.ready[0] ?? providerState.defaultProvider].model,
    });

  const buildWhen = (): ScheduleWhen => {
    if (every === 'minutes') return { every, minutes };
    if (every === 'week') return { every, day, time };
    return weekdays.length > 0 ? { every, time, weekdays } : { every, time };
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the schedule a name.');
    const timing = buildWhen();
    const timingError = checkWhen(timing);
    if (timingError) return setError(timingError);

    let run: Schedule['run'];
    if (kind === 'workflow') {
      if (!workflowId) return setError('Pick a workflow.');
      const values = Object.fromEntries(
        (workflow?.variables ?? []).map((v) => [v.name, variables[v.name] ?? v.default ?? '']),
      );
      const missing = (workflow?.variables ?? []).filter(
        (v) => values[v.name] === '' && v.default === undefined,
      );
      if (missing.length > 0) {
        return setError(`Give a value for ${missing.map((v) => v.label).join(', ')}.`);
      }
      run = { kind, workflowId, variables: values };
    } else {
      if (!prompt.trim()) return setError('Write what the AI should do.');
      if (!promptTarget?.model.trim()) return setError('Pick a model.');
      run = { kind, prompt: prompt.trim(), ...promptTarget };
    }

    const next: Schedule = {
      id: schedule?.id ?? crypto.randomUUID(),
      name: trimmed,
      enabled: schedule?.enabled ?? true,
      run,
      when: timing,
      sites: sitesFrom(sites),
      // The editor changed the timing, so the next run is worked out again from now.
      nextRunAt: nextRunAfter(timing, Date.now()),
      lastRun: schedule?.lastRun,
    };
    await scheduleStore.save(next);
    onClose();
  };

  const toggleWeekday = (index: number) =>
    setWeekdays((current) =>
      current.includes(index) ? current.filter((d) => d !== index) : [...current, index],
    );

  return (
    <form
      className="wf-panel"
      aria-label="Schedule editor"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2>{schedule ? 'Edit schedule' : 'New schedule'}</h2>

      <label className="wf-field">
        Name
        <input value={name} placeholder="Morning check" onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="wf-field">
        What to run
        <select
          value={kind}
          aria-label="What to run"
          onChange={(e) => setKind(e.target.value as 'workflow' | 'prompt')}
        >
          <option value="workflow">A saved workflow</option>
          <option value="prompt">An AI prompt</option>
        </select>
      </label>

      {kind === 'workflow' ? (
        <>
          <label className="wf-field">
            Workflow
            <select
              value={workflowId}
              aria-label="Workflow"
              onChange={(e) => {
                setWorkflowId(e.target.value);
                setWorkflow(undefined);
                setVariables({});
              }}
            >
              <option value="">Choose…</option>
              {workflows?.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          {workflow?.variables.map((variable) => (
            <label key={variable.name} className="wf-field">
              {variable.label}
              <input
                type={isSecretName(variable.name) ? 'password' : 'text'}
                autoComplete="off"
                value={variables[variable.name] ?? variable.default ?? ''}
                onChange={(e) => setVariables({ ...variables, [variable.name]: e.target.value })}
              />
            </label>
          ))}
          {workflow?.variables.some((v) => isSecretName(v.name)) && (
            <p className="muted">Values are stored on this device, like your API keys.</p>
          )}
        </>
      ) : (
        <>
          <label className="wf-field">
            Prompt
            <textarea
              rows={4}
              value={prompt}
              placeholder="Open example.com and tell me the headline."
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          {providerState && promptTarget && (
            <ModelPicker
              target={promptTarget}
              state={providerState}
              disabled={false}
              onChange={setTarget}
            />
          )}
          {promptTarget && !providerState?.ready.includes(promptTarget.providerId) && (
            <p className="muted">
              {providers[promptTarget.providerId].label} is not set up yet. Add its API key in
              Settings before the schedule runs.
            </p>
          )}
        </>
      )}

      <label className="wf-field">
        When
        <select value={every} aria-label="When" onChange={(e) => setEvery(e.target.value as Every)}>
          <option value="minutes">Every N minutes</option>
          <option value="day">Every day</option>
          <option value="week">Every week</option>
        </select>
      </label>

      {every === 'minutes' && (
        <label className="wf-field">
          Minutes between runs (at least {MIN_INTERVAL_MINUTES})
          <input
            type="number"
            min={MIN_INTERVAL_MINUTES}
            step={1}
            value={minutes}
            aria-label="Minutes between runs"
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
      )}
      {every !== 'minutes' && (
        <label className="wf-field">
          Time (this computer’s time zone)
          <input
            type="time"
            value={time}
            aria-label="Time of day"
            pattern={TIME_PATTERN.source}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      )}
      {every === 'day' && (
        <fieldset className="sched-days">
          <legend>Days (none picked means every day)</legend>
          {WEEKDAY_NAMES.map((label, index) => (
            <label key={label}>
              <input
                type="checkbox"
                checked={weekdays.includes(index)}
                onChange={() => toggleWeekday(index)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      {every === 'week' && (
        <label className="wf-field">
          Day
          <select
            value={day}
            aria-label="Day of the week"
            onChange={(e) => setDay(Number(e.target.value))}
          >
            {WEEKDAY_NAMES.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="wf-field">
        Sites it works on (for reference)
        <input value={sites} placeholder="example.com" onChange={(e) => setSites(e.target.value)} />
      </label>
      <p className="muted">
        Scheduled runs act in Auto mode: they do not ask before purchases, sending or deleting, and
        the allowed-sites list does not apply. They cannot run JavaScript.
      </p>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="button-row">
        <button type="submit" className="with-icon">
          <Save size={14} aria-hidden="true" />
          Save
        </button>
        <IconButton label="Cancel" icon={X} onClick={onClose} />
      </div>
    </form>
  );
}
