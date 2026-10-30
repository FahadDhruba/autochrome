import { createAnthropicProvider, DEFAULT_MODEL as ANTHROPIC_DEFAULT_MODEL } from './anthropic';
import { createGeminiProvider, DEFAULT_BASE_URL as GEMINI_BASE_URL } from './gemini';
import {
  createGeminiLiveProvider,
  DEFAULT_BASE_URL as GEMINI_LIVE_BASE_URL,
  DEFAULT_MODEL as GEMINI_LIVE_MODEL,
} from './gemini-live';
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
  /** Another provider whose API key is used when this one has none. */
  keyFallback?: ProviderId;
  /** One line shown under the provider's settings. */
  note?: string;
};

const OPENAI_URL = 'https://api.openai.com/v1';

export const PROVIDER_IDS: ProviderId[] = [
  'anthropic',
  'openai',
  'gemini',
  'gemini-live',
  'compatible',
];

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
    provider: createGeminiProvider(),
    label: 'Gemini',
    needsKey: true,
    defaultBaseUrl: GEMINI_BASE_URL,
    defaultModel: '',
  },
  'gemini-live': {
    id: 'gemini-live',
    provider: createGeminiLiveProvider(),
    label: 'Gemini Live',
    needsKey: true,
    defaultBaseUrl: GEMINI_LIVE_BASE_URL,
    defaultModel: GEMINI_LIVE_MODEL,
    keyFallback: 'gemini',
    note: 'Answers are transcripts of spoken replies; expect about 4 s per step.',
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
