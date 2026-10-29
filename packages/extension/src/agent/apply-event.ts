import type { ChatMessage } from '../providers/types';
import type { AgentEvent } from './protocol';

/**
 * Applies a live agent event to a copy of the message list, producing the same structure the
 * agent loop stores: assistant turns with text and tool calls, user turns with tool results.
 */
export function applyEvent(messages: ChatMessage[], event: AgentEvent): ChatMessage[] {
  const next = messages.map((message) => ({ ...message, parts: [...message.parts] }));
  const last = next.at(-1);

  if (event.type === 'text_delta') {
    if (last?.role !== 'assistant') {
      next.push({ role: 'assistant', parts: [{ type: 'text', text: event.text }] });
      return next;
    }
    const tail = last.parts.at(-1);
    if (tail?.type === 'text')
      last.parts[last.parts.length - 1] = { ...tail, text: tail.text + event.text };
    else last.parts.push({ type: 'text', text: event.text });
  } else if (event.type === 'tool_start') {
    const call = { type: 'tool_call' as const, id: event.id, name: event.name, input: event.input };
    if (last?.role === 'assistant') last.parts.push(call);
    else next.push({ role: 'assistant', parts: [call] });
  } else if (event.type === 'tool_end') {
    const result = {
      type: 'tool_result' as const,
      callId: event.id,
      content: event.result.content,
      isError: !event.result.ok,
    };
    if (last?.role === 'user') last.parts.push(result);
    else next.push({ role: 'user', parts: [result] });
  }
  return next;
}
