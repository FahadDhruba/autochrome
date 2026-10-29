import { describe, expect, it } from 'vitest';
import type { TargetHint } from '@autochrome/shared';
import {
  addEvent,
  addNavigation,
  NAVIGATION_CAUSED_WITHIN_MS,
  newRecording,
  type RecordEvent,
} from './recording';

const NOW = 1_000_000;
const target = (name: string, role = 'textbox'): TargetHint => ({
  role,
  name,
  selector: `#${name.toLowerCase()}`,
});

const start = () => newRecording(1, 'https://example.com/login', NOW);
const apply = (events: RecordEvent[]) =>
  events.reduce((state, event, i) => addEvent(state, event, NOW + i), start());

describe('recording', () => {
  it('starts with a navigation to the recorded page', () => {
    expect(start().steps).toEqual([
      {
        tool: 'navigate',
        input: { url: 'https://example.com/login' },
        note: 'Go to https://example.com/login',
      },
    ]);
  });

  it('turns events into steps with a target and a readable note', () => {
    const state = apply([
      { kind: 'fill', target: target('Email'), value: 'ada@example.com', secret: false },
      { kind: 'click', target: target('Sign in', 'button') },
      { kind: 'enter', target: target('Search', 'searchbox') },
      { kind: 'type', target: target('Notes'), text: 'hello' },
    ]);
    expect(state.steps.slice(1).map(({ tool, input, note }) => ({ tool, input, note }))).toEqual([
      {
        tool: 'form_input',
        input: { value: 'ada@example.com' },
        note: 'Set "Email" to "ada@example.com"',
      },
      { tool: 'click', input: {}, note: 'Click "Sign in"' },
      { tool: 'key', input: { keys: 'Enter' }, note: 'Press Enter in "Search"' },
      { tool: 'type', input: { text: 'hello' }, note: 'Type "hello" into "Notes"' },
    ]);
    expect(state.steps[1]!.target).toEqual(target('Email'));
  });

  it('records a checkbox as a boolean', () => {
    const state = apply([
      { kind: 'fill', target: target('Subscribe', 'checkbox'), value: true, secret: false },
    ]);
    expect(state.steps[1]).toMatchObject({ input: { value: true }, note: 'Check "Subscribe"' });
  });

  it('keeps only the last value when a field is set twice in a row', () => {
    const state = apply([
      { kind: 'fill', target: target('Name'), value: 'Ad', secret: false },
      { kind: 'fill', target: target('Name'), value: 'Ada', secret: false },
    ]);
    expect(state.steps).toHaveLength(2);
    expect(state.steps[1]!.input).toEqual({ value: 'Ada' });
  });

  it('does not merge different fields or fields separated by another step', () => {
    const state = apply([
      { kind: 'fill', target: target('Name'), value: 'Ada', secret: false },
      { kind: 'click', target: target('Next', 'button') },
      { kind: 'fill', target: target('Name'), value: 'Bob', secret: false },
      { kind: 'fill', target: target('Email'), value: 'b@example.com', secret: false },
    ]);
    expect(state.steps).toHaveLength(5);
  });

  describe('passwords', () => {
    const password = (name: string): RecordEvent => ({
      kind: 'fill',
      target: target(name),
      value: '',
      secret: true,
    });

    it('become a variable and the value is never stored', () => {
      const state = apply([password('Password')]);
      expect(state.steps[1]).toMatchObject({
        tool: 'form_input',
        input: { value: '{{password}}' },
        note: 'Set "Password" to "{{password}}"',
      });
      expect(state.variables).toEqual([{ name: 'password', label: 'Password' }]);
    });

    it('get a numbered variable for each further field, and reuse it for the same field', () => {
      const state = apply([
        password('Password'),
        { kind: 'click', target: target('Show', 'button') },
        password('Confirm password'),
        password('Confirm password'),
      ]);
      expect(state.variables.map((v) => v.name)).toEqual(['password', 'password_2']);
      expect(state.steps.map((s) => s.input.value)).toEqual([
        undefined,
        '{{password}}',
        undefined,
        '{{password_2}}',
      ]);
    });

    it('never put a typed value into the recording, even if one is passed', () => {
      const state = apply([
        { kind: 'fill', target: target('Password'), value: 'hunter2', secret: true },
      ]);
      expect(JSON.stringify(state)).not.toContain('hunter2');
    });
  });

  describe('navigation', () => {
    it('adds a step for a page the user went to', () => {
      const state = addNavigation(start(), 'https://example.com/other', NOW + 60_000);
      expect(state.steps.at(-1)).toMatchObject({
        tool: 'navigate',
        input: { url: 'https://example.com/other' },
      });
    });

    it('ignores a load caused by the last click', () => {
      const clicked = addEvent(start(), { kind: 'click', target: target('Go', 'button') }, NOW);
      const state = addNavigation(clicked, 'https://example.com/next', NOW + 500);
      expect(state.steps).toHaveLength(2);
      expect(state.lastUrl).toBe('https://example.com/next');
    });

    it('adds a step once the click was long ago', () => {
      const clicked = addEvent(start(), { kind: 'click', target: target('Go', 'button') }, NOW);
      const later = NOW + NAVIGATION_CAUSED_WITHIN_MS + 1;
      expect(addNavigation(clicked, 'https://example.com/next', later).steps).toHaveLength(3);
    });

    it('ignores a reload of the same page', () => {
      const state = start();
      expect(addNavigation(state, state.lastUrl, NOW + 60_000)).toBe(state);
    });
  });
});
