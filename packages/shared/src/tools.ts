import { z } from 'zod';

const tabId = z.number().int().optional().describe('Target tab. Defaults to the current tab.');
const ref = z.string().describe('Element ref such as "e12", from read_page or find.');
const point = {
  x: z.number().optional().describe('Viewport x in CSS px (as in a screenshot).'),
  y: z.number().optional().describe('Viewport y in CSS px (as in a screenshot).'),
};

function defineTool<N extends string, T extends z.ZodType>(name: N, description: string, input: T) {
  return { name, description, input };
}

export const toolDefinitions = {
  tabs_list: defineTool(
    'tabs_list',
    'List open tabs, one per line as "tabId · title · url". Marks the current tab and the tabs in the agent group. Use it first to see what is open.',
    z.object({
      agentOnly: z.boolean().optional().describe('Only list the tabs in the agent group.'),
    }),
  ),
  tab_open: defineTool(
    'tab_open',
    'Open a new tab in the agent tab group and make it the current tab, unless background is true. Returns its tabId. Pass that tabId to later calls when working with more than one tab.',
    z.object({
      url: z.string().optional().describe('URL to load. Blank tab if omitted.'),
      background: z
        .boolean()
        .default(false)
        .describe('Open without switching to the tab or changing the current tab.'),
    }),
  ),
  tab_switch: defineTool(
    'tab_switch',
    'Make an existing tab the current tab, bring it to the front and add it to the agent tab group.',
    z.object({ tabId: z.number().int() }),
  ),
  tab_close: defineTool('tab_close', 'Close a tab.', z.object({ tabId: z.number().int() })),
  navigate: defineTool(
    'navigate',
    'Load a URL in a tab and wait for it to finish loading. Returns the final URL and page title.',
    z.object({ url: z.string(), tabId }),
  ),
  go_back: defineTool(
    'go_back',
    'Go back one step in the tab history and wait for the page to load.',
    z.object({ tabId }),
  ),
  go_forward: defineTool(
    'go_forward',
    'Go forward one step in the tab history and wait for the page to load.',
    z.object({ tabId }),
  ),
  read_page: defineTool(
    'read_page',
    'Read the page as a compact accessibility tree. Each actionable element gets a ref like "e12" that click, type, scroll and form_input accept. Refs are reset by every read_page call. Use filter "interactive" (default) for a flat list of actionable elements, or "all" for the full structure.',
    z.object({ tabId, filter: z.enum(['all', 'interactive']).default('interactive') }),
  ),
  find: defineTool(
    'find',
    'Find elements whose role, name or value contains the query (case-insensitive). Returns up to 20 lines in the read_page format, with refs. Use it to locate an element on a large page without reading everything.',
    z.object({ query: z.string().min(1), tabId }),
  ),
  get_text: defineTool(
    'get_text',
    'Get the page title, URL and readable text (up to 20,000 characters). Use it to read articles or other long text.',
    z.object({ tabId }),
  ),
  screenshot: defineTool(
    'screenshot',
    'Take a JPEG screenshot of the visible viewport. Its pixel size equals the viewport size in CSS px, so x/y read from it can be passed to click. Use it when the accessibility tree is not enough.',
    z.object({ tabId }),
  ),
  click: defineTool(
    'click',
    'Click an element by ref, or a viewport point by x and y. Prefer ref.',
    z
      .object({
        ref: ref.optional(),
        ...point,
        button: z.enum(['left', 'right', 'middle']).default('left'),
        clickCount: z.number().int().min(1).max(3).default(1).describe('2 for double click.'),
        tabId,
      })
      .refine((v) => v.ref !== undefined || (v.x !== undefined && v.y !== undefined), {
        message: 'Provide ref, or both x and y.',
      }),
  ),
  type: defineTool(
    'type',
    'Type text into the focused element, or into the element given by ref (focused first). Does not press Enter; use key for that.',
    z.object({ text: z.string(), ref: ref.optional(), tabId }),
  ),
  key: defineTool(
    'key',
    'Press a key or key combination, e.g. "Enter", "Escape", "Control+a", "Shift+Tab". Separate several presses with spaces, e.g. "Tab Tab Enter".',
    z.object({ keys: z.string().min(1), tabId }),
  ),
  scroll: defineTool(
    'scroll',
    'Scroll the page, or the element under the given ref or x/y point. Defaults to the viewport center.',
    z.object({
      direction: z.enum(['up', 'down', 'left', 'right']),
      amount: z.number().positive().default(600).describe('Distance in px.'),
      ref: ref.optional(),
      ...point,
      tabId,
    }),
  ),
  form_input: defineTool(
    'form_input',
    'Set the value of an input, textarea, select, checkbox or radio by ref and fire input and change events. Use a boolean for checkboxes and radios, and an option value or label for selects.',
    z.object({ ref, value: z.union([z.string(), z.boolean()]), tabId }),
  ),
  wait: defineTool(
    'wait',
    'Wait for a fixed time, for text to appear in the page, or both. Use after actions that load content asynchronously.',
    z
      .object({
        ms: z.number().min(0).max(10_000).optional(),
        text: z.string().optional().describe('Resolve as soon as this text is in the page.'),
        timeoutMs: z.number().positive().max(30_000).default(10_000),
        tabId,
      })
      .refine((v) => v.ms !== undefined || v.text !== undefined, {
        message: 'Provide ms, text or both.',
      }),
  ),
  console_logs: defineTool(
    'console_logs',
    'Read the browser console of a tab: console.* calls, uncaught exceptions and browser warnings, newest last. Use it to debug a page the user is developing or to see what went wrong. Capture starts when autochrome first attaches to the tab, so earlier messages are missing; navigate to the same URL to capture from page start.',
    z.object({
      tabId,
      level: z
        .enum(['error', 'warning', 'info', 'log', 'debug'])
        .optional()
        .describe('Only this level.'),
      pattern: z
        .string()
        .optional()
        .describe('Only messages containing this text (case-insensitive).'),
      limit: z.number().int().min(1).max(200).default(50).describe('Newest N lines to return.'),
      clear: z.boolean().optional().describe('Empty the buffer after reading.'),
    }),
  ),
  network_requests: defineTool(
    'network_requests',
    'List the network requests a tab made, one per line as "[requestId] METHOD status url (type, size, ms)". Use it to check which requests failed or returned errors; pass a requestId to network_response to see the body. Capture starts when autochrome first attaches to the tab; navigate to the same URL to capture from page start.',
    z.object({
      tabId,
      urlPattern: z.string().optional().describe('Only URLs containing this text.'),
      method: z.string().optional().describe('Only this HTTP method, e.g. "POST".'),
      status: z
        .union([z.enum(['failed', '4xx', '5xx']), z.number().int().min(100).max(599)])
        .optional()
        .describe('"failed" (no response), "4xx", "5xx" or an exact status code.'),
      limit: z.number().int().min(1).max(200).default(50).describe('Newest N requests to return.'),
      clear: z.boolean().optional().describe('Empty the buffer after reading.'),
    }),
  ),
  network_response: defineTool(
    'network_response',
    'Get the response headers and body of a request listed by network_requests. Text bodies only, truncated at 20,000 characters.',
    z.object({ requestId: z.string(), tabId }),
  ),
  workflows_list: defineTool(
    'workflows_list',
    'List the saved workflows (recorded in the browser or saved from a chat) with their ids, names and variables. Use it to find a workflow before running it with workflow_run.',
    z.object({}),
  ),
  workflow_run: defineTool(
    'workflow_run',
    'Replay a saved workflow by id or name in its own tab and return the run log: each step with its status (ok, repaired by AI, or failed) and duration. Fill the workflow variables with `variables`. A step that cannot find its element is handed to the configured AI provider to repair.',
    z
      .object({
        id: z.string().optional().describe('Workflow id from workflows_list.'),
        name: z.string().optional().describe('Workflow name, when the id is not known.'),
        variables: z
          .record(z.string(), z.string())
          .optional()
          .describe('Values for the workflow variables, by name.'),
      })
      .refine((v) => v.id !== undefined || v.name !== undefined, {
        message: 'Provide id or name.',
      }),
  ),
  js_eval: defineTool(
    'js_eval',
    'Run JavaScript in the page and return the JSON result (or the exception). For debugging and inspecting page state, not for ordinary browsing. The user is always asked to approve the code first.',
    z.object({ code: z.string().min(1), tabId }),
  ),
};

export type ToolName = keyof typeof toolDefinitions;
export type ToolInput<N extends ToolName> = z.output<(typeof toolDefinitions)[N]['input']>;

export const toolNames = Object.keys(toolDefinitions) as ToolName[];
