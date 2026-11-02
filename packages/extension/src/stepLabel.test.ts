import { describe, expect, it } from 'vitest';
import type { TargetHint } from '@autochrome/shared';
import type { Part } from './providers/types';
import { describeStep, shortUrl } from './stepLabel';

type ToolCall = Extract<Part, { type: 'tool_call' }>;
type ToolResult = Extract<Part, { type: 'tool_result' }>;

const call = (name: string, input: object = {}): ToolCall => ({
  type: 'tool_call',
  id: '1',
  name,
  input,
});
const result = (target?: TargetHint): ToolResult => ({
  type: 'tool_result',
  callId: '1',
  content: [],
  isError: false,
  target,
});

describe('describeStep', () => {
  it('uses the present tense while running and the past tense after', () => {
    const open = call('tab_open', { url: 'https://www.wikipedia.org/' });
    expect(describeStep(open)).toBe('Opening wikipedia.org');
    expect(describeStep(open, result())).toBe('Opened wikipedia.org');
  });

  it('names the element from the result target', () => {
    const target = { role: 'button', name: 'Place order' };
    expect(describeStep(call('click', { ref: 'e3' }), result(target))).toBe(
      'Clicked “Place order”',
    );
    expect(describeStep(call('click', { x: 4, y: 5 }), result())).toBe(
      'Clicked a point on the page',
    );
    expect(
      describeStep(
        call('form_input', { ref: 'e4', value: 'Ada' }),
        result({ role: 'textbox', name: 'Name' }),
      ),
    ).toBe('Set “Name” to “Ada”');
    expect(describeStep(call('form_input', { ref: 'e7', value: true }), result())).toBe(
      'Set a field to on',
    );
  });

  it('never shows what was typed into a password field', () => {
    const target = { role: 'textbox', name: 'Password' };
    expect(describeStep(call('form_input', { value: 'hunter2' }), result(target))).toBe(
      'Set “Password” to ••••',
    );
    expect(describeStep(call('type', { text: 'hunter2' }), result(target))).toBe(
      'Typed •••• into “Password”',
    );
  });

  it('describes reads, waits, keys and unknown tools', () => {
    expect(describeStep(call('read_page'), result())).toBe('Read the page');
    expect(describeStep(call('find', { query: 'Submit' }), result())).toBe('Looked for “Submit”');
    expect(describeStep(call('wait', { ms: 2000 }), result())).toBe('Waited 2 s');
    expect(describeStep(call('wait', { text: 'Done' }))).toBe('Waiting for “Done”');
    expect(describeStep(call('key', { keys: 'Enter' }), result())).toBe('Pressed Enter');
    expect(describeStep(call('mystery'), result())).toBe('Used mystery');
  });
});

describe('shortUrl', () => {
  it('drops the protocol and www and shortens long paths', () => {
    expect(shortUrl('https://www.example.com/a/b')).toBe('example.com/a/b');
    expect(shortUrl('not a url')).toBe('not a url');
    expect(shortUrl(`https://a.test/${'x'.repeat(80)}`)).toHaveLength(48);
  });
});
