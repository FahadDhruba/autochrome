import type { ToolContent } from '@autochrome/shared';

export type Part =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; callId: string; content: ToolContent[]; isError: boolean };

export type ChatMessage = { role: 'user' | 'assistant'; parts: Part[] };

export type ProviderSettings = { apiKey: string; baseUrl: string; model: string };

export type ModelOption = { id: string; label: string };

export type ProviderTool = { name: string; description: string; inputSchema: object };

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens?: number };

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'other';

export type ProviderEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
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
  id: 'anthropic';
  listModels(settings: ProviderSettings): Promise<ModelOption[]>;
  stream(req: StreamRequest): AsyncIterable<ProviderEvent>;
}
