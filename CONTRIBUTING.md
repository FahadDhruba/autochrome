# Contributing

Thanks for helping. Bug reports, fixes and new providers or tools are all welcome. For anything
bigger than a small fix, open an issue first so we can agree on the approach.

## Setup

Requires Node 22 and pnpm 10 (`corepack enable` picks the right pnpm).

```sh
git clone https://github.com/FahadDhruba/autochrome.git
cd autochrome
pnpm install
pnpm build
```

`pnpm dev` starts WXT in watch mode. To try the extension, load
`packages/extension/.output/chrome-mv3` (or the dev output WXT prints) as an unpacked extension in
`chrome://extensions`.

## Scripts

| Command           | What it does                                                     |
| ----------------- | ---------------------------------------------------------------- |
| `pnpm build`      | Builds shared, the extension and the bridge                      |
| `pnpm lint`       | ESLint                                                           |
| `pnpm format`     | Prettier (writes); `pnpm format:check` only checks               |
| `pnpm typecheck`  | `tsc` in every package                                           |
| `pnpm test`       | Vitest unit tests                                                |
| `pnpm test:e2e`   | Playwright e2e tests (needs `pnpm build` first)                  |
| `pnpm docs:tools` | Regenerates the README tools table; add `--check` to only verify |
| `pnpm icons`      | Renders the extension icon PNGs from `scripts/icons/icon.svg`    |
| `pnpm demo`       | Re-records `docs/demo.gif` (needs `pnpm build` first)            |

The first time you run e2e tests, install a browser with `pnpm --filter @autochrome/extension exec playwright install chromium`.

## How tests are organised

- **Unit tests** (`*.test.ts` next to the code, run by Vitest): provider message translation and
  streaming, the protocol, safety rules, the agent loop and the bridge hub and MCP server. They use
  fakes and need no browser.
- **e2e tests** (`packages/extension/e2e/*.spec.ts`, run by Playwright): load the built unpacked
  extension in Chromium and drive it against fixture pages in `e2e/fixtures`. Playwright cannot
  drive Chrome's real side panel, so the side panel page is opened as a normal tab.
- **Mock providers** (`e2e/mockAnthropic.ts`, `e2e/mockProviders.ts`): local HTTP servers that
  play scripted streaming replies in each provider's wire format. Tests point the extension at them
  through the provider base URL setting. No test calls a real provider API, so changes to provider
  code are only as good as the provider documentation you followed. If you have keys, trying a real
  run by hand and reporting the result is very valuable.
- **Test hooks.** `pnpm test:e2e` first builds the extension with `wxt build --mode e2e` into
  `packages/extension/.output-e2e`, which includes `src/schedules/testHook.ts` (fire a schedule's
  alarm handler now, simulate a notification click or a browser start). Production builds
  (`.output`) leave it out; do not move it out of the `import.meta.env.MODE !== 'production'` guard
  in `entrypoints/background.ts`.
- **Bridge e2e** (`e2e/bridge.spec.ts`) runs the built `packages/bridge/dist/cli.js`, so build
  before running e2e.

## Code style

TypeScript in strict mode, formatted by Prettier and linted by ESLint; run `pnpm format` before you
commit. Keep modules small, put logic in pure functions where you can (they are easy to unit test),
and comment why, not what.

## Adding a tool

1. **Shared definition.** Add it to `toolDefinitions` in `packages/shared/src/tools.ts` with a clear
   description (the model reads it) and a zod input schema. The bridge, MCP server and README table
   pick it up from there.
2. **Handler.** Implement it in the matching file in `packages/extension/src/tools/` (tabs, page,
   input or debug). The handler map is typed over every tool name, so TypeScript tells you what is
   missing.
3. **Safety group.** Classify it in `TOOL_GROUPS` in `packages/extension/src/safety/gate.ts`
   (`free`, `read`, `action` or `always_ask`). If its output contains page text, add it to
   `PAGE_CONTENT_TOOLS` in `src/executor.ts` so it is wrapped as untrusted content.
4. **Tests.** Add unit tests for the logic and an e2e test in `packages/extension/e2e` against a
   fixture page. Add gate cases for the new tool in `src/safety/gate.test.ts`.
5. Run `pnpm docs:tools` to refresh the README table, and mention the tool in the bridge README if
   it changes what clients can do.

## Adding a provider

1. Create `packages/extension/src/providers/<name>/` that implements `Provider` from
   `providers/types.ts`: `listModels` and `stream`, translating the internal message and tool
   format to and from the provider's API in one place.
2. Add the id to `ProviderId` and register it in `providers/index.ts` (`PROVIDER_IDS`, label,
   default model and base URL). Most OpenAI-style servers need no new code: use the
   OpenAI-compatible provider with a base URL.
3. Add translation and streaming unit tests, and a mock server in `e2e/mockProviders.ts` with an
   e2e test that runs a tool-using task through it.
4. Check that the side panel's provider list and Settings show it.

## Pull requests

- One focused change per PR, with tests for new behaviour.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`
  and `pnpm docs:tools --check` all pass (CI runs the same).
- Update `README.md`, the bridge README or `CHANGELOG.md` when behaviour users see changes.
- Anything touching safety (approvals, risky-action rules, the bridge's auth) needs extra care:
  explain the threat model change in the PR description.
