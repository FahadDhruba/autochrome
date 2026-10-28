# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - Unreleased

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

[1.0.0]: https://github.com/FahadDhruba/autochrome/releases/tag/v1.0.0
