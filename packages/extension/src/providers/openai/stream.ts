import type { ProviderEvent, StopReason, Usage } from '../types';
import { readSse } from '../sse';

type Chunk = {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  } | null;
  error?: { message?: string } | string;
};

type PendingCall = { id: string; name: string; args: string };

const FINISH_REASONS: Record<string, StopReason> = {
  stop: 'end',
  tool_calls: 'tool_use',
  function_call: 'tool_use',
  length: 'max_tokens',
};

function toUsage(usage: NonNullable<Chunk['usage']>): Usage {
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  // prompt_tokens includes cached tokens; Usage.inputTokens does not.
  return {
    inputTokens: Math.max(0, (usage.prompt_tokens ?? 0) - cached),
    outputTokens: usage.completion_tokens ?? 0,
    cacheReadTokens: cached,
  };
}

/** Arguments that are not valid JSON are passed on as the raw string, which the executor reports. */
function parseArguments(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Turns a Chat Completions SSE body into provider-neutral events; throws on read errors. */
export async function* parseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ProviderEvent> {
  const calls = new Map<number, PendingCall>();
  let finishReason: string | undefined;
  let usage: Usage | undefined;
  let received = false;

  for await (const message of readSse(body)) {
    let chunk: Chunk;
    try {
      chunk = JSON.parse(message.data) as Chunk;
    } catch {
      continue;
    }
    received = true;
    if (chunk.error) {
      const text = typeof chunk.error === 'string' ? chunk.error : chunk.error.message;
      yield { type: 'error', message: text || 'The provider reported an error.' };
      return;
    }
    if (chunk.usage) usage = toUsage(chunk.usage);

    const choice = chunk.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta;
    if (delta?.content) yield { type: 'text_delta', text: delta.content };
    for (const piece of delta?.tool_calls ?? []) {
      const index = piece.index ?? 0;
      const call = calls.get(index) ?? { id: '', name: '', args: '' };
      call.id ||= piece.id ?? '';
      call.name += piece.function?.name ?? '';
      call.args += piece.function?.arguments ?? '';
      calls.set(index, call);
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  if (!received) {
    yield { type: 'error', message: 'The response ended unexpectedly.' };
    return;
  }

  const ordered = [...calls.entries()].sort(([a], [b]) => a - b);
  for (const [index, call] of ordered) {
    yield {
      type: 'tool_call',
      id: call.id || `call_${index}_${Math.random().toString(36).slice(2, 10)}`,
      name: call.name,
      input: parseArguments(call.args),
    };
  }
  // Some local servers finish a tool turn with "stop", so the calls decide.
  const stopReason: StopReason =
    ordered.length > 0 ? 'tool_use' : (FINISH_REASONS[finishReason ?? ''] ?? 'other');
  yield { type: 'done', stopReason, usage };
}
