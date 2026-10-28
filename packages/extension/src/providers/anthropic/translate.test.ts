import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { toAnthropicMessages, toAnthropicSystem, toAnthropicTools } from './translate';

const history: ChatMessage[] = [
  { role: 'user', parts: [{ type: 'text', text: 'Open example.com' }] },
  {
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Sure.' },
      { type: 'tool_call', id: 'c1', name: 'screenshot', input: {} },
    ],
  },
  {
    role: 'user',
    parts: [
      { type: 'text', text: 'and be quick' },
      {
        type: 'tool_result',
        callId: 'c1',
        isError: false,
        content: [
          { type: 'text', text: 'Taken' },
          { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' },
        ],
      },
    ],
  },
];

describe('toAnthropicMessages', () => {
  const messages = toAnthropicMessages(history);

  it('translates tool calls and tool results with image content', () => {
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Sure.' },
        { type: 'tool_use', id: 'c1', name: 'screenshot', input: {} },
      ],
    });
    expect(messages[2]?.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'c1',
      content: [
        { type: 'text', text: 'Taken' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      ],
    });
  });

  it('puts tool results before other blocks of a user turn', () => {
    const types = (messages[2]?.content as { type: string }[]).map((block) => block.type);
    expect(types).toEqual(['tool_result', 'text']);
  });

  it('marks only the last block of the last message with cache_control', () => {
    const blocks = messages.flatMap((message) => message.content as { cache_control?: unknown }[]);
    const marked = blocks.filter((block) => block.cache_control);
    expect(marked).toEqual([
      { type: 'text', text: 'and be quick', cache_control: { type: 'ephemeral' } },
    ]);
    expect(blocks.at(-1)).toBe(marked[0]);
  });

  it('flags errors, skips empty text and fills empty results', () => {
    const [message] = toAnthropicMessages([
      {
        role: 'user',
        parts: [
          { type: 'text', text: '' },
          { type: 'tool_result', callId: 'c2', isError: true, content: [] },
        ],
      },
    ]);
    expect(message?.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'c2',
        content: [{ type: 'text', text: '(no output)' }],
        is_error: true,
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });
});

describe('cache_control on tools and system', () => {
  it('marks the last tool definition only', () => {
    const tools = toAnthropicTools([
      { name: 'a', description: 'A', inputSchema: { type: 'object' } },
      { name: 'b', description: 'B', inputSchema: { type: 'object' } },
    ]);
    expect(tools[0]).not.toHaveProperty('cache_control');
    expect(tools[1]).toMatchObject({ name: 'b', cache_control: { type: 'ephemeral' } });
  });

  it('sends the system prompt as a cached block', () => {
    expect(toAnthropicSystem('hi')).toEqual([
      { type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } },
    ]);
  });
});

describe('volatile parts', () => {
  const note = { type: 'text' as const, text: 'Tab state: 1', volatile: true };
  const withNote = (messages: ChatMessage[]): ChatMessage[] => [
    ...messages.slice(0, -1),
    { ...messages.at(-1)!, parts: [...messages.at(-1)!.parts, note] },
  ];

  it('puts the note after the cache mark so the mark stays on the stable history', () => {
    const blocks = toAnthropicMessages(withNote(history)).at(-1)!.content as {
      type: string;
      text?: string;
      cache_control?: unknown;
    }[];
    expect(blocks.map((block) => block.type)).toEqual(['tool_result', 'text', 'text']);
    expect(blocks[1]).toMatchObject({ text: 'and be quick', cache_control: { type: 'ephemeral' } });
    expect(blocks[2]).toEqual({ type: 'text', text: 'Tab state: 1' });
  });

  it('is the only content of a message that has nothing else', () => {
    const messages = toAnthropicMessages([{ role: 'user', parts: [note] }]);
    expect(messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Tab state: 1' }] }]);
  });
});
