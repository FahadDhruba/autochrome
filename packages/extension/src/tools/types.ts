import type { ToolContent, ToolInput, ToolName } from '@autochrome/shared';

export type ToolHandler<N extends ToolName> = (input: ToolInput<N>) => Promise<ToolContent[]>;
export type ToolHandlers = { [N in ToolName]: ToolHandler<N> };

export const text = (value: string): ToolContent[] => [{ type: 'text', text: value }];
