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
  return fromStored(id, await browser.storage.local.get(Object.values(keys(id))));
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

const LEGACY_LIVE = 'gemini-live';

/**
 * Storage changes for 1.3.0, where Gemini Live became part of Gemini: the default provider, chats
 * and schedules that used `gemini-live` move to `gemini` (keeping the Live model), a Live-only key
 * becomes the Gemini key, and the `gemini-live.*` keys are removed. Safe to run more than once.
 */
export function migrateLegacyProviders(stored: Record<string, unknown>): {
  set: Record<string, unknown>;
  remove: string[];
} {
  const set: Record<string, unknown> = {};
  const liveModel = text(stored[`${LEGACY_LIVE}.model`]) || 'gemini-3.8-live';
  if (stored[DEFAULT_PROVIDER] === LEGACY_LIVE) {
    set[DEFAULT_PROVIDER] = 'gemini';
    set['gemini.model'] = liveModel;
  }
  const liveKey = text(stored[`${LEGACY_LIVE}.apiKey`]);
  if (liveKey && !text(stored['gemini.apiKey'])) set['gemini.apiKey'] = liveKey;
  for (const [key, value] of Object.entries(stored)) {
    const record = value as { providerId?: unknown; run?: { providerId?: unknown } } | null;
    if (key.startsWith('chat:') && record?.providerId === LEGACY_LIVE) {
      set[key] = { ...record, providerId: 'gemini' };
    } else if (key.startsWith('schedule:') && record?.run?.providerId === LEGACY_LIVE) {
      set[key] = { ...record, run: { ...record.run, providerId: 'gemini' } };
    }
  }
  const remove = Object.keys(stored).filter((key) => key.startsWith(`${LEGACY_LIVE}.`));
  return { set, remove };
}

export async function runStorageMigrations(): Promise<void> {
  const { set, remove } = migrateLegacyProviders(await browser.storage.local.get(null));
  if (Object.keys(set).length) await browser.storage.local.set(set);
  if (remove.length) await browser.storage.local.remove(remove);
}
