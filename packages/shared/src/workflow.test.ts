import { describe, expect, it } from 'vitest';
import {
  parseWorkflowJson,
  substituteVariables,
  variableNames,
  workflow,
  type Workflow,
} from './workflow';

const sample: Workflow = {
  id: 'w1',
  name: 'Sign in',
  variables: [{ name: 'password', label: 'Password' }],
  steps: [
    { tool: 'navigate', input: { url: 'https://example.com/login' } },
    {
      tool: 'form_input',
      input: { value: '{{password}}' },
      target: { role: 'textbox', name: 'Password', selector: '#pw' },
      note: 'Enter password',
    },
  ],
  createdFrom: 'recording',
  updatedAt: 1,
};

describe('variableNames', () => {
  it('finds variables in nested strings, once each', () => {
    const input = { a: '{{x}} and {{ y }}', b: ['{{x}}', { c: '{{z}}' }], d: 3 };
    expect(variableNames(input)).toEqual(['x', 'y', 'z']);
  });

  it('ignores text that is not a variable', () => {
    expect(variableNames({ a: '{x} {{1bad}} {{}}' })).toEqual([]);
  });
});

describe('substituteVariables', () => {
  it('replaces known variables everywhere and keeps unknown ones', () => {
    const input = { text: 'Hi {{name}}, {{missing}}', list: ['{{name}}'], n: 1, ok: true };
    expect(substituteVariables(input, { name: 'Ada' })).toEqual({
      text: 'Hi Ada, {{missing}}',
      list: ['Ada'],
      n: 1,
      ok: true,
    });
  });

  it('does not change the original and does not re-expand values', () => {
    const input = { text: '{{a}}' };
    expect(substituteVariables(input, { a: '{{b}}', b: 'no' })).toEqual({ text: '{{b}}' });
    expect(input).toEqual({ text: '{{a}}' });
  });

  it('allows an empty value', () => {
    expect(substituteVariables('[{{a}}]', { a: '' })).toBe('[]');
  });
});

describe('workflow schema', () => {
  it('accepts a valid workflow and round-trips through JSON', () => {
    const parsed = parseWorkflowJson(JSON.stringify(sample));
    expect(parsed).toEqual({ ok: true, workflow: sample });
  });

  it('rejects invalid JSON with a readable error', () => {
    expect(parseWorkflowJson('{nope')).toEqual({
      ok: false,
      error: 'This file is not valid JSON.',
    });
  });

  it('rejects unknown tools, workflow tools and bad variable names', () => {
    const bad = (patch: object) => workflow.safeParse({ ...sample, ...patch }).success;
    expect(bad({ steps: [{ tool: 'nope', input: {} }] })).toBe(false);
    expect(bad({ steps: [{ tool: 'workflow_run', input: { name: 'x' } }] })).toBe(false);
    expect(bad({ variables: [{ name: 'has space', label: 'x' }] })).toBe(false);
    expect(bad({ name: '   ' })).toBe(false);
    expect(bad({ createdFrom: 'magic' })).toBe(false);
  });

  it('reports which field is wrong', () => {
    const parsed = parseWorkflowJson(JSON.stringify({ ...sample, steps: 'x' }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('steps');
  });
});
