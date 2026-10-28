# autochrome — Checklist

Tick items as they land. Update this file in the same PR as the work. See [PLAN.md](PLAN.md).

**Current:** M3 — Side panel + Anthropic

## Planning

- [x] Requirements gathered
- [x] PLAN.md written
- [x] Plan approved

## M0 — Scaffold

- [x] pnpm monorepo (`shared`, `extension`, `bridge`)
- [x] TypeScript, ESLint, Prettier
- [x] Vitest set up
- [x] WXT extension loads in Chrome (empty side panel)
- [x] GitHub Actions CI: lint, typecheck, test, build
- [x] MIT LICENSE

## M1 — Tool executor

- [x] Shared tool schemas + protocol types
- [x] Accessibility tree snapshot with element IDs (`read_page`)
- [x] `find`, `get_text`, `screenshot`
- [x] Tab tools: list, open, switch, close, navigate, back/forward
- [x] Input via `chrome.debugger`: click (ID / x,y), type, keys, scroll, form fill, wait
- [x] Agent tab group
- [x] Debug page to run tools manually
- [x] Playwright e2e against local fixture pages

## M2 — Bridge

- [x] Node bridge package (`npx autochrome-bridge`)
- [x] WebSocket link extension ↔ bridge, pairing token, localhost only
- [x] Reconnect when the service worker restarts
- [x] MCP server (stdio) exposing all tools
- [x] WebSocket/HTTP API for scripts
- [x] Verified with Claude Code

## M3 — Side panel + Anthropic

- [ ] Provider interface
- [ ] Anthropic provider (tool use, streaming)
- [ ] Agent loop in background worker
- [ ] React chat UI: messages, tool call display, stop button
- [ ] Settings: API keys, model picker
- [ ] Chat history in local storage

## M4 — More providers

- [ ] OpenAI
- [ ] Gemini
- [ ] OpenAI-compatible (Ollama, LM Studio, OpenRouter) with custom base URL
- [ ] Per-chat provider/model switch

## M5 — Safety

- [ ] Mode setting: Ask every / Per-site / Auto
- [ ] Per-site permission store + approval UI
- [ ] Risky-action detection (purchase, send, delete, password/payment)
- [ ] Bridge requests go through the same checks
- [ ] Prompt-injection guard in system prompt and tool results
- [ ] Auto-mode warning

## M6 — Multi-tab + debug

- [ ] Multi-tab tasks (work across tabs in one task)
- [ ] Console log capture tool
- [ ] Network request capture tool
- [ ] JS eval tool (always asks)

## M7 — Release

- [ ] README with setup for extension + bridge
- [ ] MCP client config examples (Claude Code, Cursor)
- [ ] Demo GIF
- [ ] CONTRIBUTING.md
- [ ] Tag v1.0.0 release

## v2 (later)

- [ ] Workflow record/replay
- [ ] Scheduled tasks

## Session log

| Date       | Session work                                                                    |
| ---------- | ------------------------------------------------------------------------------- |
| 2026-10-28 | Opus/Sonnet setup; requirements gathered; plan + checklist written              |
| 2026-10-28 | M0 scaffold built and verified (monorepo, tooling, WXT side panel, CI)          |
| 2026-10-28 | M1 tool executor built and verified (17 tools, content script, debug page, e2e) |
| 2026-10-28 | M2 bridge built and verified (hub, MCP, HTTP/WS API, extension link, e2e)       |
