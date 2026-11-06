import type { ToolResult } from '@autochrome/shared';
import type { Part, ProviderId, Usage } from '../providers/types';

export type ContextPart = Extract<Part, { type: 'text' | 'image' }> & { context: string };

export const CHAT_PORT_NAME = 'autochrome:chat';
export const MAX_STEPS = 50;

/** Side panel to background. */
export type PanelMessage =
  | {
      type: 'send';
      chatId: string;
      text: string;
      providerId: ProviderId;
      model: string;
      /** Context the user attached: page text, their tabs, a screenshot. */
      context?: ContextPart[];
    }
  | { type: 'run_workflow'; workflowId: string; variables: Record<string, string> }
  | { type: 'stop' }
  /** The answer to an ask_user question. */
  | { type: 'answer'; id: string; text: string }
  /** The user takes over the browser; the agent waits before its next step. */
  | { type: 'pause' }
  | { type: 'resume'; note?: string };

/** Background to side panel. */
export type AgentEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_end'; id: string; result: ToolResult }
  | { type: 'done'; usage: Usage }
  | { type: 'error'; message: string }
  | { type: 'question'; id: string; question: string; choices?: string[]; handoff: boolean }
  | { type: 'question_done'; id: string }
  | { type: 'paused' }
  | { type: 'resumed' };
