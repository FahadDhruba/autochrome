import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { toLiveTurns } from './translate';

const call = (id: string, name: string, input: unknown = {}) =>
  ({ type: 'tool_call', id, name, input }) as const;

describe('toLiveTurns', () => {
  it('maps text, model calls and user images', () => {
    const messages: ChatMessage[] = [
      { role: 'user', parts: [{ type: 'text', text: 'open it' }] },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: 'Sure.' }, call('c1', 'tab_open', { url: 'http://x' })],
      },
      { role: 'user', parts: [{ type: 'image', data: 'AAA', mimeType: 'image/png' }] },
    ];
    expect(toLiveTurns(messages)).toEqual([
      { role: 'user', parts: [{ text: 'open it' }] },
      {
        role: 'model',
        parts: [
          { text: 'Sure.' },
          { functionCall: { id: 'c1', name: 'tab_open', args: { url: 'http://x' } } },
        ],
      },
      { role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'AAA' } }] },
    ]);
  });

  it('sends tool results as user text, then their images, and the tab note as text', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', parts: [call('c1', 'screenshot'), call('c2', 'click')] },
      {
        role: 'user',
        parts: [
          {
            type: 'tool_result',
            callId: 'c1',
            isError: false,
            content: [
              { type: 'text', text: 'taken' },
              { type: 'image', data: 'IMG', mimeType: 'image/jpeg' },
            ],
          },
          {
            type: 'tool_result',
            callId: 'c2',
            isError: true,
            content: [{ type: 'text', text: 'no such element' }],
          },
          { type: 'text', text: 'Tab state: 1 tab', volatile: true },
        ],
      },
    ];
    const turns = toLiveTurns(messages);
    expect(turns[1]).toEqual({
      role: 'user',
      parts: [
        { text: 'Result of screenshot (c1):\ntaken' },
        { inlineData: { mimeType: 'image/jpeg', data: 'IMG' } },
        { text: 'Error from click (c2):\nno such element' },
        { text: 'Tab state: 1 tab' },
      ],
    });
    expect(JSON.stringify(turns)).not.toContain('functionResponse');
  });

  it('handles empty results, unknown calls and non-object input', () => {
    const turns = toLiveTurns([
      { role: 'assistant', parts: [call('c1', 'wait', 'oops')] },
      {
        role: 'user',
        parts: [
          { type: 'tool_result', callId: 'c1', isError: false, content: [] },
          { type: 'tool_result', callId: 'gone', isError: false, content: [] },
        ],
      },
    ]);
    expect(turns[0]!.parts).toEqual([{ functionCall: { id: 'c1', name: 'wait', args: {} } }]);
    expect(turns[1]!.parts).toEqual([
      { text: 'Result of wait (c1):\n(no output)' },
      { text: 'Result of unknown_tool (gone):\n(no output)' },
    ]);
  });

  it('drops turns that end up empty', () => {
    expect(toLiveTurns([{ role: 'assistant', parts: [{ type: 'text', text: '' }] }])).toEqual([]);
  });
});
