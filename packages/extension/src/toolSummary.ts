const MAX_LENGTH = 80;

/** One-line preview of a tool input for the collapsed tool card, e.g. `url: https://…`. */
export function summarizeInput(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const summary = Object.entries(input)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');
  return summary.length > MAX_LENGTH ? `${summary.slice(0, MAX_LENGTH - 1)}…` : summary;
}

export type ToolGroup = 'tabs' | 'read' | 'input' | 'debug' | 'workflow';

const GROUPS: Record<string, ToolGroup> = {
  tabs_list: 'tabs',
  tab_open: 'tabs',
  tab_switch: 'tabs',
  tab_close: 'tabs',
  navigate: 'tabs',
  go_back: 'tabs',
  go_forward: 'tabs',
  read_page: 'read',
  find: 'read',
  get_text: 'read',
  screenshot: 'read',
  click: 'input',
  type: 'input',
  key: 'input',
  scroll: 'input',
  form_input: 'input',
  wait: 'input',
  console_logs: 'debug',
  network_requests: 'debug',
  network_response: 'debug',
  js_eval: 'debug',
  workflows_list: 'workflow',
  workflow_run: 'workflow',
};

/** Which family a tool belongs to, for its icon. Unknown tools count as `input`. */
export const toolGroup = (name: string): ToolGroup => GROUPS[name] ?? 'input';

export type ResultItem =
  { type: 'text'; text: string } | { type: 'image'; mimeType: string; data: string };

const COLLAPSED_MAX = 80;
const clip = (text: string): string =>
  text.length > COLLAPSED_MAX ? `${text.slice(0, COLLAPSED_MAX - 1)}…` : text;
const firstLine = (text: string): string =>
  text
    .split('\n')
    .find((l) => l.trim() !== '')
    ?.trim() ?? '';
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * One line describing a finished tool call, for the collapsed card: counts for the reading
 * tools, the first line of the error for failures, otherwise the first line of the result.
 */
/** Lines the executor adds around a result for the model: the tab context line and the
 * untrusted-content wrapper. They are not part of what the tool found. */
const WRAPPER_LINE = /^(\[tab \d+ · .*\]|<page_content( [^>]*)?>|<\/page_content>)$/;

/** Capture tools end with a note on when capture started; it is not a log entry. */
const isCaptureNote = (line: string) => line.startsWith('(Captured since');

export function summarizeResult(name: string, content: ResultItem[], isError: boolean): string {
  const text = content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
    .split('\n')
    .filter((line) => !WRAPPER_LINE.test(line))
    .join('\n')
    .trim();
  if (isError) return clip(firstLine(text) || 'Failed');
  const lines = text
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.startsWith('…') && !isCaptureNote(l));
  switch (name) {
    case 'read_page':
      return text.startsWith('(no elements') ? 'No elements' : plural(lines.length, 'element');
    case 'find':
      return text.startsWith('No elements')
        ? 'No matches'
        : plural(lines.length, 'match', 'matches');
    case 'get_text':
      return plural(text.length, 'char');
    case 'screenshot':
      return content.some((item) => item.type === 'image') ? '' : clip(firstLine(text));
    case 'tabs_list':
      return plural(lines.length, 'tab');
    case 'console_logs':
      return text.startsWith('No console messages')
        ? 'No messages'
        : plural(lines.length, 'message');
    case 'network_requests':
      return text.startsWith('No matching requests')
        ? 'No requests'
        : plural(lines.length, 'request');
    default:
      return clip(firstLine(text)) || 'Done';
  }
}
