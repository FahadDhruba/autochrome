import type { Part } from './providers/types';

type ToolCall = Extract<Part, { type: 'tool_call' }>;
type ToolResult = Extract<Part, { type: 'tool_result' }>;

const MAX_QUOTE = 40;

const quote = (value: unknown) => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return `“${text.length > MAX_QUOTE ? `${text.slice(0, MAX_QUOTE - 1)}…` : text}”`;
};

/** `wikipedia.org/wiki/Ada_Lovelace` from a URL, without the protocol or `www.`. */
export function shortUrl(url: unknown): string {
  try {
    const parsed = new URL(String(url));
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    const short = `${parsed.host.replace(/^www\./, '')}${path}`;
    return short.length > 48 ? `${short.slice(0, 47)}…` : short;
  } catch {
    return String(url ?? '');
  }
}

/** What the element is called, from the result's target hint or the ref. */
function elementName(result: ToolResult | undefined): string | undefined {
  const target = result?.target;
  const name = target?.name || target?.text;
  return name ? quote(name) : undefined;
}

const isPassword = (result: ToolResult | undefined) =>
  /password/i.test(`${result?.target?.role ?? ''} ${result?.target?.name ?? ''}`);

type Phrase = [doing: string, done: string];

function phrase(call: ToolCall, result: ToolResult | undefined): Phrase {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const element = elementName(result);
  const on = element ? ` ${element}` : '';
  switch (call.name) {
    case 'tab_open':
      return input.url
        ? [`Opening ${shortUrl(input.url)}`, `Opened ${shortUrl(input.url)}`]
        : ['Opening a new tab', 'Opened a new tab'];
    case 'navigate':
      return [`Going to ${shortUrl(input.url)}`, `Went to ${shortUrl(input.url)}`];
    case 'tabs_list':
      return ['Checking open tabs', 'Checked open tabs'];
    case 'tab_switch':
      return ['Switching tabs', 'Switched tabs'];
    case 'tab_close':
      return ['Closing a tab', 'Closed a tab'];
    case 'go_back':
      return ['Going back', 'Went back'];
    case 'go_forward':
      return ['Going forward', 'Went forward'];
    case 'read_page':
      return ['Reading the page', 'Read the page'];
    case 'get_text':
      return ['Reading the page text', 'Read the page text'];
    case 'extract_table':
      return ['Reading the tables', 'Read the tables'];
    case 'find':
      return [`Looking for ${quote(input.query)}`, `Looked for ${quote(input.query)}`];
    case 'screenshot':
      return ['Taking a screenshot', 'Took a screenshot'];
    case 'click':
      return element
        ? [`Clicking ${element}`, `Clicked ${element}`]
        : input.ref
          ? ['Clicking an element', 'Clicked an element']
          : ['Clicking a point on the page', 'Clicked a point on the page'];
    case 'type': {
      const typed = isPassword(result) ? '••••' : quote(input.text);
      const into = element ? ` into ${element}` : '';
      return [`Typing ${typed}${into}`, `Typed ${typed}${into}`];
    }
    case 'form_input': {
      const value =
        typeof input.value === 'boolean'
          ? input.value
            ? 'on'
            : 'off'
          : isPassword(result)
            ? '••••'
            : quote(input.value);
      return [`Setting${on || ' a field'} to ${value}`, `Set${on || ' a field'} to ${value}`];
    }
    case 'key':
      return [`Pressing ${String(input.keys ?? '')}`, `Pressed ${String(input.keys ?? '')}`];
    case 'scroll': {
      const direction = typeof input.direction === 'string' ? ` ${input.direction}` : '';
      return [`Scrolling${direction}`, `Scrolled${direction}`];
    }
    case 'wait':
      return input.text
        ? [`Waiting for ${quote(input.text)}`, `Waited for ${quote(input.text)}`]
        : [
            'Waiting',
            `Waited ${Math.round(Number(input.ms ?? 0) / 100) / 10} s`.replace('.0 s', ' s'),
          ];
    case 'hover':
      return element
        ? [`Pointing at ${element}`, `Pointed at ${element}`]
        : ['Moving the mouse', 'Moved the mouse'];
    case 'drag':
      return ['Dragging', 'Dragged and dropped'];
    case 'upload_file': {
      const what = input.fileName ? quote(input.fileName) : 'files';
      return [`Uploading ${what}`, `Uploaded ${what}`];
    }
    case 'dialog':
      return input.accept
        ? ['Answering OK to a dialog', 'Answered OK to a dialog']
        : ['Cancelling a dialog', 'Cancelled a dialog'];
    case 'ask_user':
      return input.handoff
        ? ['Waiting for you in the page', 'You took a step in the page']
        : [`Asking you: ${quote(input.question)}`, `Asked you: ${quote(input.question)}`];
    case 'console_logs':
      return ['Reading the console', 'Read the console'];
    case 'network_requests':
      return ['Checking network requests', 'Checked network requests'];
    case 'network_response':
      return ['Reading a network response', 'Read a network response'];
    case 'js_eval':
      return ['Running JavaScript', 'Ran JavaScript'];
    case 'workflows_list':
      return ['Listing workflows', 'Listed workflows'];
    case 'workflow_run':
      return [
        `Running workflow ${quote(input.name ?? input.id)}`,
        `Ran workflow ${quote(input.name ?? input.id)}`,
      ];
    default:
      return [`Using ${call.name}`, `Used ${call.name}`];
  }
}

/** One plain-language line for a tool call: "Clicking “Submit”" while it runs, "Clicked “Submit”" after. */
export function describeStep(call: ToolCall, result?: ToolResult): string {
  const [doing, done] = phrase(call, result);
  return result ? done : doing;
}
