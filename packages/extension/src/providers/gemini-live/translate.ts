import type { ChatMessage, Part } from '../types';

type LivePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { id: string; name: string; args: unknown } };

export type LiveTurn = { role: 'user' | 'model'; parts: LivePart[] };

const EMPTY_RESULT = '(no output)';

const toArgs = (input: unknown): unknown =>
  input !== null && typeof input === 'object' ? input : {};

function resultParts(part: Extract<Part, { type: 'tool_result' }>, name: string): LivePart[] {
  const text = part.content.flatMap((item) =>
    item.type === 'text' && item.text ? [item.text] : [],
  );
  const heading = `${part.isError ? 'Error from' : 'Result of'} ${name} (${part.callId}):`;
  const images = part.content.flatMap((item): LivePart[] =>
    item.type === 'image' ? [{ inlineData: { mimeType: item.mimeType, data: item.data } }] : [],
  );
  return [{ text: `${heading}\n${text.join('\n') || EMPTY_RESULT}` }, ...images];
}

/**
 * Live sessions replay history with `clientContent`. In that replay the model ignores a
 * `functionResponse` part ("the call returned no content"), so results go back as plain user text
 * while the model turn keeps its `functionCall` part.
 */
export function toLiveTurns(messages: ChatMessage[]): LiveTurn[] {
  const callNames = new Map<string, string>();
  for (const part of messages.flatMap((message) => message.parts)) {
    if (part.type === 'tool_call') callNames.set(part.id, part.name);
  }
  return messages
    .map((message): LiveTurn => {
      const parts = message.parts.flatMap((part): LivePart[] => {
        if (part.type === 'text') return part.text ? [{ text: part.text }] : [];
        if (part.type === 'image') {
          return [{ inlineData: { mimeType: part.mimeType, data: part.data } }];
        }
        if (part.type === 'tool_call') {
          return [{ functionCall: { id: part.id, name: part.name, args: toArgs(part.input) } }];
        }
        return resultParts(part, callNames.get(part.callId) ?? 'unknown_tool');
      });
      return { role: message.role === 'assistant' ? 'model' : 'user', parts };
    })
    .filter((turn) => turn.parts.length > 0);
}
