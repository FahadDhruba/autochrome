import { describe, expect, it } from 'vitest';
import { isProviderReady, withKeyFallbacks, type AllProviderSettings } from './settings';

const settings = (patch: Partial<{ apiKey: string; baseUrl: string; model: string }>) => ({
  apiKey: '',
  baseUrl: '',
  model: 'm',
  ...patch,
});

describe('isProviderReady', () => {
  it('needs a key and a model for hosted providers', () => {
    expect(isProviderReady('openai', settings({ apiKey: 'k' }))).toBe(true);
    expect(isProviderReady('openai', settings({}))).toBe(false);
    expect(isProviderReady('gemini', settings({ apiKey: 'k', model: '' }))).toBe(false);
  });

  it('needs a base URL and a model, but no key, for compatible servers', () => {
    expect(isProviderReady('compatible', settings({ baseUrl: 'http://localhost:11434/v1' }))).toBe(
      true,
    );
    expect(isProviderReady('compatible', settings({}))).toBe(false);
  });
});

describe('withKeyFallbacks', () => {
  const all = (live: string, gemini: string) =>
    ({
      anthropic: settings({}),
      openai: settings({}),
      gemini: settings({ apiKey: gemini }),
      'gemini-live': settings({ apiKey: live }),
      compatible: settings({}),
    }) satisfies AllProviderSettings;

  it('lends the Gemini key to Gemini Live only when it has none', () => {
    expect(withKeyFallbacks(all('', 'g'))['gemini-live'].apiKey).toBe('g');
    expect(withKeyFallbacks(all('own', 'g'))['gemini-live'].apiKey).toBe('own');
    expect(withKeyFallbacks(all('', 'g')).openai.apiKey).toBe('');
  });
});
