import { afterEach, describe, expect, it, vi } from 'vitest';
import { collect, fakeFetch, streamRequest } from '../testing';
import { fakeSocket } from './fakeSocket';
import { createGeminiLiveProvider } from './index';

const request = (overrides = {}) => streamRequest({ model: 'gemini-3.8-live', ...overrides });

/** Starts the stream, opens the socket and answers setup, as the server would. */
function run(overrides = {}, serverAfterTurn: (fake: ReturnType<typeof fakeSocket>) => void) {
  const fake = fakeSocket((message) => {
    if (message.setup) queueMicrotask(() => fake.emit({ setupComplete: {} }));
    if (message.clientContent) queueMicrotask(() => serverAfterTurn(fake));
  });
  const events = collect(createGeminiLiveProvider(fake.factory).stream(request(overrides)));
  queueMicrotask(() => fake.open());
  return { fake, events };
}

afterEach(() => vi.useRealTimers());

describe('Gemini Live stream', () => {
  it('sets up an audio session with transcription, then sends the history as one turn', async () => {
    const { fake, events } = run({}, (f) => {
      f.emit({ serverContent: { outputTranscription: { text: 'Hel' } } });
      f.emit({ serverContent: { outputTranscription: { text: 'lo' } } });
      f.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AUDIO' } }] } } });
      f.emit({
        usageMetadata: { promptTokenCount: 50, responseTokenCount: 6, thoughtsTokenCount: 4 },
      });
      f.emit({ serverContent: { turnComplete: true } });
    });
    expect(await events).toEqual([
      { type: 'text_delta', text: 'Hel' },
      { type: 'text_delta', text: 'lo' },
      { type: 'done', stopReason: 'end', usage: { inputTokens: 50, outputTokens: 10 } },
    ]);
    expect(fake.urls[0]).toBe(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=key',
    );
    expect(fake.sent[0]).toEqual({
      setup: {
        model: 'models/gemini-3.8-live',
        generationConfig: { responseModalities: ['AUDIO'] },
        outputAudioTranscription: {},
        systemInstruction: { parts: [{ text: 'sys' }] },
        tools: [
          {
            functionDeclarations: [
              { name: 'tab_open', description: 'Open', parametersJsonSchema: { type: 'object' } },
            ],
          },
        ],
      },
    });
    expect(fake.sent[1]).toEqual({
      clientContent: { turns: [{ role: 'user', parts: [{ text: 'hi' }] }], turnComplete: true },
    });
    expect(fake.closedWith).toBe(1000);
  });

  it('adds a thinking level only for thinking models', async () => {
    const answer = (f: ReturnType<typeof fakeSocket>) =>
      f.emit({ serverContent: { turnComplete: true } });
    const thinking = run({ model: 'gemini-3.8-live-extended-thinking' }, answer);
    await thinking.events;
    expect(thinking.fake.sent[0]).toMatchObject({
      setup: { generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } },
    });
  });

  it('emits every function call, then finishes as tool_use without waiting for turnComplete', async () => {
    const { events } = run({}, (f) =>
      f.emit({
        toolCall: {
          functionCalls: [
            { id: 'fc1', name: 'tab_open', args: { url: 'http://x' } },
            { name: 'read_page' },
          ],
        },
      }),
    );
    expect(await events).toEqual([
      { type: 'tool_call', id: 'fc1', name: 'tab_open', input: { url: 'http://x' } },
      { type: 'tool_call', id: 'live-call-1', name: 'read_page', input: {} },
      { type: 'done', stopReason: 'tool_use', usage: undefined },
    ]);
  });

  it('reads JSON sent as binary frames', async () => {
    const { events } = run({}, (f) =>
      f.emit(
        new TextEncoder().encode(JSON.stringify({ serverContent: { turnComplete: true } }))
          .buffer as ArrayBuffer,
      ),
    );
    expect(await events).toEqual([{ type: 'done', stopReason: 'end', usage: undefined }]);
  });

  it.each([
    [1007, 'Request contains an invalid argument', /does not support this model/],
    [1008, 'API key not valid', /rejected the API key/],
    [1011, 'Resource has been exhausted (quota)', /quota or rate limit/],
    [1006, '', /Could not reach Gemini Live at wss:\/\/generativelanguage\.googleapis\.com/],
  ])('turns close code %i into a readable error', async (code, reason, pattern) => {
    const fake = fakeSocket();
    const events = collect(createGeminiLiveProvider(fake.factory).stream(request()));
    queueMicrotask(() => fake.close(code, reason));
    const [error] = await events;
    expect(error).toMatchObject({ type: 'error', message: expect.stringMatching(pattern) });
    expect(JSON.stringify(error)).not.toContain('key=');
  });

  it('reports a clean close before an answer as an error', async () => {
    const fake = fakeSocket();
    const events = collect(createGeminiLiveProvider(fake.factory).stream(request()));
    queueMicrotask(() => fake.close(1000));
    expect(await events).toEqual([
      { type: 'error', message: 'Gemini Live ended the session before answering.' },
    ]);
  });

  it('errors after 60 s of silence', async () => {
    vi.useFakeTimers();
    const fake = fakeSocket();
    const events = collect(createGeminiLiveProvider(fake.factory).stream(request()));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await events).toEqual([
      { type: 'error', message: 'Gemini Live did not answer in time. Try again.' },
    ]);
    expect(fake.closedWith).toBe(1000);
  });

  it('closes the socket when aborted', async () => {
    const controller = new AbortController();
    const fake = fakeSocket();
    const events = collect(
      createGeminiLiveProvider(fake.factory).stream(request({ signal: controller.signal })),
    );
    queueMicrotask(() => controller.abort());
    expect(await events).toEqual([{ type: 'error', message: 'Stopped.' }]);
    expect(fake.closedWith).toBe(1000);
  });

  it('needs an API key and uses the base URL setting', async () => {
    const fake = fakeSocket();
    const provider = createGeminiLiveProvider(fake.factory);
    expect(
      await collect(
        provider.stream(request({ settings: { apiKey: '', baseUrl: '', model: 'm' } })),
      ),
    ).toEqual([{ type: 'error', message: 'No API key set. Add one in Settings.' }]);
    const events = collect(
      provider.stream(
        request({ settings: { apiKey: 'k y', baseUrl: 'ws://127.0.0.1:9/', model: 'm' } }),
      ),
    );
    queueMicrotask(() => fake.close(1000));
    await events;
    expect(fake.urls[0]).toMatch(/^ws:\/\/127\.0\.0\.1:9\/ws\/.*BidiGenerateContent\?key=k%20y$/);
  });
});

