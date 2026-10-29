# Releasing

GitHub releases are automatic. The **Release** workflow (`.github/workflows/release.yml`) runs
after CI passes on `main`. If the version in `packages/extension/package.json` has no release yet,
it builds the extension zip, creates the `v<version>` tag and the GitHub release, and uses that
version's `CHANGELOG.md` section as the release notes. Merges that do not change the version do
nothing.

## Release a new version

1. In a PR, set the same version in `packages/extension/package.json` (WXT writes it into the
   manifest) and `packages/bridge/package.json`. The workflow fails if they differ.
2. Add a `## [<version>] - <date>` section to `CHANGELOG.md`, plus its link at the bottom. The
   workflow fails if the section is missing.
3. Merge. When CI is green on `main`, the release appears on the
   [Releases page](https://github.com/FahadDhruba/autochrome/releases) with
   `autochrome-<version>-chrome.zip` attached.

If a release run fails, fix the cause in a PR; the next green CI run on `main` retries it. You can
also re-run the failed Release workflow from the Actions tab.

## Publish the bridge to npm (manual)

npm publishing is not automated. `packages/bridge/package.json` has `"private": true` so it cannot
be published by accident. After the GitHub release exists:

```sh
git checkout v1.0.0
pnpm install --frozen-lockfile && pnpm build
cd packages/bridge
# delete the "private": true line from package.json (do not commit it unless you want to)
npm pack --dry-run   # should list only dist, README.md, LICENSE and package.json
npm login
npm publish
```

`npx autochrome-bridge` runs the built `dist/cli.js` and needs Node 22 or newer.

## Smoke test

In a clean directory and Chrome profile:

1. Download the zip from the release, unzip it, and load it unpacked in `chrome://extensions`.
2. `npx -y autochrome-bridge --version` prints `autochrome-bridge v1.0.0 (protocol 1)`.
3. `npx -y autochrome-bridge token`, paste the token in Settings → Bridge, and check the status dot
   turns green.
4. `claude mcp add autochrome -- npx -y autochrome-bridge`, then ask Claude Code to open a page and
   read it; approve the prompt in Chrome.
5. In the side panel, add a provider key, run a small task, and check Stop works.

## Afterwards

Update the README note about npm availability if needed, tick the release item in `CHECKLIST.md`
and announce.
