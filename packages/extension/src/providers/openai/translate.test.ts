import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { toOpenAiMessages, toOpenAiTools } from './translate';

const history: ChatMessage[] = [
  { role: 'user', parts: [{ type: 'text', text: 'Open the page' }] },
  {
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Sure.' },
      { type: 'tool_call', id: 'c1', name: 'tab_open', input: { url: 'http://x' } },
      { type: 'tool_call', id: 'c2', name: 'screenshot', input: {} },
    ],
  },
  {
    role: 'user',
    parts: [
      {
        type: 'tool_result',
        callId: 'c1',
        content: [{ type: 'text', text: 'opened' }],
        isError: false,
      },
      {
        type: 'tool_result',
        callId: 'c2',
        content: [
          { type: 'text', text: 'captured' },
          { type: 'image', data: 'AAAA', mimeType: 'image/png' },
        ],
        isError: false,
      },
    ],
  },
  { role: 'assistant', parts: [{ type: 'tool_call', id: 'c3', name: 'click', input: 'oops{' }] },
  {
    role: 'user',
    parts: [{ type: 'tool_result', callId: 'c3', content: [], isError: true }],
  },
];

describe('toOpenAiMessages', () => {
  it('translates a full history', () => {
    expect(toOpenAiMessages('sys', history)).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'Open the page' },
      {
        role: 'assistant',
        content: 'Sure.',
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'tab_open', arguments: '{"url":"http://x"}' },
          },
          { id: 'c2', type: 'function', function: { name: 'screenshot', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'opened' },
      { role: 'tool', tool_call_id: 'c2', content: 'captured' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Screenshot from c2' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ],
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c3', type: 'function', function: { name: 'click', arguments: 'oops{' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c3', content: 'Error: (no output)' },
    ]);
  });

  it('skips empty assistant turns and sends images with user text as parts', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', parts: [{ type: 'text', text: '' }] },
      {
        role: 'user',
        parts: [
          { type: 'text', text: 'look' },
          { type: 'image', data: 'BB', mimeType: 'image/jpeg' },
        ],
      },
    ];
    expect(toOpenAiMessages('s', messages).slice(1)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BB' } },
        ],
      },
    ]);
  });
});

describe('toOpenAiTools', () => {
  it('wraps tools as functions', () => {
    expect(
      toOpenAiTools([{ name: 'a', description: 'd', inputSchema: { type: 'object' } }]),
    ).toEqual([
      {
        type: 'function',
        function: { name: 'a', description: 'd', parameters: { type: 'object' } },
      },
    ]);
  });
});
