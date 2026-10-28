import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages';
import type { ProviderEvent, StopReason, Usage } from '../types';
import { describeError } from './errors';

const STOP_REASONS: Record<string, StopReason> = {
  end_turn: 'end',
  stop_sequence: 'end',
  tool_use: 'tool_use',
  max_tokens: 'max_tokens',
};

type PendingToolCall = { id: string; name: string; json: string };

/** Turns the raw Messages stream into provider-neutral events; never throws. */
export async function* parseStream(
  events: AsyncIterable<RawMessageStreamEvent>,
): AsyncGenerator<ProviderEvent> {
  const toolCalls = new Map<number, PendingToolCall>();
  let stopReason: StopReason = 'other';
  // input_tokens excludes cache reads; cache writes are billed as input, so they count here.
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;

  try {
    for await (const event of events) {
      switch (event.type) {
        case 'message_start': {
          const usage = event.message.usage;
          inputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0);
          cacheReadTokens = usage.cache_read_input_tokens ?? 0;
          outputTokens = usage.output_tokens;
          break;
        }
        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            const { id, name } = event.content_block;
            toolCalls.set(event.index, { id, name, json: '' });
          }
          break;
        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            yield { type: 'text_delta', text: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            const call = toolCalls.get(event.index);
            if (call) call.json += event.delta.partial_json;
          }
          break;
        case 'content_block_stop': {
          const call = toolCalls.get(event.index);
          if (!call) break;
          toolCalls.delete(event.index);
          try {
            const input: unknown = call.json.trim() ? JSON.parse(call.json) : {};
            yield { type: 'tool_call', id: call.id, name: call.name, input };
          } catch {
            yield { type: 'error', message: `The model sent invalid input for ${call.name}.` };
            return;
          }
          break;
        }
        case 'message_delta':
          stopReason = STOP_REASONS[event.delta.stop_reason ?? ''] ?? 'other';
          outputTokens = event.usage.output_tokens;
          break;
        case 'message_stop': {
          const usage: Usage = { inputTokens, outputTokens, cacheReadTokens };
          yield { type: 'done', stopReason, usage };
          return;
        }
      }
    }
    yield { type: 'error', message: 'The response ended unexpectedly.' };
  } catch (error) {
    yield { type: 'error', message: describeError(error) };
  }
}
