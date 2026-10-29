import type { Step, TargetHint, WorkflowVariable } from '@autochrome/shared';
import { noteFor } from './note';

/** What the content script reports about one thing the user did on the recorded page. */
export type RecordEvent =
  | { kind: 'click'; target: TargetHint }
  /** A field was set. A secret field's value is never included; `value` is then empty. */
  | { kind: 'fill'; target: TargetHint; value: string | boolean; secret: boolean }
  /** Text typed into a rich-text (contenteditable) element. */
  | { kind: 'type'; target: TargetHint; text: string }
  | { kind: 'enter'; target: TargetHint };

export type RecordMessage = { type: 'autochrome:record-event'; event: RecordEvent };

export const isRecordMessage = (message: unknown): message is RecordMessage =>
  typeof message === 'object' &&
  message !== null &&
  (message as { type?: unknown }).type === 'autochrome:record-event';

export type RecordingState = {
  tabId: number;
  startedAt: number;
  steps: Step[];
  variables: WorkflowVariable[];
  /** When the last click, key press or field change happened; a navigation soon after it is its result. */
  lastActionAt: number;
  lastUrl: string;
};

/** A page load this soon after an action is what the action caused, so it is not a step of its own. */
export const NAVIGATION_CAUSED_WITHIN_MS = 5_000;

export const newRecording = (tabId: number, url: string, now: number): RecordingState => ({
  tabId,
  startedAt: now,
  steps: [navigateStep(url)],
  variables: [],
  lastActionAt: 0,
  lastUrl: url,
});

function navigateStep(url: string): Step {
  return { tool: 'navigate', input: { url }, note: noteFor('navigate', { url }) };
}

function step(tool: Step['tool'], input: Step['input'], target: TargetHint): Step {
  return { tool, input, target, note: noteFor(tool, input, target) };
}

function uniqueVariableName(taken: WorkflowVariable[]): string {
  const used = new Set(taken.map((variable) => variable.name));
  if (!used.has('password')) return 'password';
  let n = 2;
  while (used.has(`password_${n}`)) n++;
  return `password_${n}`;
}

const isSameField = (a: Step, b: Step): boolean =>
  a.tool === b.tool &&
  a.target?.name === b.target?.name &&
  a.target?.selector === b.target?.selector;

/** Adds the step for an event. Setting the same field twice in a row keeps only the last value. */
export function addEvent(state: RecordingState, event: RecordEvent, now: number): RecordingState {
  let variables = state.variables;
  let next: Step;

  switch (event.kind) {
    case 'click':
      next = step('click', {}, event.target);
      break;
    case 'enter':
      next = step('key', { keys: 'Enter' }, event.target);
      break;
    case 'type':
      next = step('type', { text: event.text }, event.target);
      break;
    case 'fill': {
      let value = event.value;
      if (event.secret) {
        // The typed value never got here; the run asks for it instead.
        const previous = state.steps.at(-1);
        const fill = step('form_input', {}, event.target);
        const name =
          previous && isSameField(previous, fill)
            ? String(previous.input.value).replace(/^\{\{|\}\}$/g, '')
            : uniqueVariableName(variables);
        value = `{{${name}}}`;
        if (!variables.some((variable) => variable.name === name)) {
          variables = [...variables, { name, label: event.target.name || 'Password' }];
        }
      }
      next = step('form_input', { value }, event.target);
      break;
    }
  }

  const last = state.steps.at(-1);
  const steps =
    last && next.tool === 'form_input' && isSameField(last, next)
      ? [...state.steps.slice(0, -1), next]
      : [...state.steps, next];
  return { ...state, steps, variables, lastActionAt: now };
}

/** A completed page load in the recorded tab: a navigation step unless an action caused it. */
export function addNavigation(state: RecordingState, url: string, now: number): RecordingState {
  if (url === state.lastUrl) return state;
  const caused = now - state.lastActionAt < NAVIGATION_CAUSED_WITHIN_MS;
  return {
    ...state,
    lastUrl: url,
    steps: caused ? state.steps : [...state.steps, navigateStep(url)],
  };
}

/** Side panel to background: start, finish or drop a recording. */
export type RecordControl =
  | { type: 'autochrome:record'; action: 'start'; tabId?: number }
  | { type: 'autochrome:record'; action: 'stop' | 'cancel' };

/** The answer to a `RecordControl`; `workflowId` is the saved workflow after `stop`. */
export type RecordControlResult = { ok: true; workflowId?: string } | { ok: false; error: string };

export const isRecordControl = (message: unknown): message is RecordControl => {
  if (typeof message !== 'object' || message === null) return false;
  const { type, action } = message as { type?: unknown; action?: unknown };
  return (
    type === 'autochrome:record' && (action === 'start' || action === 'stop' || action === 'cancel')
  );
};

/** Where the background keeps the recording in progress, for the panel to watch. */
export const RECORDING_KEY = 'recording';
