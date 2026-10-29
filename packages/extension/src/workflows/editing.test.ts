import type { Step, Workflow } from '@autochrome/shared';
import { describe, expect, it } from 'vitest';
import {
  applyRepairs,
  editableFields,
  makeVariable,
  moveStep,
  removeStep,
  repairedSteps,
} from './editing';
import type { StepLog } from './types';

const step = (note: string, tool: Step['tool'] = 'click', input: Step['input'] = {}): Step => ({
  tool,
  input,
  note,
});
const workflow = (steps: Step[]): Workflow => ({
  id: 'w',
  name: 'W',
  variables: [],
  steps,
  createdFrom: 'recording',
  updatedAt: 1,
});

describe('moveStep and removeStep', () => {
  const steps = [step('a'), step('b'), step('c')];
  const notes = (list: Step[]) => list.map((s) => s.note);

  it('moves a step up or down', () => {
    expect(notes(moveStep(steps, 1, -1))).toEqual(['b', 'a', 'c']);
    expect(notes(moveStep(steps, 1, 1))).toEqual(['a', 'c', 'b']);
  });

  it('keeps the list when the move goes out of range', () => {
    expect(moveStep(steps, 0, -1)).toBe(steps);
    expect(moveStep(steps, 2, 1)).toBe(steps);
  });

  it('removes a step without changing the original', () => {
    expect(notes(removeStep(steps, 1))).toEqual(['a', 'c']);
    expect(steps).toHaveLength(3);
  });
});

describe('makeVariable', () => {
  const typed = workflow([
    step('Type', 'type', { text: 'Search for shoes now' }),
    step('Go', 'navigate', { url: 'https://a.test' }),
  ]);

  it('replaces the selected text with the variable and declares it with that default', () => {
    const next = makeVariable(typed, 0, 'text', { start: 11, end: 16 }, 'item')!;
    expect(next.steps[0]!.input).toEqual({ text: 'Search for {{item}} now' });
    expect(next.steps[0]!.note).toBe('Type "Search for {{item}} now" into the page');
    expect(next.variables).toEqual([{ name: 'item', label: 'item', default: 'shoes' }]);
    expect(typed.steps[0]!.input).toEqual({ text: 'Search for shoes now' });
  });

  it('reuses a variable that already exists', () => {
    const declared = { ...typed, variables: [{ name: 'item', label: 'Item' }] };
    const next = makeVariable(declared, 0, 'text', { start: 0, end: 6 }, 'item')!;
    expect(next.variables).toEqual([{ name: 'item', label: 'Item' }]);
  });

  it('refuses a bad name, an empty selection or a missing field', () => {
    expect(makeVariable(typed, 0, 'text', { start: 0, end: 3 }, 'has space')).toBeUndefined();
    expect(makeVariable(typed, 0, 'text', { start: 3, end: 3 }, 'x')).toBeUndefined();
    expect(makeVariable(typed, 0, 'value', { start: 0, end: 3 }, 'x')).toBeUndefined();
    expect(makeVariable(typed, 9, 'text', { start: 0, end: 3 }, 'x')).toBeUndefined();
  });

  it('lists the string fields that can hold a variable', () => {
    expect(editableFields(typed.steps[0]!)).toEqual(['text']);
    expect(editableFields(step('Check', 'form_input', { value: true }))).toEqual([]);
    expect(editableFields(step('Click'))).toEqual([]);
  });
});

describe('applyRepairs', () => {
  const log = (patch: Partial<StepLog>): StepLog => ({
    index: 0,
    tool: 'click',
    note: 'n',
    status: 'repaired',
    durationMs: 1,
    repair: { steps: [step('fixed')], summary: 's' },
    ...patch,
  });

  it('swaps a repaired step for what the AI did', () => {
    const next = applyRepairs(workflow([step('a'), step('b')]), [log({ index: 1 })]);
    expect(next.steps.map((s) => s.note)).toEqual(['a', 'fixed']);
  });

  it('handles replacements of a different length without shifting the others', () => {
    const wf = workflow([step('a'), step('b'), step('c')]);
    const next = applyRepairs(wf, [
      log({ index: 0, repair: { steps: [step('x1'), step('x2')], summary: '' } }),
      log({ index: 2, repair: { steps: [step('y')], summary: '' } }),
    ]);
    expect(next.steps.map((s) => s.note)).toEqual(['x1', 'x2', 'b', 'y']);
  });

  it('skips steps that were not repaired, had nothing to replace them, or changed since', () => {
    const wf = workflow([step('a'), step('b', 'key')]);
    const logs = [
      log({ index: 0, status: 'ok' }),
      log({ index: 0, repair: { steps: [], summary: '' } }),
      log({ index: 1, tool: 'click' }),
    ];
    expect(repairedSteps(wf, logs)).toEqual([]);
    expect(applyRepairs(wf, logs).steps).toEqual(wf.steps);
  });
});
