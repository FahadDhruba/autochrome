import type { ToolContent } from '@autochrome/shared';
import type { ChatMessage, Part, ProviderTool } from '../types';

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image_url'; image_url: { url: string } };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export type OpenAiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | (TextPart | ImagePart)[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

const EMPTY_RESULT = '(no output)';

const dataUrl = (image: { data: string; mimeType: string }) =>
  `data:${image.mimeType};base64,${image.data}`;

function resultText(content: ToolContent[], isError: boolean): string {
  const text = content.flatMap((item) => (item.type === 'text' && item.text ? [item.text] : []));
  const joined = text.join('\n') || EMPTY_RESULT;
  return isError ? `Error: ${joined}` : joined;
}

function assistantMessage(parts: Part[]): OpenAiMessage[] {
  const text = parts.flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []));
  const toolCalls = parts.flatMap((part): ToolCall[] =>
    part.type === 'tool_call'
      ? [
          {
            id: part.id,
            type: 'function',
            function: {
              name: part.name,
              // Unparseable arguments from an earlier turn are kept as the raw string.
              arguments:
                typeof part.input === 'string' ? part.input : JSON.stringify(part.input ?? {}),
            },
          },
        ]
      : [],
  );
  if (text.length === 0 && toolCalls.length === 0) return [];
  return [
    {
      role: 'assistant',
      content: text.length > 0 ? text.join('') : null,
      ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
    },
  ];
}

function userMessages(parts: Part[]): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [];

  // Tool messages are text-only, so screenshots follow as one user message.
  const screenshots: (TextPart | ImagePart)[] = [];
  for (const part of parts) {
    if (part.type !== 'tool_result') continue;
    messages.push({
      role: 'tool',
      tool_call_id: part.callId,
      content: resultText(part.content, part.isError),
    });
    for (const item of part.content) {
      if (item.type !== 'image') continue;
      screenshots.push(
        { type: 'text', text: `Screenshot from ${part.callId}` },
        { type: 'image_url', image_url: { url: dataUrl(item) } },
      );
    }
  }
  if (screenshots.length > 0) messages.push({ role: 'user', content: screenshots });

  const own = parts.flatMap((part): (TextPart | ImagePart)[] => {
    if (part.type === 'text') return part.text ? [{ type: 'text', text: part.text }] : [];
    if (part.type === 'image') return [{ type: 'image_url', image_url: { url: dataUrl(part) } }];
    return [];
  });
  if (own.length > 0) {
    const textOnly = own.every((part) => part.type === 'text');
    messages.push({
      role: 'user',
      content: textOnly ? own.map((part) => (part as TextPart).text).join('\n') : own,
    });
  }
  return messages;
}

export function toOpenAiMessages(system: string, messages: ChatMessage[]): OpenAiMessage[] {
  return [
    { role: 'system', content: system },
    ...messages.flatMap((message) =>
      message.role === 'assistant' ? assistantMessage(message.parts) : userMessages(message.parts),
    ),
  ];
}

export function toOpenAiTools(tools: ProviderTool[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
}
