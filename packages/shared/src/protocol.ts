import type { ToolName } from './tools';
import type { TargetHint } from './workflow';

export type ToolCall = { id: string; name: ToolName; input: unknown };

/** Same shape as MCP content; `data` is base64 without a `data:` prefix. */
export type ToolContent =
  { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

/**
 * On failure `ok` is false and `content` holds one text item with the error message.
 * `target` describes the element an action acted on, so a chat can later become a workflow; it is
 * for the extension only and never reaches a model or the bridge.
 */
export type ToolResult = { id: string; ok: boolean; content: ToolContent[]; target?: TargetHint };

/** Runtime message sent to the background worker; it responds with a `ToolResult`. */
export type ExecuteMessage = { type: 'autochrome:execute'; call: ToolCall };

export function isExecuteMessage(message: unknown): message is ExecuteMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'autochrome:execute'
  );
}
