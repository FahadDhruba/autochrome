import type { ModelOption, ProviderId } from './types';

/** Preferred models, best first: fast, cheap and good at tool use. */
const PREFERENCES: Partial<Record<ProviderId, RegExp[]>> = {
  gemini: [/^gemini-3\.5-flash-lite$/, /^gemini-[\d.]+-flash-lite$/, /^gemini-[\d.]+-flash$/],
  openai: [/^gpt-[\d.]+-mini$/, /^gpt-[\d.]+$/],
  anthropic: [/sonnet/, /haiku/],
};

/** The model to start with when a provider is first set up, from the models it offers. */
export function recommendedModel(id: ProviderId, models: ModelOption[], fallback = ''): string {
  for (const pattern of PREFERENCES[id] ?? []) {
    const match = models
      .map((model) => model.id)
      .filter((model) => pattern.test(model))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
    if (match) return match;
  }
  return fallback || models[0]?.id || '';
}
