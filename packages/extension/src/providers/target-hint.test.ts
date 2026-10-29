import { describe, expect, it } from 'vitest';
import { createAnthropicProvider } from './anthropic';
import { createGeminiProvider } from './gemini';
import { createOpenAiProvider } from './openai';
import { collect, fakeFetch, sseResponse, streamRequest } from './testing';
import type { ChatMessage, Provider } from './types';

const MARKER = 'secret-target-marker';

// A chat whose click result carries the element hint saved for workflows.
const messages: ChatMessage[] = [
  { role: 'user', parts: [{ type: 'text', text: 'Click it' }] },
  {
    role: 'assistant',
    parts: [{ type: 'tool_call', id: 'c1', name: 'click', input: { ref: 'e1' } }],
  },
  {
    role: 'user',
    parts: [
      {
        type: 'tool_result',
        callId: 'c1',
        content: [{ type: 'text', text: 'Clicked e1' }],
        isError: false,
        target: { role: 'button', name: MARKER, text: MARKER, selector: `#${MARKER}`, url: MARKER },
      },
    ],
  },
];

describe('the target hint on a tool result', () => {
  const providers: [string, (fetchImpl: typeof fetch) => Provider][] = [
    ['Anthropic', (f) => createAnthropicProvider(f)],
    [
      'OpenAI',
      (f) =>
        createOpenAiProvider(
          { id: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1' },
          f,
        ),
    ],
    ['Gemini', (f) => createGeminiProvider(f)],
  ];

  it.each(providers)('never reaches the %s request', async (_name, create) => {
    const { fetchImpl, calls } = fakeFetch(() => sseResponse(''));
    await collect(create(fetchImpl).stream(streamRequest({ messages }))).catch(() => {});
    expect(calls).toHaveLength(1);
    const body = JSON.stringify(calls[0]!.body);
    expect(body).toContain('Clicked e1');
    expect(body).not.toContain(MARKER);
  });
});
