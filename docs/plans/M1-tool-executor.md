# M1 — Tool executor

Goal: the extension can read and act on real tabs through one tool executor. No AI, no bridge yet;
tools are run by hand from a debug page and by Playwright e2e tests.

## Shared (`packages/shared`)

- Add `zod` (^4). Each tool is defined once with a zod input schema; JSON Schema for providers and
  MCP comes from `z.toJSONSchema()` later.
- `src/tools.ts`: `toolDefinitions` — `{ name, description, input: ZodSchema }` for every tool
  below, plus `type ToolName` and `type ToolInput<N>`. Descriptions are written for an AI reader
  (say what the tool does, what it returns, when to use it).
- `src/protocol.ts`:
  - `ToolCall = { id: string; name: ToolName; input: unknown }`
  - `ToolContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }`
    (same shape as MCP content, base64 data, no `data:` prefix)
  - `ToolResult = { id: string; ok: boolean; content: ToolContent[] }` (on failure `ok: false` and
    one text item with the error message)
  - Runtime message `{ type: 'autochrome:execute'; call: ToolCall }` → responds with `ToolResult`.
- Unit tests: every definition has a non-empty description; sample valid/invalid inputs parse as
  expected.

## Tools (v1 set for M1)

Every tool taking `tabId` treats it as optional. Default target tab: the executor's current tab
(set by `tab_open` / `tab_switch`) if it still exists; else the active tab of the last focused
normal window if its URL is http(s) or file; else error
`No target tab. Use tab_open or tab_switch first.` Extension pages are never a default target.

| Tool                     | Input                                                                            | Result                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `tabs_list`              | —                                                                                | text: one line per tab `tabId · title · url`, marking current and agent-group tabs                               |
| `tab_open`               | `url?`                                                                           | opens tab in agent group, makes it current; text with tabId                                                      |
| `tab_switch`             | `tabId`                                                                          | makes it current, activates it, adds it to agent group                                                           |
| `tab_close`              | `tabId`                                                                          | closes it                                                                                                        |
| `navigate`               | `url`, `tabId?`                                                                  | loads URL, waits for load (timeout 30s); text with final URL + title                                             |
| `go_back` / `go_forward` | `tabId?`                                                                         | history nav, waits for load                                                                                      |
| `read_page`              | `tabId?`, `filter: 'all' \| 'interactive'` (default `interactive`)               | text tree, see below                                                                                             |
| `find`                   | `query`, `tabId?`                                                                | matching elements (case-insensitive on role/name/value), same line format, max 20                                |
| `get_text`               | `tabId?`                                                                         | page title, URL and readable `innerText`, collapsed whitespace, max 20,000 chars                                 |
| `screenshot`             | `tabId?`                                                                         | JPEG (quality 80) of the viewport; image pixel size == viewport CSS size so x/y from it can be passed to `click` |
| `click`                  | `ref` or `x`+`y`, `button?` (left/right/middle), `clickCount?` (1–3)             | text confirmation                                                                                                |
| `type`                   | `text`, `ref?`                                                                   | focuses `ref` if given, inserts text at focus                                                                    |
| `key`                    | `keys` e.g. `Enter`, `Control+a`, `Shift+Tab`                                    | dispatches press(es)                                                                                             |
| `scroll`                 | `direction` (up/down/left/right), `amount?` (px, default 600), `ref?` or `x`+`y` | text confirmation                                                                                                |
| `form_input`             | `ref`, `value` (string \| boolean)                                               | sets value of input/textarea/select/checkbox/radio, fires `input` + `change`                                     |
| `wait`                   | `ms?` (≤10,000) and/or `text?` + `timeoutMs?` (≤30,000)                          | resolves after delay or when text appears in the page                                                            |

## Page reading (content script)

- WXT content script with `registration: 'runtime'`, injected on demand with
  `browser.scripting.executeScript({ files })`, guarded so a second inject is a no-op. Talks to the
  background through `browser.tabs.sendMessage`.
- Walks the DOM including open shadow roots (iframes: out of scope for M1, note in output when
  present). Skips hidden elements (`display:none`, `visibility:hidden`, `hidden`, `aria-hidden`,
  zero-size), and `script/style/noscript/template`.
