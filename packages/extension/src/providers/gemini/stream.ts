import type { ProviderEvent, StopReason, Usage } from '../types';
import { readSse } from '../sse';
import { GENERATED_ID_PREFIX } from './translate';

type Chunk = {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
        thought?: boolean;
        thoughtSignature?: string;
        functionCall?: { id?: string; name?: string; args?: unknown };
      }[];
    };
    finishReason?: string;
    finishMessage?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  error?: { message?: string };
};

function toUsage(metadata: NonNullable<Chunk['usageMetadata']>): Usage {
  const cached = metadata.cachedContentTokenCount ?? 0;
  // promptTokenCount includes cached tokens; Usage.inputTokens does not. Thinking is billed as output.
  return {
    inputTokens: Math.max(0, (metadata.promptTokenCount ?? 0) - cached),
    outputTokens: (metadata.candidatesTokenCount ?? 0) + (metadata.thoughtsTokenCount ?? 0),
    cacheReadTokens: cached,
  };
}

function describeBlock(reason: string, message?: string): string {
  const readable = reason.toLowerCase().replaceAll('_', ' ');
  return `Gemini stopped the response (${readable}).${message ? ` ${message}` : ''}`;
}

/** Turns a streamGenerateContent SSE body into provider-neutral events; throws on read errors. */
export async function* parseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ProviderEvent> {
  let finishReason: string | undefined;
  let finishMessage: string | undefined;
  let blockReason: string | undefined;
  let usage: Usage | undefined;
  let calls = 0;
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
      yield { type: 'error', message: chunk.error.message || 'Gemini reported an error.' };
      return;
    }
    if (chunk.usageMetadata) usage = toUsage(chunk.usageMetadata);
    if (chunk.promptFeedback?.blockReason) blockReason = chunk.promptFeedback.blockReason;

    const candidate = chunk.candidates?.[0];
    if (!candidate) continue;
    if (candidate.finishReason) {
      finishReason = candidate.finishReason;
      finishMessage = candidate.finishMessage;
    }
    for (const part of candidate.content?.parts ?? []) {
      const signature = part.thoughtSignature;
      if (part.functionCall?.name) {
        const { id, name, args } = part.functionCall;
        yield {
          type: 'tool_call',
          id: id || `${GENERATED_ID_PREFIX}${calls}-${Math.random().toString(36).slice(2, 10)}`,
          name,
          input: args ?? {},
          ...(signature && { signature }),
        };
        calls++;
      } else if (!part.thought && (part.text || signature)) {
        yield { type: 'text_delta', text: part.text ?? '', ...(signature && { signature }) };
      }
    }
  }

  if (blockReason && !finishReason) {
    yield { type: 'error', message: describeBlock(blockReason) };
    return;
  }
  if (!received || !finishReason) {
    yield { type: 'error', message: 'The response ended unexpectedly.' };
    return;
  }

  let stopReason: StopReason;
  if (finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';
  else if (finishReason === 'STOP') stopReason = calls > 0 ? 'tool_use' : 'end';
  else {
    yield { type: 'error', message: describeBlock(finishReason, finishMessage) };
    return;
  }
  yield { type: 'done', stopReason, usage };
}
