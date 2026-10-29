# M7 — Release prep

Goal: someone who finds the repo on GitHub can install, set up and use autochrome in minutes,
and contribute. **Prepare only**: no tag, no GitHub release and no npm publish from here. The
maintainer merges the PR, tags `v1.0.0` and publishes `autochrome-bridge` using the commands in
`RELEASING.md`.

## README.md (root)

Short and scannable, in this order:

1. One-line pitch + the demo GIF.
2. What it does: side panel agent (Claude, OpenAI, Gemini, Ollama/LM Studio/OpenRouter), bridge
   for Claude Code/Cursor/scripts, safety modes, debug tools.
3. **Install the extension**: build from source (`pnpm install && pnpm build`, load unpacked
   `packages/extension/.output/chrome-mv3`) and from a release `.zip` (once releases exist).
4. **Use the side panel**: open it, pick a provider in Settings, give it a task. Where keys are
   stored.
5. **Use from Claude Code / Cursor / scripts**: `npx autochrome-bridge token` → paste in Settings
   → Bridge; `claude mcp add autochrome -- npx -y autochrome-bridge`; Cursor `mcp.json`
   snippet; curl example. Link to `packages/bridge/README.md` for details.
6. **Safety**: the three modes, what counts as risky, `js_eval` always asks, page content treated
   as untrusted. Honest limits (prompt injection can't be fully prevented; review approvals).
7. **Tools** table (name + one line), generated from `toolDefinitions` by a script
   (`pnpm docs:tools`) so it can't drift; CI checks it is up to date.
8. Development: repo layout, scripts, tests, architecture diagram from PLAN.md. Link
   CONTRIBUTING.md.
9. License.

Keep claims accurate: say providers other than the mocks were tested by hand only where true
(fill from CHECKLIST.md's session log).

## Other docs

- `CONTRIBUTING.md`: setup, scripts, how tests are organised (unit vs e2e, mock providers), code
  style, how to add a tool (shared definition → handler → safety group → test), how to add a
  provider, PR checklist.
- `packages/bridge/README.md`: refresh for M5 (approvals from bridge calls) and M6 tools.
- `SECURITY.md`: how to report a vulnerability (GitHub private advisories), threat model summary.
- `RELEASING.md`: version bump, `pnpm build`, `pnpm --filter @autochrome/extension zip`,
  `git tag v1.0.0 && git push origin v1.0.0`, create the GitHub release with the zip,
  `cd packages/bridge && npm publish` (remove `private` first — say so), and a post-release smoke
  test.
- `CHANGELOG.md` with a 1.0.0 entry summarising M0–M6.
- `.github/ISSUE_TEMPLATE/` (bug, feature) and `.github/pull_request_template.md`, short.

## Versions and packaging

- Set `1.0.0` in the extension manifest/package and the bridge package; keep `private: true` on
  the bridge (publishing is the maintainer's step, documented in RELEASING.md).
- Bridge `package.json`: `repository`, `homepage`, `bugs`, `keywords`, `files`, `bin` correct;
  `npm pack --dry-run` lists only dist + README + LICENSE.
- Extension: `wxt zip` produces `autochrome-1.0.0-chrome.zip`; icons (16/32/48/128) — add a
  simple generated icon (SVG source + PNGs) if none exists.

## Demo GIF

- Recorded by a script, not by hand: `scripts/demo/record.ts` runs Playwright with the built
  extension, a mock provider scripted to do a short realistic task on a local demo page (e.g.
  fill and submit a small form, with one approval prompt), and captures frames of the side panel
  next to the page (compose both into one frame, ~1000×600).
- Encode frames to `docs/demo.gif` with a small JS encoder dependency (e.g. `gifenc`), ≤ 3 MB,
  ~10 fps, ≤ 20 s. Commit the GIF. `pnpm demo` regenerates it.
- The README states the demo uses a scripted model.

## CI

- Add `docs:tools` check. Add a job step that runs `wxt zip` and uploads the zip as a workflow
  artifact (no release).

## Checklist

- Tick M7 items except "Tag v1.0.0 release", which stays open for the maintainer, with a note
  pointing to RELEASING.md.
