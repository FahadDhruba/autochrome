import { describe, expect, it } from 'vitest';
import { collect, fakeFetch, sseBody, sseResponse, streamRequest } from '../testing';
import { createGeminiProvider } from './index';

const candidate = (parts: object[], finishReason?: string) => ({
  candidates: [{ content: { role: 'model', parts }, ...(finishReason && { finishReason }) }],
});

describe('Gemini stream', () => {
  it('streams text and usage, and sends the request in Gemini format', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      sseResponse(
        sseBody(candidate([{ text: 'Hel' }]), {
          ...candidate([{ text: 'lo' }], 'STOP'),
          usageMetadata: {
            promptTokenCount: 120,
            candidatesTokenCount: 8,
            thoughtsTokenCount: 4,
            cachedContentTokenCount: 100,
          },
        }),
      ),
    );
    const events = await collect(
      createGeminiProvider(fetchImpl).stream(streamRequest({ model: 'gemini-x' })),
    );
    expect(events).toEqual([
      { type: 'text_delta', text: 'Hel' },
      { type: 'text_delta', text: 'lo' },
      {
        type: 'done',
        stopReason: 'end',
        usage: { inputTokens: 20, outputTokens: 12, cacheReadTokens: 100 },
      },
    ]);
    expect(calls[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:streamGenerateContent?alt=sse',
    );
    expect(calls[0]!.headers.get('x-goog-api-key')).toBe('key');
    expect(calls[0]!.body).toMatchObject({
      systemInstruction: { parts: [{ text: 'sys' }] },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { maxOutputTokens: 8192 },
      tools: [
        { functionDeclarations: [{ name: 'tab_open', parametersJsonSchema: { type: 'object' } }] },
      ],
    });
  });

  it('emits function calls with signatures and generated ids, finishing as tool_use', async () => {
    const { fetchImpl } = fakeFetch(() =>
      sseResponse(
        sseBody(
          candidate([
            {
              functionCall: { id: 'g9', name: 'tab_open', args: { url: 'http://x' } },
              thoughtSignature: 'sig1',
            },
          ]),
          candidate([{ functionCall: { name: 'read_page' } }], 'STOP'),
        ),
      ),
    );
    const events = await collect(createGeminiProvider(fetchImpl).stream(streamRequest()));
    expect(events[0]).toEqual({
      type: 'tool_call',
      id: 'g9',
      name: 'tab_open',
      input: { url: 'http://x' },
      signature: 'sig1',
    });
    expect(events[1]).toMatchObject({ type: 'tool_call', name: 'read_page', input: {} });
    expect((events[1] as { id: string }).id).toMatch(/^gemini-call-/);
    expect(events[2]).toMatchObject({ type: 'done', stopReason: 'tool_use' });
  });

  it('keeps a signature that arrives on an empty text part and skips thought summaries', async () => {
    const { fetchImpl } = fakeFetch(() =>
      sseResponse(
        sseBody(
          candidate([{ text: 'thinking...', thought: true }, { text: 'Done' }]),
          candidate([{ text: '', thoughtSignature: 'sigEnd' }], 'STOP'),
        ),
      ),
    );
    const events = await collect(createGeminiProvider(fetchImpl).stream(streamRequest()));
    expect(events.slice(0, 2)).toEqual([
      { type: 'text_delta', text: 'Done' },
      { type: 'text_delta', text: '', signature: 'sigEnd' },
    ]);
  });

  it('maps finish reasons', async () => {
    const run = async (reason: string) => {
      const { fetchImpl } = fakeFetch(() =>
        sseResponse(sseBody(candidate([{ text: 'x' }], reason))),
      );
      return (await collect(createGeminiProvider(fetchImpl).stream(streamRequest()))).at(-1);
    };
    expect(await run('MAX_TOKENS')).toMatchObject({ type: 'done', stopReason: 'max_tokens' });
    expect(await run('SAFETY')).toEqual({
      type: 'error',
      message: 'Gemini stopped the response (safety).',
    });
  });

  it('reports a blocked prompt', async () => {
    const { fetchImpl } = fakeFetch(() =>
      sseResponse(sseBody({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } })),
    );
    const [event] = await collect(createGeminiProvider(fetchImpl).stream(streamRequest()));
    expect(event).toEqual({
      type: 'error',
      message: 'Gemini stopped the response (prohibited content).',
    });
  });

  it('maps HTTP errors, a missing key and an unreachable host', async () => {
    const notFound = fakeFetch(
      () => new Response('{"error":{"message":"models/zzz is not found"}}', { status: 404 }),
    );
    const [missing] = await collect(
      createGeminiProvider(notFound.fetchImpl).stream(streamRequest()),
    );
    expect((missing as { message: string }).message).toContain('not found');
    expect((missing as { message: string }).message).toContain('models/zzz is not found');

    const noKey = await collect(
      createGeminiProvider(notFound.fetchImpl).stream(
        streamRequest({ settings: { apiKey: '', baseUrl: '', model: 'm' } }),
      ),
    );
    expect(noKey).toEqual([{ type: 'error', message: 'No API key set. Add one in Settings.' }]);

    const down = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    const [unreachable] = await collect(createGeminiProvider(down).stream(streamRequest()));
    expect((unreachable as { message: string }).message).toContain('Could not reach Gemini at');
  });
});

describe('Gemini listModels', () => {
  it('keeps generateContent models and strips the prefix', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      Response.json({
        models: [
          {
            name: 'models/text-embedding-004',
            displayName: 'Embed',
            supportedGenerationMethods: ['embedContent'],
          },
          {
            name: 'models/gemini-b',
            displayName: 'Gemini B',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-a',
            displayName: 'Gemini A',
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
        ],
      }),
    );
    const list = await createGeminiProvider(fetchImpl).listModels({
      apiKey: 'k',
      baseUrl: 'http://mock/',
      model: '',
    });
    expect(list).toEqual([
      { id: 'gemini-a', label: 'Gemini A' },
      { id: 'gemini-b', label: 'Gemini B' },
    ]);
    expect(calls[0]!.url).toBe('http://mock/v1beta/models?pageSize=1000');
    expect(calls[0]!.headers.get('x-goog-api-key')).toBe('k');
  });

  it('returns [] on failure', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('no', { status: 403 }));
    expect(
      await createGeminiProvider(fetchImpl).listModels({ apiKey: 'k', baseUrl: '', model: '' }),
    ).toEqual([]);
  });
});
