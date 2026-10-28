import type { ChatMessage } from '../providers/types';

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
