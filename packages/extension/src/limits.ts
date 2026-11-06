import { browser } from 'wxt/browser';
import { MAX_STEPS } from './agent/protocol';
import type { ProviderId, Usage } from './providers/types';

/** How far one task may go. `maxTokens` 0 means no limit. */
export type Limits = { maxSteps: number; maxTokens: number };
/** USD per million tokens, as the user's provider charges for a model. */
export type Price = { input: number; output: number };

const LIMITS_KEY = 'limits';
const PRICES_KEY = 'prices';
export const DEFAULT_LIMITS: Limits = { maxSteps: MAX_STEPS, maxTokens: 0 };

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

export function parseLimits(value: unknown): Limits {
  const v = (value ?? {}) as Partial<Limits>;
  return {
    maxSteps: clampInt(v.maxSteps, 1, 200, DEFAULT_LIMITS.maxSteps),
    maxTokens: clampInt(v.maxTokens, 0, 100_000_000, 0),
  };
}

export async function loadLimits(): Promise<Limits> {
  return parseLimits((await browser.storage.local.get(LIMITS_KEY))[LIMITS_KEY]);
}

export async function saveLimits(limits: Limits): Promise<void> {
  await browser.storage.local.set({ [LIMITS_KEY]: parseLimits(limits) });
}

const priceKey = (providerId: ProviderId, model: string) => `${providerId}/${model}`;

export async function loadPrices(): Promise<Record<string, Price>> {
  const stored = (await browser.storage.local.get(PRICES_KEY))[PRICES_KEY];
  return stored && typeof stored === 'object' ? (stored as Record<string, Price>) : {};
}

export const priceOf = (
  prices: Record<string, Price>,
  providerId: ProviderId,
  model: string,
): Price | undefined => prices[priceKey(providerId, model)];

/** Saves the price of one model; an empty price removes it. */
export async function savePrice(
  providerId: ProviderId,
  model: string,
  price: Price | undefined,
): Promise<void> {
  const prices = await loadPrices();
  const key = priceKey(providerId, model);
  if (price && (price.input > 0 || price.output > 0)) prices[key] = price;
  else delete prices[key];
  await browser.storage.local.set({ [PRICES_KEY]: prices });
}

export const isLimitsChange = (changes: Record<string, unknown>, area: string) =>
  area === 'local' && (LIMITS_KEY in changes || PRICES_KEY in changes);

/**
 * The cost of a task in USD. Cached input is charged at the input price, so with caching the real
 * cost is lower; the estimate never undercounts.
 */
export function estimateCost(usage: Usage, price: Price): number {
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

export function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}
