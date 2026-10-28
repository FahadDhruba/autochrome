import type Anthropic from '@anthropic-ai/sdk';
import type { ToolContent } from '@autochrome/shared';
import type { ChatMessage, Part, ProviderTool } from '../types';

type ContentBlock = Anthropic.ContentBlockParam;
type ResultContent = Exclude<Anthropic.ToolResultBlockParam['content'], string | undefined>;

const EPHEMERAL = { type: 'ephemeral' } as const;
const EMPTY_RESULT = '(no output)';

function toResultContent(content: ToolContent[]): ResultContent {
  const blocks = content.flatMap((item): ResultContent => {
    if (item.type === 'image') {
      return [
        {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: item.mimeType as never, data: item.data },
        },
      ];
    }
    // The API rejects empty text blocks.
    return item.text ? [{ type: 'text' as const, text: item.text }] : [];
  });
  return blocks.length > 0 ? blocks : [{ type: 'text', text: EMPTY_RESULT }];
}

function toBlock(part: Part): ContentBlock[] {
  switch (part.type) {
    case 'text':
      return part.text ? [{ type: 'text', text: part.text }] : [];
    case 'image':
      return [
        {
          type: 'image',
          source: { type: 'base64', media_type: part.mimeType as never, data: part.data },
        },
      ];
    case 'tool_call':
      return [{ type: 'tool_use', id: part.id, name: part.name, input: part.input ?? {} }];
    case 'tool_result':
      return [
        {
          type: 'tool_result',
          tool_use_id: part.callId,
          content: toResultContent(part.content),
          ...(part.isError && { is_error: true }),
        },
      ];
  }
}

/** Anthropic requires tool_result blocks to come before any other content in a user turn. */
function resultsFirst(blocks: ContentBlock[]): ContentBlock[] {
  const isResult = (block: ContentBlock) => block.type === 'tool_result';
  return [...blocks.filter(isResult), ...blocks.filter((block) => !isResult(block))];
}

export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const result = messages
    .map((message) => {
      const blocks = message.parts.flatMap(toBlock);
      return {
        role: message.role,
        content: message.role === 'user' ? resultsFirst(blocks) : blocks,
      };
    })
    .filter((message) => message.content.length > 0);

  // Mark the end of the history so the whole prefix is cached for the next step.
  const last = result.at(-1)?.content.at(-1);
  if (last) (last as { cache_control?: typeof EPHEMERAL }).cache_control = EPHEMERAL;
  return result;
}

export function toAnthropicTools(tools: ProviderTool[]): Anthropic.Tool[] {
  return tools.map((tool, index) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    ...(index === tools.length - 1 && { cache_control: EPHEMERAL }),
  }));
}

export function toAnthropicSystem(system: string): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text: system, cache_control: EPHEMERAL }];
}
