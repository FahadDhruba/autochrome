import type { ProviderEvent, ProviderSettings, StreamRequest } from './types';

/** Helpers shared by the adapter tests. */
export const sseBody = (...events: (object | string)[]): string =>
  events
    .map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)
    .join('');

export function sseResponse(body: string): Response {
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

export type RecordedCall = { url: string; headers: Headers; body: Record<string, unknown> };

export function fakeFetch(respond: (call: RecordedCall) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const text = typeof init?.body === 'string' ? init.body : '';
    const call: RecordedCall = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export const testSettings: ProviderSettings = { apiKey: 'key', baseUrl: '', model: 'm' };

export const streamRequest = (overrides: Partial<StreamRequest> = {}): StreamRequest => ({
  settings: testSettings,
  model: 'm',
  system: 'sys',
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
  tools: [{ name: 'tab_open', description: 'Open', inputSchema: { type: 'object' } }],
  signal: new AbortController().signal,
  ...overrides,
});

export async function collect(iterable: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}
