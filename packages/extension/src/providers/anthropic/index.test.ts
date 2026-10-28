import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ProviderEvent, ProviderSettings, StreamRequest } from '../types';
import { createAnthropicProvider, STATIC_MODELS } from './index';

const settings: ProviderSettings = { apiKey: 'sk-test', baseUrl: 'http://mock.test', model: 'm' };

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.sse`, import.meta.url), 'utf8');

function sseResponse(body: string): Response {
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

function fakeFetch(respond: (request: Request) => Response | Promise<Response>) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === 'POST') bodies.push((await request.clone().json()) as never);
    return respond(request);
  };
  return { fetchImpl: fetchImpl as typeof fetch, bodies };
}

const request = (overrides: Partial<StreamRequest> = {}): StreamRequest => ({
  settings,
  model: 'claude-sonnet-5-5',
  system: 'sys',
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
  tools: [{ name: 'tab_open', description: 'Open', inputSchema: { type: 'object' } }],
  signal: new AbortController().signal,
  ...overrides,
});

async function collect(iterable: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe('AnthropicProvider.stream', () => {
  it('parses a text stream with usage', async () => {
    const { fetchImpl, bodies } = fakeFetch(() => sseResponse(fixture('text')));
    const events = await collect(createAnthropicProvider(fetchImpl).stream(request()));
    expect(events).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ', world' },
      {
        type: 'done',
        stopReason: 'end',
        usage: { inputTokens: 35, outputTokens: 12, cacheReadTokens: 100 },
      },
    ]);
    expect(bodies[0]).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 8192, stream: true });
  });

  it('assembles tool calls from input_json_delta, including empty input', async () => {
    const { fetchImpl } = fakeFetch(() => sseResponse(fixture('tool-use')));
    const events = await collect(createAnthropicProvider(fetchImpl).stream(request()));
    expect(events.filter((event) => event.type === 'tool_call')).toEqual([
      {
        type: 'tool_call',
        id: 'toolu_01',
        name: 'tab_open',
        input: { url: 'https://example.com' },
      },
      { type: 'tool_call', id: 'toolu_02', name: 'read_page', input: {} },
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'tool_use' });
  });

  it('sends cache_control on the last tool, the system prompt and the last message', async () => {
    const { fetchImpl, bodies } = fakeFetch(() => sseResponse(fixture('text')));
    await collect(createAnthropicProvider(fetchImpl).stream(request()));
    const body = bodies[0] as {
      tools: { cache_control?: unknown }[];
      system: { cache_control?: unknown }[];
      messages: { content: { cache_control?: unknown }[] }[];
    };
    const ephemeral = { type: 'ephemeral' };
    expect(body.tools.at(-1)?.cache_control).toEqual(ephemeral);
    expect(body.system[0]?.cache_control).toEqual(ephemeral);
    expect(body.messages.at(-1)?.content.at(-1)?.cache_control).toEqual(ephemeral);
  });

  it.each([
    [401, 'The API key was rejected. Check it in Settings.'],
    [429, 'Rate limit reached. Wait a moment and try again.'],
    [529, 'Anthropic is overloaded right now. Try again shortly.'],
  ])('maps HTTP %i to a readable error', async (status, message) => {
    const { fetchImpl } = fakeFetch(
      () =>
        new Response(JSON.stringify({ type: 'error', error: { type: 'x', message: 'raw' } }), {
          status,
          headers: { 'content-type': 'application/json', 'retry-after': '0' },
        }),
    );
    const provider = createAnthropicProvider(fetchImpl);
    const events = await collect(provider.stream(request({ settings: { ...settings } })));
    expect(events).toEqual([{ type: 'error', message }]);
  });

  it('reports a truncated stream and a missing key', async () => {
    const truncated = fixture('text').split('event: message_delta')[0]!;
    const { fetchImpl } = fakeFetch(() => sseResponse(truncated));
    const provider = createAnthropicProvider(fetchImpl);
    expect((await collect(provider.stream(request()))).at(-1)).toMatchObject({ type: 'error' });
    const noKey = await collect(
      provider.stream(request({ settings: { ...settings, apiKey: '' } })),
    );
    expect(noKey).toEqual([{ type: 'error', message: 'No API key set. Add one in Settings.' }]);
  });
});

describe('AnthropicProvider.listModels', () => {
  it('uses the Models API', async () => {
    const { fetchImpl } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            data: [
              {
                type: 'model',
                id: 'claude-x',
                display_name: 'Claude X',
                created_at: '2026-01-01T00:00:00Z',
              },
            ],
            has_more: false,
            first_id: 'claude-x',
            last_id: 'claude-x',
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    expect(await createAnthropicProvider(fetchImpl).listModels(settings)).toEqual([
      { id: 'claude-x', label: 'Claude X' },
    ]);
  });

  it('falls back to the static list on failure', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('nope', { status: 500 }));
    expect(await createAnthropicProvider(fetchImpl).listModels(settings)).toEqual(STATIC_MODELS);
  });
});
