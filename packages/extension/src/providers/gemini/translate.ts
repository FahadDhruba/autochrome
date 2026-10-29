import type { ToolContent } from '@autochrome/shared';
import type { ChatMessage, Part, ProviderTool } from '../types';

/** Ids made up for calls Gemini sent without one; they are never sent back. */
export const GENERATED_ID_PREFIX = 'gemini-call-';

/**
 * Google's documented placeholder for function calls the model did not produce itself, such as
 * history from another provider. It skips validation but weakens the model's reasoning context.
 */
export const SKIP_SIGNATURE = 'skip_thought_signature_validator';

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args: unknown };
  functionResponse?: {
    id?: string;
    name: string;
    response: { output: string } | { error: string };
  };
  thoughtSignature?: string;
};

export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

const EMPTY_RESULT = '(no output)';
const IMAGES_ONLY = '(screenshot attached)';

const echoId = (id: string) => (id.startsWith(GENERATED_ID_PREFIX) ? {} : { id });

function toFunctionResponse(
  part: Extract<Part, { type: 'tool_result' }>,
  name: string,
): GeminiPart {
  const text = part.content.flatMap((item) =>
    item.type === 'text' && item.text ? [item.text] : [],
  );
  const hasImage = part.content.some((item: ToolContent) => item.type === 'image');
  const output = text.join('\n') || (hasImage ? IMAGES_ONLY : EMPTY_RESULT);
  return {
    functionResponse: {
      ...echoId(part.callId),
      name,
      response: part.isError ? { error: output } : { output },
    },
  };
}

function modelParts(parts: Part[]): GeminiPart[] {
  // Only the first call of a step needs a signature; calls from other providers get the placeholder.
  let firstCall = true;
  return parts.flatMap((part): GeminiPart[] => {
    if (part.type === 'text') {
      if (!part.text && !part.signature) return [];
      return [{ text: part.text, ...(part.signature && { thoughtSignature: part.signature }) }];
    }
    if (part.type !== 'tool_call') return [];
    const signature = part.signature ?? (firstCall ? SKIP_SIGNATURE : undefined);
    firstCall = false;
    return [
      {
        functionCall: { ...echoId(part.id), name: part.name, args: toArgs(part.input) },
        ...(signature && { thoughtSignature: signature }),
      },
    ];
  });
}

function toArgs(input: unknown): unknown {
  return input !== null && typeof input === 'object' ? input : {};
}

function userParts(parts: Part[], callNames: Map<string, string>): GeminiPart[] {
  const results: GeminiPart[] = [];
  const images: GeminiPart[] = [];
  const own: GeminiPart[] = [];
  for (const part of parts) {
    if (part.type === 'tool_result') {
      results.push(toFunctionResponse(part, callNames.get(part.callId) ?? 'unknown_tool'));
      for (const item of part.content) {
        if (item.type === 'image') {
          images.push({ inlineData: { mimeType: item.mimeType, data: item.data } });
        }
      }
    } else if (part.type === 'text' && part.text) {
      own.push({ text: part.text });
    } else if (part.type === 'image') {
      own.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
    }
  }
  return [...results, ...images, ...own];
}

export function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  // functionResponse is matched by name, which the result part itself does not carry.
  const callNames = new Map<string, string>();
  for (const part of messages.flatMap((message) => message.parts)) {
    if (part.type === 'tool_call') callNames.set(part.id, part.name);
  }
  return messages
    .map((message): GeminiContent =>
      message.role === 'assistant'
        ? { role: 'model', parts: modelParts(message.parts) }
        : { role: 'user', parts: userParts(message.parts, callNames) },
    )
    .filter((content) => content.parts.length > 0);
}

/** Gemini's schema field takes plain JSON Schema, but not the `$schema` marker. */
export function toGeminiTools(tools: ProviderTool[]) {
  if (tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((tool) => {
        const schema = Object.fromEntries(
          Object.entries(tool.inputSchema).filter(([key]) => key !== '$schema'),
        );
        return { name: tool.name, description: tool.description, parametersJsonSchema: schema };
      }),
    },
  ];
}
