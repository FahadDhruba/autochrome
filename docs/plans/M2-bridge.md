# M2 — Bridge

Goal: outside tools control Chrome through the extension. Claude Code (or any MCP client) adds
`npx autochrome-bridge` as an MCP server; scripts use a local HTTP/WebSocket API. Every call ends
up in the extension's existing `executeTool`, so behavior matches the debug page exactly.

## Topology: one hub, many clients

```
Claude Code ─stdio─ bridge (mcp) ─┐
Cursor      ─stdio─ bridge (mcp) ─┼─ws /client─┐
script      ─HTTP / ws /client────┘            │
                                         hub (127.0.0.1:47800) ─ws /extension─ Chrome extension
```

- The **hub** owns the port, holds the single extension connection and routes calls to it.
- `autochrome-bridge` (default command = `mcp`) speaks MCP over stdio. On start it connects to the
  hub as a client; if no hub is listening it **becomes the hub** in-process. If the hub process
  exits, remaining `mcp` processes retry and one takes over (port bind decides the winner).
- `autochrome-bridge serve` runs a standalone hub (for scripts without an MCP client).
- `autochrome-bridge token` prints the pairing token.
- Port: `AUTOCHROME_PORT` env or `--port`, default `47800`. Bind `127.0.0.1` only.

## Auth

- Token: 32 random bytes hex, created on first run at `~/.autochrome/token` (dir 0700, file 0600),
  reused afterwards. `AUTOCHROME_TOKEN` env overrides (used by tests).
- Every connection authenticates: WebSocket first message `{ type: 'hello', role, token,
protocolVersion }`, close with a clear reason on mismatch; HTTP `Authorization: Bearer <token>`.
- `/extension` also requires an `Origin` starting with `chrome-extension://`. Reject browser
  web-page origins (`http(s)://`) on every endpoint, so a website cannot reach the hub.
- Constant-time token comparison.

## Wire protocol (`packages/shared/src/bridge.ts`)

zod-validated messages, versioned with `PROTOCOL_VERSION`:

- client → hub: `hello`, `call { call: ToolCall }`, `list_tools`
- hub → client: `welcome { extensionConnected }`, `result { result: ToolResult }`,
  `tools { tools: { name, description, inputSchema }[] }`, `status { extensionConnected }`
- hub ↔ extension: `hello`, `call`, `result`, `ping`/`pong`
- Hub keeps a pending map `callId → client`; times out a call after 120 s; when the extension is
  not connected it answers immediately with `ok: false`:
  `Chrome extension not connected. Open Chrome with autochrome installed and paste the bridge token in its side panel (Settings → Bridge).`
- Hub assigns its own call ids so ids from different clients cannot collide.
- JSON Schema for tools comes from `z.toJSONSchema()` of `toolDefinitions` (one shared helper).

## HTTP API (on the hub)

- `GET /v1/status` → `{ extensionConnected, protocolVersion }`
- `GET /v1/tools` → tool list with JSON Schema
- `POST /v1/tools/:name` body = tool input → `ToolResult` (HTTP 200 even when `ok: false`; 4xx only
  for auth/unknown tool/bad JSON)

## MCP server

- `@modelcontextprotocol/sdk`, stdio transport, server name `autochrome`.
- `tools/list` from the shared definitions; `tools/call` forwards through the hub;
  `ToolResult.content` maps 1:1 to MCP content, `ok: false` → `isError: true`.
- Nothing but MCP on stdout; logs go to stderr.

## Extension side

- `src/bridge.ts` in the background: connects to `ws://127.0.0.1:<port>/extension` when a token is
  saved. Reconnect with backoff 1 s → 5 s max (the hub also holds calls up to 30 s while the extension connects). Send `ping` every 20 s (keeps the MV3 worker
  alive). A `chrome.alarms` alarm every 30 s reconnects if the worker was restarted.
- Incoming `call` → `executeTool` → `result`.
- Settings in `chrome.storage.local`: `bridge.token`, `bridge.port`. Background exposes status to
  the UI through a runtime message (`autochrome:bridge-status`) and broadcasts changes.
- Side panel gets a minimal **Settings → Bridge** section: token field, port field, status dot
  (connected / waiting for bridge / bad token). (M3 builds the full settings view around it.)
- Add `alarms` and `storage` permissions.

## Tests

- Vitest (bridge package):
  - hub + fake extension (ws client) + HTTP: status, tools list, call round-trip, `ok: false`
    when no extension, bad token rejected, web origin rejected, call timeout.
  - two clients with concurrent calls get their own results.
  - takeover: kill the hub, a waiting `mcp` instance becomes hub.
  - MCP: spawn the built CLI with the SDK's stdio client, `listTools` and a `callTool` against the
    fake extension.
- Playwright e2e: start a hub with a test token, launch the real extension, set the token through
  `chrome.storage.local` from the debug page, wait for connected, then `POST /v1/tools/tab_open`
  and `read_page` on a fixture page and assert results.

## Docs

- `packages/bridge/README.md`: install, `claude mcp add autochrome -- npx autochrome-bridge`,
  Cursor JSON config, token setup, HTTP examples with `curl`.
