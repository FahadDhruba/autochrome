import type { Step, Workflow } from '@autochrome/shared';
import { noteFor } from './note';
import type { StepLog } from './types';

/** Moves a step up (-1) or down (+1); out of range leaves the list as it is. */
export function moveStep(steps: Step[], index: number, delta: -1 | 1): Step[] {
  const to = index + delta;
  if (to < 0 || to >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

export const removeStep = (steps: Step[], index: number): Step[] =>
  steps.filter((_, i) => i !== index);

/** Strings in a step input that can be made into variables: the text a step types or sets. */
export const VALUE_FIELDS = ['text', 'value', 'url', 'keys'] as const;
export type ValueField = (typeof VALUE_FIELDS)[number];

export const editableFields = (step: Step): ValueField[] =>
  VALUE_FIELDS.filter((field) => typeof step.input[field] === 'string');

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const isValidVariableName = (name: string): boolean => VARIABLE_NAME.test(name);

/**
 * Replaces the selected part of a step's value with `{{name}}` and declares the variable, using
 * the selected text as its default. Returns undefined for a bad name or an empty selection.
 */
export function makeVariable(
  workflow: Workflow,
  stepIndex: number,
  field: ValueField,
  selection: { start: number; end: number },
  name: string,
): Workflow | undefined {
  const step = workflow.steps[stepIndex];
  const value = step?.input[field];
  if (!step || typeof value !== 'string' || !isValidVariableName(name)) return undefined;
  if (selection.end <= selection.start) return undefined;

  const selected = value.slice(selection.start, selection.end);
  const input = {
    ...step.input,
    [field]: `${value.slice(0, selection.start)}{{${name}}}${value.slice(selection.end)}`,
  };
  const declared = workflow.variables.some((variable) => variable.name === name);
  return {
    ...workflow,
    variables: declared
      ? workflow.variables
      : [...workflow.variables, { name, label: name, default: selected }],
    steps: workflow.steps.map((s, i) =>
      i === stepIndex ? { ...s, input, note: noteFor(s.tool, input, s.target) } : s,
    ),
  };
}

/** Variables no step uses any more can be dropped; this lists the ones still declared. */
export const removeVariable = (workflow: Workflow, name: string): Workflow => ({
  ...workflow,
  variables: workflow.variables.filter((variable) => variable.name !== name),
});

/** Steps the AI repaired in a run, still matching the step they replace. */
export function repairedSteps(workflow: Workflow, logs: StepLog[]): StepLog[] {
  return logs.filter((log) => {
    const step = workflow.steps[log.index];
    return log.status === 'repaired' && log.repair?.steps.length && step?.tool === log.tool;
  });
}

/** Swaps each repaired step for what the AI did instead. Later steps first, so indexes hold. */
export function applyRepairs(workflow: Workflow, logs: StepLog[]): Workflow {
  const steps = [...workflow.steps];
  for (const log of [...repairedSteps(workflow, logs)].sort((a, b) => b.index - a.index)) {
    steps.splice(log.index, 1, ...log.repair!.steps);
  }
  return { ...workflow, steps };
}
