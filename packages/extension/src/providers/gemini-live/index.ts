import { describeFailure, providerFetch } from '../http';
import type { ModelOption, Provider, ProviderEvent } from '../types';
import { toGeminiTools } from '../gemini/translate';
import { runSession } from './session';
import { browserSocket, type SocketFactory } from './socket';
import { toLiveTurns } from './translate';

export const DEFAULT_BASE_URL = 'wss://generativelanguage.googleapis.com';
export const DEFAULT_MODEL = 'gemini-3.8-live';
const LABEL = 'Gemini Live';
const SOCKET_PATH = 'ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const socketRoot = (baseUrl: string) => (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
const restRoot = (baseUrl: string) => `${socketRoot(baseUrl).replace(/^ws/, 'http')}/v1beta`;

type ListedModel = {
  name?: string;
  displayName?: string;
  thinking?: boolean;
  supportedGenerationMethods?: string[];
};

const isLiveModel = (model: ListedModel) =>
  /live/.test(model.name ?? '') &&
  !/translate|transcribe/.test(model.name ?? '') &&
  model.supportedGenerationMethods?.includes('bidiGenerateContent');

/** `createSocket` and `fetchImpl` are for tests. */
export function createGeminiLiveProvider(
  createSocket: SocketFactory = browserSocket,
  fetchImpl?: typeof fetch,
): Provider {
  // Which models need a thinking level, learned from the model list.
  const thinkingModels = new Map<string, boolean>();

  return {
    id: 'gemini-live',

    async listModels(settings): Promise<ModelOption[]> {
      const root = restRoot(settings.baseUrl);
      try {
        const response = await providerFetch(
          { label: LABEL, baseUrl: root, signal: AbortSignal.timeout(10_000), fetchImpl },
          `${root}/models?pageSize=1000`,
          { headers: { 'x-goog-api-key': settings.apiKey } },
        );
        const body = (await response.json()) as { models?: ListedModel[] };
        return (body.models ?? [])
          .filter(isLiveModel)
          .map((model) => {
            const id = model.name!.replace(/^models\//, '');
            thinkingModels.set(id, model.thinking === true);
            const label = model.displayName || id;
            return { id, label: model.thinking ? `${label} (experimental)` : label };
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
      const base = socketRoot(req.settings.baseUrl);
      const thinking = thinkingModels.get(req.model) ?? req.model.includes('thinking');
      try {
        const socket = createSocket(
          `${base}/${SOCKET_PATH}?key=${encodeURIComponent(req.settings.apiKey)}`,
        );
        yield* runSession({
          socket,
          baseUrl: base,
          signal: req.signal,
          turns: toLiveTurns(req.messages),
          setup: {
            model: `models/${req.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              ...(thinking && { thinkingConfig: { thinkingLevel: 'low' } }),
            },
            outputAudioTranscription: {},
            systemInstruction: { parts: [{ text: req.system }] },
            tools: toGeminiTools(req.tools),
          },
        });
      } catch (error) {
        yield { type: 'error', message: describeFailure(error, req.signal) };
      }
    },
  };
}
