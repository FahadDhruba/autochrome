import { describe, expect, it } from 'vitest';
import { collect, fakeFetch, sseBody, sseResponse, streamRequest } from '../testing';
import { createOpenAiProvider } from './index';

const openai = {
  id: 'openai',
  label: 'OpenAI',
  defaultBaseUrl: 'https://api.openai.com/v1',
} as const;
const compatible = { id: 'compatible', label: 'Ollama', defaultBaseUrl: '' } as const;

const chunk = (delta: object, finish_reason: string | null = null) => ({
  choices: [{ index: 0, delta, finish_reason }],
});

describe('OpenAI stream', () => {
  it('streams text with usage from the final chunk', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      sseResponse(
        sseBody(
          chunk({ role: 'assistant', content: '' }),
          chunk({ content: 'Hello' }),
          chunk({ content: ', world' }),
          chunk({}, 'stop'),
          {
            choices: [],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 9,
              prompt_tokens_details: { cached_tokens: 100 },
            },
          },
          '[DONE]',
        ),
      ),
    );
    const events = await collect(createOpenAiProvider(openai, fetchImpl).stream(streamRequest()));
    expect(events).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ', world' },
      {
        type: 'done',
        stopReason: 'end',
        usage: { inputTokens: 20, outputTokens: 9, cacheReadTokens: 100 },
      },
    ]);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer key');
    expect(calls[0]!.body).toMatchObject({
      model: 'm',
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: 8192,
    });
    expect(calls[0]!.body).not.toHaveProperty('max_tokens');
  });

  it('assembles parallel tool calls split across chunks', async () => {
    const { fetchImpl } = fakeFetch(() =>
      sseResponse(
        sseBody(
          chunk({
            tool_calls: [
              {
                index: 0,
                id: 'a',
                type: 'function',
                function: { name: 'tab_open', arguments: '' },
              },
            ],
          }),
          chunk({
            tool_calls: [
              {
                index: 1,
                id: 'b',
                type: 'function',
                function: { name: 'read_page', arguments: '' },
              },
            ],
          }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: '{"url":' } }] }),
          chunk({ tool_calls: [{ index: 1, function: { arguments: '{}' } }] }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: '"http://x"}' } }] }),
          chunk({}, 'tool_calls'),
          '[DONE]',
        ),
      ),
    );
    const events = await collect(createOpenAiProvider(openai, fetchImpl).stream(streamRequest()));
    expect(events).toEqual([
      { type: 'tool_call', id: 'a', name: 'tab_open', input: { url: 'http://x' } },
      { type: 'tool_call', id: 'b', name: 'read_page', input: {} },
      { type: 'done', stopReason: 'tool_use', usage: undefined },
    ]);
  });

  it('keeps unparseable arguments as the raw string and invents missing ids', async () => {
    const { fetchImpl } = fakeFetch(() =>
      sseResponse(
        sseBody(
          chunk({ tool_calls: [{ index: 0, function: { name: 'click', arguments: '{"ref":' } }] }),
          chunk({}, 'stop'),
        ),
      ),
    );
    const events = await collect(
      createOpenAiProvider(compatible, fetchImpl).stream(
        streamRequest({
          settings: { apiKey: '', baseUrl: 'http://localhost:11434/v1', model: 'm' },
        }),
      ),
    );
    expect(events[0]).toMatchObject({ type: 'tool_call', name: 'click', input: '{"ref":' });
    expect((events[0] as { id: string }).id).toMatch(/^call_/);
    // "stop" with tool calls still means the model wants the tools run.
    expect(events[1]).toMatchObject({ type: 'done', stopReason: 'tool_use' });
  });

  it('maps finish reasons', async () => {
    const run = async (reason: string) => {
      const { fetchImpl } = fakeFetch(() => sseResponse(sseBody(chunk({ content: 'x' }, reason))));
      const events = await collect(createOpenAiProvider(openai, fetchImpl).stream(streamRequest()));
      return events.at(-1);
    };
    expect(await run('length')).toMatchObject({ stopReason: 'max_tokens' });
    expect(await run('content_filter')).toMatchObject({ stopReason: 'other' });
  });

  it('reports an empty stream and mid-stream errors', async () => {
    const empty = fakeFetch(() => sseResponse(''));
    expect(
      await collect(createOpenAiProvider(openai, empty.fetchImpl).stream(streamRequest())),
    ).toEqual([{ type: 'error', message: 'The response ended unexpectedly.' }]);
    const failing = fakeFetch(() =>
      sseResponse(sseBody({ error: { message: 'upstream failed' } })),
    );
    expect(
      await collect(createOpenAiProvider(openai, failing.fetchImpl).stream(streamRequest())),
    ).toEqual([{ type: 'error', message: 'upstream failed' }]);
  });

  it('maps HTTP errors and unreachable servers', async () => {
    const unauthorized = fakeFetch(
      () => new Response('{"error":{"message":"Incorrect API key"}}', { status: 401 }),
    );
    const [rejected] = await collect(
      createOpenAiProvider(openai, unauthorized.fetchImpl).stream(streamRequest()),
    );
    expect(rejected).toMatchObject({ type: 'error' });
    expect((rejected as { message: string }).message).toContain('key was rejected');
    expect((rejected as { message: string }).message).toContain('Incorrect API key');

    const down = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    const [unreachable] = await collect(
      createOpenAiProvider(compatible, down).stream(
        streamRequest({
          settings: { apiKey: '', baseUrl: 'http://localhost:11434/v1', model: 'm' },
        }),
      ),
    );
    expect(unreachable).toEqual({
      type: 'error',
      message: 'Could not reach Ollama at http://localhost:11434/v1. Is it running and reachable?',
    });
  });

  it('needs a key for OpenAI but not for compatible servers, which use max_tokens', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      sseResponse(sseBody(chunk({ content: 'x' }, 'stop'))),
    );
    const noKey = streamRequest({
      settings: { apiKey: '', baseUrl: 'http://localhost:1234/v1/', model: 'm' },
    });
    expect((await collect(createOpenAiProvider(openai, fetchImpl).stream(noKey)))[0]).toMatchObject(
      {
        type: 'error',
        message: 'No API key set. Add one in Settings.',
      },
    );
    expect(calls).toHaveLength(0);

    await collect(createOpenAiProvider(compatible, fetchImpl).stream(noKey));
    expect(calls[0]!.url).toBe('http://localhost:1234/v1/chat/completions');
    expect(calls[0]!.headers.has('authorization')).toBe(false);
    expect(calls[0]!.body).toMatchObject({ max_tokens: 8192 });
    expect(calls[0]!.body).not.toHaveProperty('max_completion_tokens');
  });
});

describe('OpenAI listModels', () => {
  const models = {
    data: [
      { id: 'whisper-1' },
      { id: 'o3-mini' },
      { id: 'gpt-4o' },
      { id: 'text-embedding-3-small' },
      { id: 'chatgpt-4o-latest' },
      { id: 'omni-moderation-latest' },
    ],
  };

  it('keeps chat models for OpenAI, sorted', async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json(models));
    const list = await createOpenAiProvider(openai, fetchImpl).listModels({
      apiKey: 'k',
      baseUrl: '',
      model: '',
    });
    expect(list.map((m) => m.id)).toEqual(['chatgpt-4o-latest', 'gpt-4o', 'o3-mini']);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/models');
  });

  it('lists everything for compatible servers and returns [] on failure', async () => {
    const { fetchImpl } = fakeFetch(() => Response.json(models));
    const settings = { apiKey: '', baseUrl: 'http://localhost:11434/v1', model: '' };
    expect(await createOpenAiProvider(compatible, fetchImpl).listModels(settings)).toHaveLength(6);
    const broken = fakeFetch(() => new Response('nope', { status: 500 }));
    expect(await createOpenAiProvider(compatible, broken.fetchImpl).listModels(settings)).toEqual(
      [],
    );
  });
});
