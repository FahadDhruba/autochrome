import { createGeminiProvider } from './gemini';
import { createGeminiLiveProvider, isLiveModelId } from './gemini-live';
import type { Provider } from './types';

/** The Live API lives on the same host as the REST API, over WebSocket. */
const toSocketBase = (baseUrl: string) => baseUrl.replace(/^http/, 'ws');

/**
 * Gemini as one provider: Live-only models go over the Live API's WebSocket, every other model
 * over the REST API. Both use the same key and base URL.
 */
export function createGoogleProvider(
  rest: Provider = createGeminiProvider(),
  live: Provider = createGeminiLiveProvider(),
): Provider {
  return {
    id: 'gemini',

    async listModels(settings) {
      const liveSettings = { ...settings, baseUrl: toSocketBase(settings.baseUrl) };
      const [restModels, liveModels] = await Promise.all([
        rest.listModels(settings),
        live.listModels(liveSettings),
      ]);
      return [...restModels, ...liveModels.filter((m) => !restModels.some((r) => r.id === m.id))];
    },

    stream(req) {
      if (!isLiveModelId(req.model)) return rest.stream(req);
      return live.stream({
        ...req,
        settings: { ...req.settings, baseUrl: toSocketBase(req.settings.baseUrl) },
      });
    },
  };
}
