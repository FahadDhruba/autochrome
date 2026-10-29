import type { ToolContent, ToolInput, ToolName } from '@autochrome/shared';
import type { ToolSource } from '../safety/types';

/** Who is running the tool, for handlers that run further tools themselves. */
export type HandlerContext = { source: ToolSource; signal?: AbortSignal };

export type ToolHandler<N extends ToolName> = (
  input: ToolInput<N>,
  context: HandlerContext,
) => Promise<ToolContent[]>;
export type ToolHandlers = { [N in ToolName]: ToolHandler<N> };

export const text = (value: string): ToolContent[] => [{ type: 'text', text: value }];
