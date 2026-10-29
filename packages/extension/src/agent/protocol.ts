import type { ToolResult } from '@autochrome/shared';
import type { ProviderId, Usage } from '../providers/types';

export const CHAT_PORT_NAME = 'autochrome:chat';
export const MAX_STEPS = 50;

/** Side panel to background. */
export type PanelMessage =
  | { type: 'send'; chatId: string; text: string; providerId: ProviderId; model: string }
  | { type: 'run_workflow'; workflowId: string; variables: Record<string, string> }
  | { type: 'stop' };

/** Background to side panel. */
export type AgentEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_end'; id: string; result: ToolResult }
  | { type: 'done'; usage: Usage }
  | { type: 'error'; message: string };
