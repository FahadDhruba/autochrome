# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.2.1] - 2026-10-30

### Changed

- Fewer tokens per step: in the current task only the newest `read_page` and `get_text` result per
  tab is sent to the model again; older ones become a one-line note. Long tool results from earlier
  tasks in the same chat are shortened the same way. The chat you see is unchanged. On real runs
  this cut the history sent by up to 31%.
- `read_page` returns at most 20,000 characters (was 50,000) and suggests `find` for the rest.

## [1.2.0] - 2026-10-30

### Added

- **Gemini Live provider** for Live-only models such as `gemini-3.8-live`: one WebSocket session
  per agent step, spoken answers shown as transcripts, tool calls, screenshots, and tool results
  replayed as text (the Live API ignores `functionResponse` parts in replayed history). Uses the
  Gemini API key when it has none of its own. `gemini-3.8-live-extended-thinking` is marked
  experimental.

### Verified

- Real run with `gemini-3.8-live`: a side-panel form task with approvals (10 tool calls, about
  25 s) and a workflow step repaired by the AI.

## [1.1.1] - 2026-10-30

### Changed

- `navigate` with no tab to work in (a fresh task) now opens a new tab in the agent group instead
  of failing, so the model's natural first step works.
- `wait` for text matches case-insensitively; the model cannot know how a page capitalises it.

### Verified

- First run against a real provider: Gemini (`gemini-3.5-flash-lite`) handled streaming, tool
  calls with thought signatures, screenshots in tool results, a side-panel form task with
  approvals, and a workflow step repaired by the AI.

## [1.1.0] - 2026-10-29

### Added

- **Side panel polish:** tool cards are one collapsed row (tool icon, name, input, and a result
  summary such as "8 elements", "1,240 chars", a screenshot thumbnail, or the first line of an
  error) that opens on click, Enter or Space; failed calls and calls waiting for approval start
  open. Send is always solid and does nothing while the box is empty; while a task runs it becomes
  an outlined Stop. The chat history is a drawer that slides over a dimmed backdrop (closes on the
  backdrop or Escape, moves focus in and back). Provider and model are one compact chip in the
  composer that opens a small editor. Friendly empty states with example prompts for the first
  chat, and Record/Import and New schedule shortcuts when there are no workflows or schedules.
- **Theme switch:** Settings > Appearance offers System, Light and Dark, saved as `ui.theme` and
  applied to the side panel, approve popup and debug page without a flash of the wrong theme.
- **New logo and monochrome theme:** a black-and-white mark (also in the side panel, approve popup
  and debug page headers, and as the extension icon) and a grey UI that follows light and dark
  mode. Colour is kept for meaning only: red for danger and recording, green for success, amber
  for warnings and the Auto badge.
- **Icon toolbar with hover labels:** the side panel header and secondary or row actions (edit,
  delete, export, move step, back, cancel) are icons. Each shows its name in a tooltip on hover
  and keyboard focus and keeps the same accessible name; the active view is highlighted. Primary
  actions (Send, Save, Run, Allow once, Deny) keep icon and text.
- **Workflows (M8):** record your own actions in the side panel (clicks, typed values, selects,
  checkboxes, Enter, page loads; passwords become a `{{password}}` variable and are never stored),
  or save a finished chat as a workflow. Edit, reorder and delete steps, turn a typed value into a
  variable, and export or import workflows as JSON.
- **Replay with AI fallback:** a run opens its own tab, asks for the variables, finds each element
  again by role and name, then text, then selector, and hands a failed step to the default
  provider (at most 8 tool calls). The run log shows each step as ok, repaired by AI or failed with
  its duration and a screenshot, and can update the workflow with the repaired step. Replays go
  through the same permission checks as the agent (new `workflow` source).
- **Bridge and MCP:** `workflows_list` and `workflow_run` tools.
- **Schedules (M9):** run a saved workflow or an AI prompt (with its own provider and model) every
  N minutes (at least 15), daily at a time with optional weekdays, or weekly, via `chrome.alarms`
  while Chrome is open. Times follow the local time zone across daylight saving changes. A run
  missed while Chrome was closed happens once at the next start. Runs go one at a time, never
  queue the same schedule twice, stop after 10 minutes, and work in their own tab group
  (`autochrome · <name>`) that is closed on success and left open on failure. Prompt runs are saved
  as chats.
- **Full-auto scheduled runs:** a new `scheduled` tool source acts as Auto mode whatever the saved
  mode is, including risky actions; `js_eval` is denied instead of asked, and `chrome://` and
  extension pages are still refused. Settings → Safety warns while a schedule is on.
- **Schedules and Runs views** in the side panel (list, editor, run now, enable switch) and one
  Chrome notification per run; clicking it opens the run in the side panel, or in a tab at
  `sidepanel.html#run=<id>`. Runs now record how they started (`manual`, `schedule` or `bridge`);
  older runs read as manual. New `notifications` permission.
- **Test builds:** `pnpm test:e2e` builds the extension with test hooks into `.output-e2e`;
  production builds do not contain them.

## [1.0.0] - 2026-10-29

First release. Everything below was verified with unit tests and Playwright e2e tests against local
mock provider servers; the bridge was also verified with the real Claude Code CLI. The real
provider APIs have not been exercised yet.

### Added

- **Tool executor (M1):** tab tools (list, open, switch, close, navigate, back, forward), page
  reading (`read_page` accessibility tree with element IDs, `find`, `get_text`, `screenshot`) and
  input through `chrome.debugger` (click by ref or x/y, type, keys, scroll, form fill, wait). Agent
  tabs go in their own colored tab group. A debug page runs tools by hand.
- **Bridge (M2):** `autochrome-bridge` with an MCP server on stdio, a localhost HTTP/WebSocket API,
  pairing token, and automatic reconnect when the extension's service worker restarts.
- **Side panel agent (M3):** React chat with tool-call cards and a stop button, an agent loop in the
  background worker, Anthropic provider with streaming tool use, API key and model settings, and
  local chat history.
- **More providers (M4):** OpenAI, Gemini and an OpenAI-compatible provider with a custom base URL
  (Ollama, LM Studio, OpenRouter), with per-chat provider and model switching.
- **Safety (M5):** Ask every action, per-site (default) and auto modes; a per-site allow list;
  risky-action detection (purchases, sending, deleting, password and payment fields); approval
  prompts in the side panel or a popup, also for bridge calls; page content wrapped as untrusted
  data; an "Auto" badge and warning.
- **Multi-tab and debug tools (M6):** work across several tabs in one task, `console_logs`,
  `network_requests`, `network_response`, and `js_eval`, which asks every time.
- **Release (M7):** README, CONTRIBUTING, SECURITY and RELEASING docs, extension icons, demo GIF
  (`pnpm demo`), README tools table generated from the tool definitions (`pnpm docs:tools`),
  issue and pull request templates, and a CI job that builds the extension zip.

### Known limitations

- Not yet tested against real Anthropic, OpenAI, Gemini, Ollama, LM Studio or OpenRouter APIs.
- Chrome only; Edge and Brave should work but are untested.
- Prompt injection cannot be fully prevented; see [SECURITY.md](SECURITY.md).

[1.2.1]: https://github.com/FahadDhruba/autochrome/releases/tag/v1.2.1
[1.2.0]: https://github.com/FahadDhruba/autochrome/releases/tag/v1.2.0
[1.1.1]: https://github.com/FahadDhruba/autochrome/releases/tag/v1.1.1
[1.1.0]: https://github.com/FahadDhruba/autochrome/releases/tag/v1.1.0
[1.0.0]: https://github.com/FahadDhruba/autochrome/releases/tag/v1.0.0
