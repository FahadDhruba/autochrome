import type { ToolContent } from '@autochrome/shared';

export type Part =
  | {
      type: 'text';
      text: string;
      signature?: string;
      /** Per-step context (such as the tab state) that must not become part of a cached prefix. */
      volatile?: boolean;
    }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown; signature?: string }
  | { type: 'tool_result'; callId: string; content: ToolContent[]; isError: boolean };

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'compatible';

/** `signature` is provider-opaque (Gemini thought signatures); it is stored and sent back as is. */
export type ChatMessage = { role: 'user' | 'assistant'; parts: Part[] };

export type ProviderSettings = { apiKey: string; baseUrl: string; model: string };

export type ModelOption = { id: string; label: string };

export type ProviderTool = { name: string; description: string; inputSchema: object };

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens?: number };

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'other';

export type ProviderEvent =
  | { type: 'text_delta'; text: string; signature?: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown; signature?: string }
  | { type: 'done'; stopReason: StopReason; usage?: Usage }
  | { type: 'error'; message: string };

export type StreamRequest = {
  settings: ProviderSettings;
  model: string;
  system: string;
  messages: ChatMessage[];
  tools: ProviderTool[];
  signal: AbortSignal;
};

export interface Provider {
  id: ProviderId;
  listModels(settings: ProviderSettings): Promise<ModelOption[]>;
  stream(req: StreamRequest): AsyncIterable<ProviderEvent>;
}
