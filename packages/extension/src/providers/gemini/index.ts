import { describeFailure, providerFetch, ProviderError } from '../http';
import type { ModelOption, Provider, ProviderEvent } from '../types';
import { parseStream } from './stream';
import { toGeminiContents, toGeminiTools } from './translate';

export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
export const MAX_OUTPUT_TOKENS = 8192;
const LABEL = 'Gemini';

const apiRoot = (baseUrl: string) => `${(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/v1beta`;

/** `fetchImpl` is for tests. */
export function createGeminiProvider(fetchImpl?: typeof fetch): Provider {
  return {
    id: 'gemini',

    async listModels(settings): Promise<ModelOption[]> {
      const root = apiRoot(settings.baseUrl);
      try {
        const response = await providerFetch(
          { label: LABEL, baseUrl: root, signal: AbortSignal.timeout(10_000), fetchImpl },
          `${root}/models?pageSize=1000`,
          { headers: { 'x-goog-api-key': settings.apiKey } },
        );
        const body = (await response.json()) as {
          models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
        };
        return (body.models ?? [])
          .filter(
            (model) => model.name && model.supportedGenerationMethods?.includes('generateContent'),
          )
          .map((model) => {
            const id = model.name!.replace(/^models\//, '');
            return { id, label: model.displayName || id };
          })
          .sort((a, b) => a.id.localeCompare(b.id));
      } catch {
        return [];
      }
    },

    async *stream(req): AsyncGenerator<ProviderEvent> {
      if (!req.settings.apiKey) {
        yield { type: 'error', message: 'No API key set. Add one in Settings.' };
        return;
      }
      const root = apiRoot(req.settings.baseUrl);
      try {
        const response = await providerFetch(
          { label: LABEL, baseUrl: root, signal: req.signal, fetchImpl },
          `${root}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': req.settings.apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: req.system }] },
              contents: toGeminiContents(req.messages),
              tools: toGeminiTools(req.tools),
              generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
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
