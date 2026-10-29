import { describe, expect, it } from 'vitest';
import type { TargetHint } from '@autochrome/shared';
import type { ChatMessage, Part } from '../providers/types';
import { stepFromCall, stepsFromMessages, workflowFromChat } from './fromChat';

const signIn: TargetHint = {
  role: 'button',
  name: 'Sign in',
  selector: '#go',
  url: 'https://example.com/login',
};

let n = 0;
/** One assistant tool call and its result, as the agent loop stores them. */
function turn(
  name: string,
  input: object,
  result: { isError?: boolean; target?: TargetHint } = {},
): ChatMessage[] {
  const id = `c${++n}`;
  return [
    { role: 'assistant', parts: [{ type: 'tool_call', id, name, input }] },
    {
      role: 'user',
      parts: [
        {
          type: 'tool_result',
          callId: id,
          content: [{ type: 'text', text: 'ok' }],
          isError: result.isError ?? false,
          target: result.target,
        } satisfies Part,
      ],
    },
  ];
}

describe('stepFromCall', () => {
  it('replaces a ref with the target and drops the tab id', () => {
    const step = stepFromCall(
      { name: 'click', input: { ref: 'e12', button: 'left', clickCount: 1, tabId: 4 } },
      signIn,
    );
    expect(step).toEqual({
      tool: 'click',
      input: { button: 'left', clickCount: 1 },
      target: signIn,
      note: 'Click "Sign in"',
    });
  });

  it('turns a point click into a target click, but keeps the point when there is no target', () => {
    expect(stepFromCall({ name: 'click', input: { x: 5, y: 6 } }, signIn)!.input).toEqual({});
    expect(stepFromCall({ name: 'click', input: { x: 5, y: 6 } })!.input).toEqual({ x: 5, y: 6 });
  });

  it('keeps typed text, keys and navigations as they are', () => {
    expect(stepFromCall({ name: 'type', input: { text: 'hi', ref: 'e1' } }, signIn)!.input).toEqual(
      {
        text: 'hi',
      },
    );
    expect(stepFromCall({ name: 'key', input: { keys: 'Enter' } })!.note).toBe('Press Enter');
    expect(stepFromCall({ name: 'navigate', input: { url: 'https://a.test' } })!.note).toBe(
      'Go to https://a.test',
    );
  });

  it('does not replay reads, tab juggling, debugging or background tabs', () => {
    for (const name of [
      'read_page',
      'find',
      'screenshot',
      'tabs_list',
      'tab_switch',
      'tab_close',
      'js_eval',
      'console_logs',
    ]) {
      expect(stepFromCall({ name, input: {} }), name).toBeUndefined();
    }
    expect(
      stepFromCall({ name: 'tab_open', input: { url: 'https://a.test', background: true } }),
    ).toBeUndefined();
    expect(
      stepFromCall({ name: 'tab_open', input: { url: 'https://a.test', background: false } })!
        .input,
    ).toEqual({ url: 'https://a.test' });
  });
});

describe('stepsFromMessages', () => {
  it('keeps the successful actions in order and drops reads and failures', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'text', text: 'Sign in' }] } satisfies ChatMessage,
      ...turn('tab_open', { url: 'https://example.com/login' }),
      ...turn('read_page', {}),
      ...turn(
        'form_input',
        { ref: 'e1', value: 'ada' },
        { target: { role: 'textbox', name: 'User' } },
      ),
      ...turn('click', { ref: 'e9' }, { isError: true }),
      ...turn('click', { ref: 'e2' }, { target: signIn }),
      ...turn('screenshot', {}),
    ];
    const steps = stepsFromMessages(messages);
    expect(steps.map((s) => s.note)).toEqual([
      'Go to https://example.com/login',
      'Set "User" to "ada"',
      'Click "Sign in"',
    ]);
    expect(steps.some((s) => 'ref' in s.input)).toBe(false);
  });

  it('starts from the page the chat was on when its first action was not a navigation', () => {
    const steps = stepsFromMessages(turn('click', { ref: 'e2' }, { target: signIn }));
    expect(steps.map((s) => s.note)).toEqual([
      'Go to https://example.com/login',
      'Click "Sign in"',
    ]);
  });

  it('does not invent a navigation without a known page', () => {
    expect(stepsFromMessages(turn('key', { keys: 'Enter' }))).toHaveLength(1);
  });
});

describe('workflowFromChat', () => {
  it('names the workflow after the chat', () => {
    const workflow = workflowFromChat({
      title: 'Sign in to the shop',
      messages: turn('go_back', {}),
    });
    expect(workflow).toMatchObject({
      name: 'Sign in to the shop',
      createdFrom: 'chat',
      variables: [],
    });
    expect(workflow.steps).toHaveLength(1);
    expect(workflow.id).toBeTruthy();
  });
});
