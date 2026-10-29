import { describe, expect, it } from 'vitest';
import { describeHttpError, providerFetch } from './http';

describe('describeHttpError', () => {
  it.each([
    [401, /key was rejected/],
    [403, /not allowed/],
    [404, /not found/],
    [429, /Rate limit/],
    [503, /unavailable/],
  ])('maps %i', (status, pattern) => {
    expect(describeHttpError('Acme', status, '')).toMatch(pattern);
  });

  it('includes the provider message from JSON and plain bodies', () => {
    expect(describeHttpError('Acme', 400, '{"error":{"message":"bad field"}}')).toBe(
      'Acme returned HTTP 400. Acme said: bad field',
    );
    expect(describeHttpError('Acme', 429, 'slow down')).toContain('Acme said: slow down');
  });
});

describe('providerFetch', () => {
  const target = (fetchImpl: typeof fetch, signal = new AbortController().signal) => ({
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    signal,
    fetchImpl,
  });

  it('reports an unreachable server with its label and URL', async () => {
    const failing = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    await expect(providerFetch(target(failing), 'http://x', {})).rejects.toThrow(
      'Could not reach Ollama at http://localhost:11434/v1',
    );
  });

  it('reports a stop instead of a network failure when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const failing = (() => Promise.reject(new Error('aborted'))) as typeof fetch;
    await expect(providerFetch(target(failing, controller.signal), 'http://x', {})).rejects.toThrow(
      'Stopped.',
    );
  });
});
