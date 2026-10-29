# autochrome — Checklist

Tick items as they land. Update this file in the same PR as the work. See [PLAN.md](PLAN.md).

**Current:** v2 — M9 Schedules ([docs/plans/v2-workflows-schedules.md](docs/plans/v2-workflows-schedules.md))

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

- [x] Provider interface
- [x] Anthropic provider (tool use, streaming)
- [x] Agent loop in background worker
- [x] React chat UI: messages, tool call display, stop button
- [x] Settings: API keys, model picker
- [x] Chat history in local storage

## M4 — More providers

- [x] OpenAI
- [x] Gemini
- [x] OpenAI-compatible (Ollama, LM Studio, OpenRouter) with custom base URL
- [x] Per-chat provider/model switch

## M5 — Safety

- [x] Mode setting: Ask every / Per-site / Auto
- [x] Per-site permission store + approval UI
- [x] Risky-action detection (purchase, send, delete, password/payment)
- [x] Bridge requests go through the same checks
- [x] Prompt-injection guard in system prompt and tool results
- [x] Auto-mode warning

## M6 — Multi-tab + debug

- [x] Multi-tab tasks (work across tabs in one task)
- [x] Console log capture tool
- [x] Network request capture tool
- [x] JS eval tool (always asks)

## M7 — Release

- [x] README with setup for extension + bridge
- [x] MCP client config examples (Claude Code, Cursor)
- [x] Demo GIF
- [x] CONTRIBUTING.md
- [x] SECURITY.md, RELEASING.md, CHANGELOG.md, issue and PR templates
- [x] Extension icons, 1.0.0 versions, bridge package metadata, CI zip artifact
- [x] Automatic GitHub release on version bump (`.github/workflows/release.yml`)
- [x] v1.0.0 GitHub release created by the workflow
- [x] Automatic npm publish of `autochrome-bridge` with trusted publishing (`.github/workflows/release.yml`)
- [x] First npm publish of 1.0.0 by hand + trusted publisher setup on npmjs.com (maintainer)

## v2 — Workflows and schedules

- [x] Requirements gathered
- [x] Plan approved

### M8 — Workflows

- [x] Workflow format (shared, zod) with variables and target hints
- [x] Record your own actions (passwords become variables)
- [x] Save a finished AI chat as a workflow
- [x] Workflow editor + JSON import/export
- [x] Replay with AI fallback for failed steps + run log
- [x] Bridge/MCP: `workflows_list`, `workflow_run`

### M9 — Schedules

- [ ] Schedule model + next-run calculation (catch up once after missed runs)
- [ ] Runs via `chrome.alarms` in their own tab group, full auto (except `js_eval`)
- [ ] Workflow or prompt schedules
- [ ] Schedules + Runs views
- [ ] Chrome notification per run

## Session log

| Date       | Session work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-28 | Opus/Sonnet setup; requirements gathered; plan + checklist written                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-28 | M0 scaffold built and verified (monorepo, tooling, WXT side panel, CI)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-28 | M1 tool executor built and verified (17 tools, content script, debug page, e2e)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-28 | M2 bridge built and verified (hub, MCP, HTTP/WS API, extension link, e2e)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-28 | M3 side panel chat + Anthropic provider built and verified with a mock Anthropic server (unit + e2e); real Anthropic API not exercised (no key)                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-28 | M4 OpenAI, Gemini and OpenAI-compatible providers + per-chat provider/model picker built and verified with mock servers (unit + e2e); real provider APIs not exercised (no keys), docs checked only via search and SDK typings                                                                                                                                                                                                                                                                      |
| 2026-10-28 | M5 safety built and verified (one permission gate for agent/bridge/debug, three modes, per-site allow list, risky-action detection, inline + popup approval prompts, `<page_content>` wrapping, Auto badge; unit + e2e)                                                                                                                                                                                                                                                                             |
| 2026-10-28 | M6 multi-tab + debug tools built and verified (tab context line, background tabs, per-step tab state note kept out of the Anthropic cached prefix, console/network capture via `chrome.debugger`, `js_eval` that asks in every mode; unit + e2e)                                                                                                                                                                                                                                                    |
| 2026-10-28 | M7 release prep built and verified (README with honest status, CONTRIBUTING, SECURITY, RELEASING, CHANGELOG, templates, icons, scripted demo GIF via `pnpm demo`, `pnpm docs:tools` + CI check, extension zip in CI, 1.0.0 versions); tag, GitHub release and npm publish left to the maintainer                                                                                                                                                                                                    |
| 2026-10-29 | PR #2 merged; CI fixed on GitHub (Playwright install path, hidden `.output` upload); automatic GitHub release workflow added                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-29 | v1.0.0 GitHub release created by the workflow; automatic npm publish of the bridge via trusted publishing added (first publish by hand)                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-29 | v2 requirements gathered (record + save-from-chat, fast replay with AI fallback, variables, schedules in full auto with notifications); plan written                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-29 | M8 workflows built and verified (shared zod format, recorder in the content script that never sends password values, target resolution by role/name then text then selector, replay runner with AI fallback and run log, side panel Workflows view with editor, JSON import/export and "Save as workflow", bridge tools `workflows_list` and `workflow_run`; 499 unit + 70 e2e tests, e2e also run 3x); real provider APIs still not exercised, AI fallback verified with the mock Anthropic server |
