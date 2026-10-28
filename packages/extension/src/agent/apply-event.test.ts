import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../providers/types';
import { applyEvent } from './apply-event';
import type { AgentEvent } from './protocol';

const events: AgentEvent[] = [
  { type: 'text_delta', text: 'Open' },
  { type: 'text_delta', text: 'ing' },
  { type: 'tool_start', id: 'c1', name: 'tab_open', input: { url: 'x' } },
  {
    type: 'tool_end',
    id: 'c1',
    result: { id: 'c1', ok: true, content: [{ type: 'text', text: 'ok' }] },
  },
  { type: 'text_delta', text: 'Done' },
];

describe('applyEvent', () => {
  it('builds the same structure the agent loop stores', () => {
    const start: ChatMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'go' }] }];
    const result = events.reduce(applyEvent, start);
    expect(result).toEqual([
      start[0],
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Opening' },
          { type: 'tool_call', id: 'c1', name: 'tab_open', input: { url: 'x' } },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            type: 'tool_result',
            callId: 'c1',
            content: [{ type: 'text', text: 'ok' }],
            isError: false,
          },
        ],
      },
      { role: 'assistant', parts: [{ type: 'text', text: 'Done' }] },
    ]);
  });

  it('does not mutate its input', () => {
    const start: ChatMessage[] = [{ role: 'assistant', parts: [{ type: 'text', text: 'a' }] }];
    applyEvent(start, { type: 'text_delta', text: 'b' });
    expect(start[0]?.parts).toEqual([{ type: 'text', text: 'a' }]);
  });
});
