import type { ToolContent, ToolName } from '@autochrome/shared';

/** Tools whose result is prefixed with the tab they acted on. */
export const TAB_CONTEXT_TOOLS = new Set<ToolName>([
  'navigate',
  'go_back',
  'go_forward',
  'read_page',
  'find',
  'get_text',
  'screenshot',
  'click',
  'type',
  'key',
  'scroll',
  'form_input',
  'wait',
  'console_logs',
  'network_requests',
  'network_response',
  'js_eval',
]);

const MAX_TITLE = 80;
const MAX_URL = 200;

/** One line, so a page title cannot add lines of its own. */
export function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export const formatTabContext = (tab: { id: number; title: string; url: string }): string =>
  `[tab ${tab.id} · ${oneLine(tab.title, MAX_TITLE)} · ${oneLine(tab.url, MAX_URL)}]`;

/** Puts the context line before the result, in its first text item when there is one. */
export function withTabContext(content: ToolContent[], line: string): ToolContent[] {
  const [first, ...rest] = content;
  if (first?.type === 'text') return [{ type: 'text', text: `${line}\n${first.text}` }, ...rest];
  return [{ type: 'text', text: line }, ...content];
}
