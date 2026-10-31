import type { ChatMessage, Part } from '../providers/types';
import { summarizeResult } from '../toolSummary';

export const KEEP_SCREENSHOTS = 3;
export const REMOVED_SCREENSHOT = '[earlier screenshot removed]';

/**
 * Copy of the history for the model where all but the newest `keep` tool-result screenshots
 * are replaced by text. The stored history is left alone.
 */
export function pruneScreenshots(messages: ChatMessage[], keep = KEEP_SCREENSHOTS): ChatMessage[] {
  let seen = 0;
  const pruned = [...messages].reverse().map((message): ChatMessage => {
    const parts = [...message.parts].reverse().map((part) => {
      if (part.type !== 'tool_result') return part;
      const content = [...part.content].reverse().map((item) => {
        if (item.type !== 'image') return item;
        return ++seen > keep ? { type: 'text' as const, text: REMOVED_SCREENSHOT } : item;
      });
      return { ...part, content: content.reverse() };
    });
    return { ...message, parts: parts.reverse() };
  });
  return pruned.reverse();
}

export const STALE_TEXT_CHARS = 300;
// Not `find`: its results are small and each query finds different elements.
const PAGE_READS = new Set(['read_page', 'get_text']);

type ToolCall = Extract<Part, { type: 'tool_call' }>;
type ToolResult = Extract<Part, { type: 'tool_result' }>;

/** A real user prompt, as opposed to a message that only carries tool results. */
const isPrompt = (message: ChatMessage) =>
  message.role === 'user' && message.parts.some((part) => part.type === 'text');

/** `read_page:<tabId|current>`, the identity of a page read for "newest wins". */
function readKey(call: ToolCall): string | undefined {
  if (!PAGE_READS.has(call.name)) return undefined;
  const tabId = (call.input as { tabId?: unknown } | null)?.tabId;
  return `${call.name}:${tabId ?? 'current'}`;
}

const isResult = (part: Part): part is ToolResult => part.type === 'tool_result';

const resultText = (result: ToolResult) =>
  result.content.map((item) => (item.type === 'text' ? item.text : '')).join('\n');

/**
 * Copy of the history for the model where bulky tool-result text that is unlikely to be needed
 * again is replaced by a one-line stub: in the current task (after the last user prompt) every
 * page read but the newest per tool and tab, and in earlier tasks every long result. Depends only
 * on the history, so a result once stubbed stays stubbed and the cached prefix changes once.
 * The stored history is left alone.
 */
export function pruneStaleResults(messages: ChatMessage[]): ChatMessage[] {
  const calls = new Map<string, ToolCall>();
  for (const message of messages) {
    for (const part of message.parts) if (part.type === 'tool_call') calls.set(part.id, part);
  }
  const taskStart = messages.map(isPrompt).lastIndexOf(true);
  const newest = new Map<string, string>();
  for (const message of messages.slice(taskStart + 1)) {
    for (const part of message.parts) {
      if (!isResult(part) || part.isError) continue;
      const call = calls.get(part.callId);
      const key = call && readKey(call);
      if (key) newest.set(key, part.callId);
    }
  }

  const stub = (result: ToolResult, label: string, hint = ''): ToolResult => {
    const name = calls.get(result.callId)?.name ?? '';
    const summary = summarizeResult(name, result.content, false);
    const text = `[${label}${summary ? ` (${summary})` : ''}${hint}]`;
    return { ...result, content: [{ type: 'text', text }] };
  };

  return messages.map((message, index): ChatMessage => {
    const earlier = index < taskStart;
    const parts = message.parts.map((part): Part => {
      if (!isResult(part) || part.isError) return part;
      const call = calls.get(part.callId);
      if (earlier) {
        if (resultText(part).length > STALE_TEXT_CHARS) {
          return stub(part, 'output from an earlier task removed');
        }
        const content = part.content.map((item) =>
          item.type === 'image' ? { type: 'text' as const, text: REMOVED_SCREENSHOT } : item,
        );
        return { ...part, content };
      }
      const key = call && readKey(call);
      if (key && newest.get(key) !== part.callId) {
        return stub(
          part,
          `earlier ${call.name} output removed`,
          `; call ${call.name} again if needed`,
        );
      }
      return part;
    });
    return { ...message, parts };
  });
}
