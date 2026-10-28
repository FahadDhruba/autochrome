# M6 — Multi-tab tasks + debug tools

Goal: the agent can work across several tabs in one task, and can read console logs and network
requests and run JavaScript (with the user's approval) — useful for web development and testing.

## Multi-tab tasks

The tools already take `tabId`; this makes the agent good at using it.

- Every page/input tool result starts with a short context line: `[tab 123 · Title · url]` so the
  model always knows which tab it acted on (one helper in the executor, not in each handler).
- `tab_open` gets `background?: boolean` (default false): open without switching the current tab,
  so the agent can open several tabs and then visit them. `tabs_list` marks agent-group tabs
  (already does) and gets `agentOnly?: boolean`.
- The agent loop adds a short **tab state** note to the system prompt for each step: current tab
  and agent-group tabs (id · title · url), at most 15 lines. It is rebuilt each step, after the
  cached prefix, so it does not break prompt caching (put it in the last user message part or a
  trailing system block — check which keeps the Anthropic cache prefix stable and document it).
- System prompt guidance: pass `tabId` explicitly when working with more than one tab; open
  reference pages in background tabs; close tabs it opened when done unless the user wants them.
- Safety (M5) keeps working per target tab: each call checks the site of the tab it targets.

## Debug tools

Capture runs through the existing `chrome.debugger` attachment.

- On attach, enable `Runtime` and `Log` (console) and `Network` domains and buffer events per tab
  in a ring buffer (500 entries each). Buffers are dropped on tab close/detach. Capture starts when
  autochrome first attaches to the tab; tool output says so and suggests `navigate` to the same
  URL (reload) to capture from page start.
- `console_logs { tabId?, level? ('error'|'warning'|'info'|'log'|'debug'), pattern?, limit? (≤200,
default 50), clear? }` → lines `[time] level message (source:line)`, newest last; includes
  uncaught exceptions (`Runtime.exceptionThrown`) as `error`.
- `network_requests { tabId?, urlPattern?, method?, status? ('failed'|'4xx'|'5xx'|number),
limit? (≤200, default 50), clear? }` → lines `[requestId] METHOD status url (type, size, ms)`;
  failed requests show the error text.
- `network_response { requestId, tabId? }` → response headers + body via
  `Network.getResponseBody` (text only, truncated at 20,000 chars; base64/binary bodies reported
  as `binary, N bytes`). Errors clearly if the body is gone.
- `js_eval { code, tabId? }` → `Runtime.evaluate` with `awaitPromise`, `returnByValue`,
  `userGesture: true`, timeout 10 s; result as JSON (truncated at 20,000 chars) or the exception
  text. **Always asks for approval in every mode, including auto**, showing the code. Never
  allowed from the bridge without approval either.
- Tool descriptions say what each is for (debugging a page the user is developing, checking
  what failed, etc.).
- Safety: console/network reads are page reads (site must be allowed in per-site/ask modes);
  `network_response` is a page read too; `js_eval` is always-ask (risky reason
  `Runs JavaScript in the page`).

## Tests

- Unit: ring buffer, log/network formatting and filtering, status filter parsing, tab context
  line, tab-state note.
- e2e fixtures: a page that logs at several levels, throws an uncaught error, and fetches a JSON
  endpoint, a 404 and a failing host from the fixture server.
  - `console_logs` shows the levels and the exception; `level`/`pattern`/`clear` work.
  - `network_requests` lists the fetches with statuses; `status: 'failed'` and `'4xx'` filter;
    `network_response` returns the JSON body.
  - `js_eval` from the agent asks (inline card) even in auto mode, returns the value after
    approval, and returns `ok: false` after Deny.
  - multi-tab agent run with the mock provider: open two fixture pages in background tabs, read
    both by `tabId`, answer; assert the tool results carry the tab context line and the second
    request's tab-state note lists both tabs.
