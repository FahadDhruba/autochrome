# autochrome-bridge

Lets outside tools control your real Chrome through the autochrome extension: Claude Code,
Cursor or any MCP client over stdio, and your own scripts over HTTP or WebSocket.

```
Claude Code ─stdio─ autochrome-bridge ─┐
Cursor      ─stdio─ autochrome-bridge ─┼─ hub (127.0.0.1:47800) ─ Chrome extension
script      ─HTTP / WebSocket─────────┘
```

One process owns the port (the hub) and holds the extension connection. Every
`autochrome-bridge` MCP process joins the hub, or starts it if nobody is listening. If the hub's
process exits, one of the others takes over.

## Install

Requires Node 22 or newer and the autochrome extension.

**Claude Code**

```sh
claude mcp add autochrome -- npx autochrome-bridge
```

**Cursor** (`~/.cursor/mcp.json`) and other MCP clients:

```json
{
  "mcpServers": {
    "autochrome": { "command": "npx", "args": ["autochrome-bridge"] }
  }
}
```

## Pair the extension

The first run creates a token in `~/.autochrome/token` (directory `0700`, file `0600`).

1. Run `npx autochrome-bridge token` and copy the output.
2. Open the autochrome side panel in Chrome, go to Settings → Bridge, paste the token and save.
3. The status dot turns green once the extension is connected.

Set `AUTOCHROME_TOKEN` to use a different token without touching the file.

## Port

The default port is `47800`. Change it with `--port <n>` or `AUTOCHROME_PORT`, and enter the same
port in the extension's Bridge settings. The hub only listens on `127.0.0.1`.

## Commands

| Command                     | What it does                                     |
| --------------------------- | ------------------------------------------------ |
| `autochrome-bridge` (`mcp`) | MCP server on stdio; joins or starts the hub     |
| `autochrome-bridge serve`   | Standalone hub for scripts, no MCP client needed |
| `autochrome-bridge token`   | Prints the pairing token                         |

## HTTP API

Every request needs `Authorization: Bearer <token>`. Requests that carry a browser `Origin`
header are refused, so web pages cannot reach the hub.

```sh
TOKEN=$(npx autochrome-bridge token)

curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:47800/v1/status
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:47800/v1/tools

curl -X POST -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"https://example.com"}' http://127.0.0.1:47800/v1/tools/tab_open

curl -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:47800/v1/tools/read_page
```

- `GET /v1/status` returns `{ "extensionConnected": boolean, "protocolVersion": number }`.
- `GET /v1/tools` returns each tool's name, description and JSON Schema input.
- `POST /v1/tools/:name` takes the tool input as the JSON body and returns
  `{ "id", "ok", "content": [...] }`. The status is `200` even when `ok` is `false` (for example
  when Chrome is not connected); `4xx` is only for a bad token, an unknown tool or invalid JSON.
  Calls time out after 120 seconds.

## WebSocket API

Connect to `ws://127.0.0.1:47800/client` and send `{"type":"hello","role":"client","token":"…",
"protocolVersion":1}` first. Then send `{"type":"call","call":{"id":"1","name":"tabs_list","input":{}}}`
and read `{"type":"result","result":{…}}`. The hub also sends `status` messages when the extension
connects or disconnects. The message schemas live in `packages/shared/src/bridge.ts`.