describe('Gemini Live listModels', () => {
  const models = {
    models: [
      {
        name: 'models/gemini-3.8-live',
        displayName: 'Gemini 3.8 Live',
        supportedGenerationMethods: ['bidiGenerateContent'],
      },
      {
        name: 'models/gemini-3.8-live-extended-thinking',
        thinking: true,
        supportedGenerationMethods: ['bidiGenerateContent'],
      },
      { name: 'models/live-translate', supportedGenerationMethods: ['bidiGenerateContent'] },
      { name: 'models/live-transcribe', supportedGenerationMethods: ['bidiGenerateContent'] },
      { name: 'models/gemini-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/live-text-only', supportedGenerationMethods: ['generateContent'] },
    ],
  };

  it('keeps Live models, marks thinking ones experimental, and uses the REST root', async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json(models));
    const result = await createGeminiLiveProvider(undefined, fetchImpl).listModels({
      apiKey: 'k',
      baseUrl: '',
      model: '',
    });
    expect(result).toEqual([
      { id: 'gemini-3.8-live', label: 'Gemini 3.8 Live' },
      {
        id: 'gemini-3.8-live-extended-thinking',
        label: 'gemini-3.8-live-extended-thinking (experimental)',
      },
    ]);
    expect(calls[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    );
  });

  it('returns nothing when the request fails', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('no', { status: 403 }));
    expect(
      await createGeminiLiveProvider(undefined, fetchImpl).listModels({
        apiKey: 'k',
        baseUrl: '',
        model: '',
      }),
    ).toEqual([]);
  });
});
