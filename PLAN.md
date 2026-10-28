# autochrome — Plan

Open-source Chrome extension that lets AI control your real browser, like Claude in Chrome.
It works two ways: an in-browser **side panel chat agent**, and a **bridge** so outside tools
(Claude Code, Cursor, scripts) can drive Chrome.

Status: **Approved, in progress.** Progress is tracked in [CHECKLIST.md](CHECKLIST.md).

## Decisions

| Topic | Decision |
|---|---|
| Product | Side panel agent **and** external bridge |
| AI providers | Multiple: Anthropic, OpenAI, Gemini, OpenAI-compatible (Ollama, LM Studio, OpenRouter) |
| Bridge | MCP server (stdio) **and** WebSocket/HTTP API |
| Page control | Hybrid: accessibility tree + element IDs first, screenshots + x/y clicks as fallback |
| Safety | Selectable modes: Ask every action / Per-site (default) / Auto |
| Stack | TypeScript, React, Vite (WXT), Manifest V3, Node bridge, pnpm monorepo |
| Distribution | Open source on GitHub, MIT license |
| Browsers | Chrome first; Edge/Brave expected to work, untested |
| v1 extras | Multi-tab tasks, debug tools (console/network) |
| v2 (later) | Workflow record/replay, scheduled tasks |

## Architecture

```
┌──────────── Chrome extension (MV3) ────────────┐
│ Side panel (React)  ←→  Background worker      │
│   chat, settings        agent loop, providers, │
│                         tool executor, safety  │
│                    ↕ chrome.debugger / scripts │
│                    Your real tabs              │
└────────────────────────↕───────────────────────┘
                  WebSocket (localhost + pairing token)
┌────────────── Bridge (Node, separate) ─────────┐
│  MCP server (stdio)  →  Claude Code, Cursor…   │
│  WebSocket/HTTP API  →  your own scripts       │
└────────────────────────────────────────────────┘
```

The side panel AI and outside tools share **one tool executor**, so every action behaves the
same and passes the same safety checks.

### Repo layout

- `packages/shared`: tool definitions, message protocol types
- `packages/extension`: WXT + React + Vite (side panel, background worker, content scripts)
- `packages/bridge`: Node MCP server + WebSocket/HTTP API (`npx autochrome-bridge`)

### Browser tools (v1)

- **Tabs:** list, open, switch, close, navigate, back/forward. Agent tabs go in their own colored tab group.
- **Reading:** `read_page` (compact accessibility tree with short element IDs), `find`, `get_text`, `screenshot`.
- **Acting:** click (element ID or x/y), type, keys, scroll, fill form fields, wait.
- **Debug:** console logs, network requests, run JS in page (always asks first).
- Real input events go through `chrome.debugger` (shows Chrome's "being debugged" banner); page reading uses content scripts.

### AI providers

- One provider interface; each provider's tool-calling format is translated in one place.
- API keys stay in local extension storage, never sent to the bridge.
- Default model Sonnet; model picker per chat.

### Safety

1. **Ask every action**
2. **Per-site** (default): approve each site once; still asks before purchases, sending messages,
   deleting, or submitting passwords/payment details.
3. **Auto**: no prompts; warns when enabled.

Always on: stop button; page text is treated as data, never instructions (prompt-injection
resistance); bridge accepts only local connections with the pairing token.

## Milestones (one PR each)

| # | Deliverable | Usable result |
|---|---|---|
| M0 | Monorepo, lint/typecheck/test, CI | Builds |
| M1 | Extension tool executor + accessibility tree reader + tab group | Tools run from a debug page |
| M2 | Bridge + MCP + WebSocket API | Claude Code can control Chrome |
| M3 | Side panel chat + Anthropic provider | In-browser agent works |
| M4 | OpenAI, Gemini, OpenAI-compatible providers | Provider switching |
| M5 | Safety modes + per-site permissions + risky-action checks | Safe on signed-in sites |
| M6 | Multi-tab tasks + console/network tools | Full v1 feature set |
| M7 | README, setup guide, demo GIF, tagged release | Ready to open source |

Bridge (M2) comes before chat (M3) so it's useful early and tools can be tested through Claude Code.

## Testing

- Vitest for logic (provider translation, protocol, safety rules).
- Playwright loads the unpacked extension and runs tools against local test pages.

## Workflow

Per milestone: plan in plan mode (Opus) → user approves → `executor` agent (Sonnet) builds →
`reviewer` agent (Opus) checks it is as intended, up to standard and working → fix until PASS → PR.
Update CHECKLIST.md in the same PR.
