import { describe, expect, it } from 'vitest';
import { isProviderReady } from './settings';

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
