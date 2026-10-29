import { describeFailure, providerFetch, ProviderError } from '../http';
import type { ModelOption, Provider, ProviderEvent, ProviderId, ProviderSettings } from '../types';
import { parseStream } from './stream';
import { toOpenAiMessages, toOpenAiTools } from './translate';

export const MAX_OUTPUT_TOKENS = 8192;

export type OpenAiFlavor = {
  id: Extract<ProviderId, 'openai' | 'compatible'>;
  label: string;
  defaultBaseUrl: string;
};

/** Models the OpenAI list returns that can chat; it also lists embeddings, audio, images, etc. */
const OPENAI_CHAT_MODEL = /^(gpt-|o\d|chatgpt)/;

function headers(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(apiKey && { authorization: `Bearer ${apiKey}` }),
  };
}

/** `fetchImpl` is for tests. */
export function createOpenAiProvider(flavor: OpenAiFlavor, fetchImpl?: typeof fetch): Provider {
  const baseUrlOf = (settings: ProviderSettings) =>
    (settings.baseUrl || flavor.defaultBaseUrl).replace(/\/+$/, '');

  return {
    id: flavor.id,

    async listModels(settings): Promise<ModelOption[]> {
      const baseUrl = baseUrlOf(settings);
      try {
        const response = await providerFetch(
          { label: flavor.label, baseUrl, signal: AbortSignal.timeout(10_000), fetchImpl },
          `${baseUrl}/models`,
          { headers: headers(settings.apiKey) },
        );
        const body = (await response.json()) as { data?: { id?: unknown }[] };
        const ids = (body.data ?? []).flatMap((model) =>
          typeof model.id === 'string' ? [model.id] : [],
        );
        return ids
          .filter((id) => flavor.id !== 'openai' || OPENAI_CHAT_MODEL.test(id))
          .sort()
          .map((id) => ({ id, label: id }));
      } catch {
        return [];
      }
    },

    async *stream(req): AsyncGenerator<ProviderEvent> {
      const baseUrl = baseUrlOf(req.settings);
      if (flavor.id === 'openai' && !req.settings.apiKey) {
        yield { type: 'error', message: 'No API key set. Add one in Settings.' };
        return;
      }
      if (!baseUrl) {
        yield { type: 'error', message: 'No base URL set. Add one in Settings.' };
        return;
      }
      try {
        const response = await providerFetch(
          { label: flavor.label, baseUrl, signal: req.signal, fetchImpl },
          `${baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: headers(req.settings.apiKey),
            body: JSON.stringify({
              model: req.model,
              messages: toOpenAiMessages(req.system, req.messages),
              ...(req.tools.length > 0 && { tools: toOpenAiTools(req.tools) }),
              stream: true,
              stream_options: { include_usage: true },
              // Older local servers only know max_tokens.
              [flavor.id === 'openai' ? 'max_completion_tokens' : 'max_tokens']: MAX_OUTPUT_TOKENS,
            }),
          },
        );
        if (!response.body) throw new ProviderError('The response had no body.');
        yield* parseStream(response.body);
      } catch (error) {
        yield { type: 'error', message: describeFailure(error, req.signal) };
      }
    },
  };
}
