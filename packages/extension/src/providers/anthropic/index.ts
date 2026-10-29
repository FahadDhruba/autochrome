import Anthropic from '@anthropic-ai/sdk';
import type { ModelOption, Provider, ProviderEvent, ProviderSettings } from '../types';
import { describeError } from './errors';
import { parseStream } from './stream';
import { toAnthropicMessages, toAnthropicSystem, toAnthropicTools } from './translate';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const MAX_OUTPUT_TOKENS = 8192;

export const STATIC_MODELS: ModelOption[] = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
];

function createClient(settings: ProviderSettings, fetchImpl?: typeof fetch): Anthropic {
  return new Anthropic({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined,
    dangerouslyAllowBrowser: true,
    fetch: fetchImpl,
  });
}

/** `fetchImpl` is for tests. */
export function createAnthropicProvider(fetchImpl?: typeof fetch): Provider {
  return {
    id: 'anthropic',

    async listModels(settings) {
      try {
        const page = await createClient(settings, fetchImpl).models.list({ limit: 100 });
        const models = page.data.map((model) => ({ id: model.id, label: model.display_name }));
        return models.length > 0 ? models : STATIC_MODELS;
      } catch {
        return STATIC_MODELS;
      }
    },

    async *stream(req): AsyncGenerator<ProviderEvent> {
      if (!req.settings.apiKey) {
        yield { type: 'error', message: 'No API key set. Add one in Settings.' };
        return;
      }
      try {
        const events = await createClient(req.settings, fetchImpl).messages.create(
          {
            model: req.model,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: toAnthropicSystem(req.system),
            tools: toAnthropicTools(req.tools),
            messages: toAnthropicMessages(req.messages),
            stream: true,
          },
          { signal: req.signal },
        );
        yield* parseStream(events);
      } catch (error) {
        yield { type: 'error', message: describeError(error) };
      }
    },
  };
}
