import type { ProviderEvent, Usage } from '../types';

type ServerMessage = {
  setupComplete?: object;
  serverContent?: { outputTranscription?: { text?: string }; turnComplete?: boolean };
  toolCall?: { functionCalls?: { id?: string; name?: string; args?: unknown }[] };
  usageMetadata?: {
    promptTokenCount?: number;
    responseTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};

export type LiveState = { usage?: Usage; calls: number };

export type Mapped = { events: ProviderEvent[]; setupComplete?: boolean; finished?: boolean };

/** Audio data is ignored; the transcription is the answer. Thinking is billed as output. */
function toUsage(metadata: NonNullable<ServerMessage['usageMetadata']>): Usage {
  return {
    inputTokens: metadata.promptTokenCount ?? 0,
    outputTokens: (metadata.responseTokenCount ?? 0) + (metadata.thoughtsTokenCount ?? 0),
  };
}

/** Turns one server message into provider events; `finished` means the step is over. */
export function mapServerMessage(message: ServerMessage, state: LiveState): Mapped {
  if (message.usageMetadata) state.usage = toUsage(message.usageMetadata);
  if (message.setupComplete) return { events: [], setupComplete: true };

  const events: ProviderEvent[] = [];
  const text = message.serverContent?.outputTranscription?.text;
  if (text) events.push({ type: 'text_delta', text });

  const calls = message.toolCall?.functionCalls ?? [];
  for (const call of calls) {
    if (!call.name) continue;
    events.push({
      type: 'tool_call',
      id: call.id || `live-call-${state.calls}`,
      name: call.name,
      input: call.args ?? {},
    });
    state.calls++;
  }
  if (calls.length > 0) {
    events.push({ type: 'done', stopReason: 'tool_use', usage: state.usage });
    return { events, finished: true };
  }
  if (message.serverContent?.turnComplete) {
    events.push({ type: 'done', stopReason: 'end', usage: state.usage });
    return { events, finished: true };
  }
  return { events };
}

/** The server's close reason, made readable for the common failures. */
export function describeClose(code: number, reason: string, baseUrl: string): string {
  if (code === 1006) return `Could not reach Gemini Live at ${baseUrl}. Is it reachable?`;
  const detail = reason.trim();
  const lower = detail.toLowerCase();
  let short: string;
  if (/quota|exhausted|rate/.test(lower)) short = 'Gemini Live quota or rate limit reached.';
  else if (/api key|permission|unauthenticated|credential/.test(lower) || code === 1008) {
    short = 'Gemini Live rejected the API key or the request. Check the key and model in Settings.';
  } else if (/not (found|supported)|modalit|unsupported/.test(lower) || code === 1007) {
    short = 'Gemini Live does not support this model or its response mode.';
  } else short = `Gemini Live closed the connection (code ${code}).`;
  return detail ? `${short} Gemini said: ${detail}` : short;
}
