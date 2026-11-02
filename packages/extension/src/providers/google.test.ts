import { describe, expect, it } from 'vitest';
import type { Provider, StreamRequest } from './types';
import { createGoogleProvider } from './google';

const fake = (name: string, models: string[], seen: StreamRequest[]): Provider => ({
  id: 'gemini',
  listModels: async () => models.map((id) => ({ id, label: id })),
  async *stream(req) {
    seen.push(req);
    yield { type: 'text_delta', text: name };
  },
});

const request = (model: string, baseUrl = '') =>
  ({
    model,
    settings: { apiKey: 'k', baseUrl, model },
    messages: [],
    tools: [],
    system: '',
  }) as unknown as StreamRequest;

describe('createGoogleProvider', () => {
  it('sends Live models to the Live API and everything else to REST', async () => {
    const restSeen: StreamRequest[] = [];
    const liveSeen: StreamRequest[] = [];
    const google = createGoogleProvider(fake('rest', [], restSeen), fake('live', [], liveSeen));
    for (const model of [
      'gemini-3.5-flash-lite',
      'gemini-3.8-live',
      'gemini-3.1-flash-live-preview',
    ]) {
      for await (const _ of google.stream(request(model, 'https://example.test'))) void _;
    }
    expect(restSeen.map((r) => r.model)).toEqual(['gemini-3.5-flash-lite']);
    expect(liveSeen.map((r) => r.model)).toEqual([
      'gemini-3.8-live',
      'gemini-3.1-flash-live-preview',
    ]);
    expect(liveSeen[0]!.settings.baseUrl).toBe('wss://example.test');
  });

  it('lists REST and Live models together without duplicates', async () => {
    const google = createGoogleProvider(
      fake('rest', ['gemini-3.5-flash-lite', 'both'], []),
      fake('live', ['gemini-3.8-live', 'both'], []),
    );
    const models = await google.listModels({ apiKey: 'k', baseUrl: '', model: '' });
    expect(models.map((m) => m.id)).toEqual(['gemini-3.5-flash-lite', 'both', 'gemini-3.8-live']);
  });
});
