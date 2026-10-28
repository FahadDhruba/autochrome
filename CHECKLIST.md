# autochrome — Checklist

Tick items as they land. Update this file in the same PR as the work. See [PLAN.md](PLAN.md).

**Current:** M0 — Scaffold

## Planning
- [x] Requirements gathered
- [x] PLAN.md written
- [x] Plan approved

## M0 — Scaffold
- [ ] pnpm monorepo (`shared`, `extension`, `bridge`)
- [ ] TypeScript, ESLint, Prettier
- [ ] Vitest set up
- [ ] WXT extension loads in Chrome (empty side panel)
- [ ] GitHub Actions CI: lint, typecheck, test, build
- [ ] MIT LICENSE

## M1 — Tool executor
- [ ] Shared tool schemas + protocol types
- [ ] Accessibility tree snapshot with element IDs (`read_page`)
- [ ] `find`, `get_text`, `screenshot`
- [ ] Tab tools: list, open, switch, close, navigate, back/forward
- [ ] Input via `chrome.debugger`: click (ID / x,y), type, keys, scroll, form fill, wait
- [ ] Agent tab group
- [ ] Debug page to run tools manually
- [ ] Playwright e2e against local fixture pages

## M2 — Bridge
- [ ] Node bridge package (`npx autochrome-bridge`)
- [ ] WebSocket link extension ↔ bridge, pairing token, localhost only
- [ ] Reconnect when the service worker restarts
- [ ] MCP server (stdio) exposing all tools
- [ ] WebSocket/HTTP API for scripts
- [ ] Verified with Claude Code

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
| Date | Session work |
|---|---|
| 2026-10-28 | Opus/Sonnet setup; requirements gathered; plan + checklist written |
