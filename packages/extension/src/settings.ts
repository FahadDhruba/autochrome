import { PROVIDER_IDS, providers } from './providers';
import type { ProviderId, ProviderSettings } from './providers/types';

const DEFAULT_PROVIDER = 'defaultProvider';

export type AllProviderSettings = Record<ProviderId, ProviderSettings>;

const keys = (id: ProviderId) => ({
  apiKey: `${id}.apiKey`,
  baseUrl: `${id}.baseUrl`,
  model: `${id}.model`,
});

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const isProviderId = (value: unknown): value is ProviderId =>
  PROVIDER_IDS.includes(value as ProviderId);

function fromStored(id: ProviderId, stored: Record<string, unknown>): ProviderSettings {
  const k = keys(id);
  return {
    apiKey: text(stored[k.apiKey]),
    baseUrl: text(stored[k.baseUrl]),
    model: text(stored[k.model]) || providers[id].defaultModel,
  };
}

export async function loadProviderSettings(id: ProviderId): Promise<ProviderSettings> {
  const k = keys(id);
  return fromStored(id, await browser.storage.local.get([k.apiKey, k.baseUrl, k.model]));
}

export async function loadAllProviderSettings(): Promise<AllProviderSettings> {
  const stored = await browser.storage.local.get(null);
  return Object.fromEntries(
    PROVIDER_IDS.map((id) => [id, fromStored(id, stored)]),
  ) as AllProviderSettings;
}

export async function saveProviderSettings(
  id: ProviderId,
  settings: ProviderSettings,
): Promise<void> {
  const k = keys(id);
  await browser.storage.local.set({
    [k.apiKey]: settings.apiKey.trim(),
    [k.baseUrl]: settings.baseUrl.trim(),
    [k.model]: settings.model.trim(),
  });
}

export async function loadDefaultProvider(): Promise<ProviderId> {
  const stored = await browser.storage.local.get(DEFAULT_PROVIDER);
  return isProviderId(stored[DEFAULT_PROVIDER]) ? stored[DEFAULT_PROVIDER] : 'anthropic';
}

export async function saveDefaultProvider(id: ProviderId): Promise<void> {
  await browser.storage.local.set({ [DEFAULT_PROVIDER]: id });
}

/** A provider is ready when it has what it needs to connect and a model to ask for. */
export function isProviderReady(id: ProviderId, settings: ProviderSettings): boolean {
  const info = providers[id];
  if (info.needsKey && !settings.apiKey) return false;
  if (!(settings.baseUrl || info.defaultBaseUrl)) return false;
  return settings.model !== '';
}
