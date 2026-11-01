import { createAnthropicProvider, DEFAULT_MODEL as ANTHROPIC_DEFAULT_MODEL } from './anthropic';
import { DEFAULT_BASE_URL as GEMINI_BASE_URL } from './gemini';
import { isLiveModelId } from './gemini-live';
import { createGoogleProvider } from './google';
import { createOpenAiProvider } from './openai';
import type { Provider, ProviderId } from './types';

export type ProviderInfo = {
  id: ProviderId;
  provider: Provider;
  label: string;
  needsKey: boolean;
  /** Used when no base URL is saved. Empty means the user has to supply one. */
  defaultBaseUrl: string;
  defaultModel: string;
  /** One line shown under the model picker for models that behave differently. */
  modelNote?: (model: string) => string | undefined;
};

const OPENAI_URL = 'https://api.openai.com/v1';

export const PROVIDER_IDS: ProviderId[] = ['anthropic', 'openai', 'gemini', 'compatible'];

export const providers: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    provider: createAnthropicProvider(),
    label: 'Anthropic',
    needsKey: true,
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: ANTHROPIC_DEFAULT_MODEL,
  },
  openai: {
    id: 'openai',
    provider: createOpenAiProvider({ id: 'openai', label: 'OpenAI', defaultBaseUrl: OPENAI_URL }),
    label: 'OpenAI',
    needsKey: true,
    defaultBaseUrl: OPENAI_URL,
    defaultModel: '',
  },
  gemini: {
    id: 'gemini',
    provider: createGoogleProvider(),
    label: 'Gemini',
    needsKey: true,
    defaultBaseUrl: GEMINI_BASE_URL,
    defaultModel: '',
    modelNote: (model) =>
      isLiveModelId(model)
        ? 'Live model: answers are transcripts of spoken replies; expect about 4 s per step.'
        : undefined,
  },
  compatible: {
    id: 'compatible',
    provider: createOpenAiProvider({
      id: 'compatible',
      label: 'OpenAI-compatible server',
      defaultBaseUrl: '',
    }),
    label: 'OpenAI-compatible',
    needsKey: false,
    defaultBaseUrl: '',
    defaultModel: '',
  },
};

/** Base URL presets for the compatible provider. */
export const COMPATIBLE_PRESETS = [
  { label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
];
