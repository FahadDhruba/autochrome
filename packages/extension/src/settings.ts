import { DEFAULT_MODEL } from './providers/anthropic';
import type { ProviderSettings } from './providers/types';

const API_KEY = 'anthropic.apiKey';
const BASE_URL = 'anthropic.baseUrl';
const MODEL = 'anthropic.model';

export async function loadProviderSettings(): Promise<ProviderSettings> {
  const stored = await browser.storage.local.get([API_KEY, BASE_URL, MODEL]);
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return {
    apiKey: text(stored[API_KEY]),
    baseUrl: text(stored[BASE_URL]),
    model: text(stored[MODEL]) || DEFAULT_MODEL,
  };
}

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  await browser.storage.local.set({
    [API_KEY]: settings.apiKey.trim(),
    [BASE_URL]: settings.baseUrl.trim(),
    [MODEL]: settings.model,
  });
}
