import { describe, expect, it } from 'vitest';
import { isProviderReady, migrateLegacyProviders } from './settings';

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

describe('migrateLegacyProviders', () => {
  it('moves a Gemini Live default, key, chats and schedules to Gemini', () => {
    const { set, remove } = migrateLegacyProviders({
      defaultProvider: 'gemini-live',
      'gemini-live.apiKey': 'live-key',
      'gemini-live.model': 'gemini-3.8-live',
      'chat:a': { id: 'a', providerId: 'gemini-live', model: 'gemini-3.8-live' },
      'chat:b': { id: 'b', providerId: 'openai' },
      'schedule:s': { id: 's', run: { kind: 'prompt', providerId: 'gemini-live', model: 'x' } },
    });
    expect(set).toEqual({
      defaultProvider: 'gemini',
      'gemini.model': 'gemini-3.8-live',
      'gemini.apiKey': 'live-key',
      'chat:a': { id: 'a', providerId: 'gemini', model: 'gemini-3.8-live' },
      'schedule:s': { id: 's', run: { kind: 'prompt', providerId: 'gemini', model: 'x' } },
    });
    expect(remove).toEqual(['gemini-live.apiKey', 'gemini-live.model']);
  });

  it('keeps an existing Gemini key and does nothing on migrated storage', () => {
    expect(migrateLegacyProviders({ 'gemini.apiKey': 'g', 'gemini-live.apiKey': 'l' }).set).toEqual(
      {},
    );
    expect(
      migrateLegacyProviders({ defaultProvider: 'gemini', 'chat:a': { providerId: 'gemini' } }),
    ).toEqual({ set: {}, remove: [] });
  });
});
