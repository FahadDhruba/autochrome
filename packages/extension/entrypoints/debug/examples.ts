import type { ToolName } from '@autochrome/shared';

export const examples: Record<ToolName, object> = {
  tabs_list: {},
  tab_open: { url: 'https://example.com' },
  tab_switch: { tabId: 1 },
  tab_close: { tabId: 1 },
  navigate: { url: 'https://example.com' },
  go_back: {},
  go_forward: {},
  read_page: { filter: 'interactive' },
  find: { query: 'search' },
  get_text: {},
  screenshot: {},
  click: { ref: 'e1' },
  type: { text: 'hello', ref: 'e1' },
  key: { keys: 'Enter' },
  scroll: { direction: 'down', amount: 600 },
  form_input: { ref: 'e1', value: 'hello' },
  wait: { ms: 1000 },
};