- Role: explicit `role` attribute else implicit from tag/type (link, button, textbox, checkbox,
  radio, combobox, listbox, option, heading with level, img, list, listitem, table, row, cell,
  navigation, main, form, dialog…). Name: `aria-labelledby` → `aria-label` → `<label>` → `alt` →
  `title` → `placeholder` → trimmed text (max 100 chars).
- Each listed element gets a ref `e<N>`, stored in a `Map<string, WeakRef<Element>>`; refs reset on
  each `read_page`. Line format, indented by depth:
  `[e12] button "Submit"` · `[e3] textbox "Email" value="a@b.c"` · `[e4] checkbox "Remember" checked`
  · `heading "Pricing" level=2`. `interactive` lists only actionable elements (links, buttons, form
  controls, `[onclick]`, `[tabindex>=0]`, `contenteditable`) flat with no structure lines.
- Output capped at 50,000 chars with a trailing `… truncated` note.
- Ref lookup for `click`/`type`/`scroll`/`form_input`: missing or detached ref →
  `Unknown ref e12. Call read_page again.` Before acting, `scrollIntoView({ block: 'center' })` and
  return the element's center point in viewport CSS px.

## Input (`chrome.debugger`, protocol 1.3)

- Attach lazily per tab, keep attached, forget on `tabs.onRemoved` and `debugger.onDetach` (user
  can cancel the banner; then re-attach on next call).
- `click`: `Input.dispatchMouseEvent` mouseMoved → mousePressed → mouseReleased with `clickCount`.
- `type`: `Input.insertText`.
- `key`: parse `Mod+Mod+Key` into CDP `keyDown`/`keyUp` with correct `key`, `code`,
  `windowsVirtualKeyCode`, `modifiers` bitmask, and `text` for printable keys. Pure function, unit
  tested.
- `scroll`: `mouseWheel` at the point (default viewport center).
- `screenshot`: activate tab first, `Page.captureScreenshot` (jpeg, quality 80) sized to CSS px.

## Agent tab group

- Tabs from `tab_open` / `tab_switch` join one group per window titled `autochrome`, color `cyan`.
  Reuse the group if it exists.

## Executor (`packages/extension/src/`)

- `executor.ts`: `executeTool(call: ToolCall): Promise<ToolResult>` — look up definition, validate
  input with zod (validation errors become readable `ok: false` messages), run handler, catch all
  errors. Single place every caller goes through (debug page now, bridge and agent loop later).
- `tools/*.ts`: handlers grouped by area (tabs, page, input). `browser`/CDP access only via small
  helpers (`debugger.ts`, `content.ts`, `target.ts`) so handlers stay readable.
- Background registers the `autochrome:execute` message listener.
- Manifest permissions: `sidePanel`, `tabs`, `tabGroups`, `scripting`, `debugger`;
  `host_permissions: ['<all_urls>']`.

## Debug page

- Unlisted extension page `debug.html` (React): tool dropdown from `toolDefinitions`, JSON input
  textarea pre-filled with an example, Run button, result view (text in `<pre>`, images as
  `<img>`), and a short history of calls. Linked from the side panel ("Open tool debugger").

## Tests

- Vitest unit tests: key parser, input validation through `executeTool` with a fake handler map,
  read_page line formatting (pure function from a node list).
- Playwright e2e (`packages/extension/e2e/`, `@playwright/test` pinned to `1.63.0` to match the
  pre-installed browser; script `test:e2e`, not part of `pnpm test`):
  - local static server for `e2e/fixtures/*.html` (form with inputs/select/checkbox/button that
    writes results into the page, a second page for navigation, a long page for scroll)
  - launch persistent context with the built extension, open `debug.html`, call tools through
    `chrome.runtime.sendMessage` from that page
  - cover every tool at least once, including: ref click changes the page; `type` + `key Enter`
    submits; `form_input` on select/checkbox; `screenshot` width equals `innerWidth`; back/forward;
    agent group exists with the opened tab; stale ref error after navigation.
- CI: after build, `pnpm exec playwright install --with-deps chromium` then `pnpm test:e2e`.

## Out of scope (later milestones)

iframes, file uploads, drag-and-drop, console/network/JS eval (M6), safety prompts (M5).
