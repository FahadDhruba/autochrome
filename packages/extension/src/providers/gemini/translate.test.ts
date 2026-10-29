import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { GENERATED_ID_PREFIX, SKIP_SIGNATURE, toGeminiContents, toGeminiTools } from './translate';

const history: ChatMessage[] = [
  { role: 'user', parts: [{ type: 'text', text: 'Go' }] },
  {
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Working.', signature: 'sigText' },
      {
        type: 'tool_call',
        id: 'g1',
        name: 'tab_open',
        input: { url: 'http://x' },
        signature: 'sigCall',
      },
      { type: 'tool_call', id: `${GENERATED_ID_PREFIX}1`, name: 'screenshot', input: {} },
    ],
  },
  {
    role: 'user',
    parts: [
      {
        type: 'tool_result',
        callId: 'g1',
        content: [{ type: 'text', text: 'opened' }],
        isError: false,
      },
      {
        type: 'tool_result',
        callId: `${GENERATED_ID_PREFIX}1`,
        content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }],
        isError: true,
      },
    ],
  },
];

describe('toGeminiContents', () => {
  it('translates a full history and round-trips signatures', () => {
    expect(toGeminiContents(history)).toEqual([
      { role: 'user', parts: [{ text: 'Go' }] },
      {
        role: 'model',
        parts: [
          { text: 'Working.', thoughtSignature: 'sigText' },
          {
            functionCall: { id: 'g1', name: 'tab_open', args: { url: 'http://x' } },
            thoughtSignature: 'sigCall',
          },
          { functionCall: { name: 'screenshot', args: {} } },
        ],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { id: 'g1', name: 'tab_open', response: { output: 'opened' } } },
          {
            functionResponse: {
              name: 'screenshot',
              response: { error: '(screenshot attached)' },
            },
          },
          { inlineData: { mimeType: 'image/png', data: 'AAAA' } },
        ],
      },
    ]);
  });

  it('uses the documented placeholder on the first call that came from another provider', () => {
    const switched: ChatMessage[] = [
      { role: 'user', parts: [{ type: 'text', text: 'Go' }] },
      {
        role: 'assistant',
        parts: [
          { type: 'tool_call', id: 'toolu_1', name: 'a', input: {} },
          { type: 'tool_call', id: 'toolu_2', name: 'b', input: {} },
        ],
      },
    ];
    const model = toGeminiContents(switched)[1]!;
    expect(model.parts).toEqual([
      { functionCall: { id: 'toolu_1', name: 'a', args: {} }, thoughtSignature: SKIP_SIGNATURE },
      { functionCall: { id: 'toolu_2', name: 'b', args: {} } },
    ]);
  });

  it('drops empty messages and non-object args', () => {
    const contents = toGeminiContents([
      { role: 'assistant', parts: [{ type: 'text', text: '' }] },
      { role: 'assistant', parts: [{ type: 'tool_call', id: 'x', name: 'a', input: 'bad{' }] },
    ]);
    expect(contents).toHaveLength(1);
    expect(contents[0]!.parts[0]).toMatchObject({ functionCall: { args: {} } });
  });
});

describe('toGeminiTools', () => {
  it('declares functions with parametersJsonSchema and drops $schema', () => {
    expect(
      toGeminiTools([
        {
          name: 'a',
          description: 'd',
          inputSchema: { $schema: 'x', type: 'object', properties: {} },
        },
      ]),
    ).toEqual([
      {
        functionDeclarations: [
          { name: 'a', description: 'd', parametersJsonSchema: { type: 'object', properties: {} } },
        ],
      },
    ]);
    expect(toGeminiTools([])).toBeUndefined();
  });
});
