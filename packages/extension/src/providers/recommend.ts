import type { ModelOption, ProviderId } from './types';

/**
 * Model families to prefer, best first: fast, cheap and good at tool use. Patterns name families,
 * never versions, so a newer model is picked as soon as the provider lists it; within a family
 * the highest version wins. Previews and aliases (`-preview`, `-latest`) are skipped.
 */
const PREFERENCES: Partial<Record<ProviderId, RegExp[]>> = {
  gemini: [/^gemini-[\d.]+-flash-lite$/, /^gemini-[\d.]+-flash$/],
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
