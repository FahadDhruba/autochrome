export const SAFETY_MODES = ['ask', 'per-site', 'auto'] as const;
export type SafetyMode = (typeof SAFETY_MODES)[number];
export type SafetySettings = { mode: SafetyMode; sites: string[] };

export const DEFAULT_MODE: SafetyMode = 'per-site';

const MODE_KEY = 'safety.mode';
const SITES_KEY = 'safety.sites';

export const parseMode = (value: unknown): SafetyMode =>
  SAFETY_MODES.includes(value as SafetyMode) ? (value as SafetyMode) : DEFAULT_MODE;

export const parseSites = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((site): site is string => typeof site === 'string') : [];

export async function loadSafety(): Promise<SafetySettings> {
  const stored = await browser.storage.local.get([MODE_KEY, SITES_KEY]);
  return { mode: parseMode(stored[MODE_KEY]), sites: parseSites(stored[SITES_KEY]) };
}

export async function saveMode(mode: SafetyMode): Promise<void> {
  await browser.storage.local.set({ [MODE_KEY]: mode });
}

export async function addSite(site: string): Promise<void> {
  const { sites } = await loadSafety();
  if (!sites.includes(site)) await browser.storage.local.set({ [SITES_KEY]: [...sites, site] });
}

export async function removeSite(site: string): Promise<void> {
  const { sites } = await loadSafety();
  await browser.storage.local.set({ [SITES_KEY]: sites.filter((s) => s !== site) });
}

export async function clearSites(): Promise<void> {
  await browser.storage.local.set({ [SITES_KEY]: [] });
}

export function isSafetyChange(changes: Record<string, unknown>, area: string): boolean {
  return area === 'local' && (MODE_KEY in changes || SITES_KEY in changes);
}
