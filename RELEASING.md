# Releasing

For the maintainer. The repository is prepared for 1.0.0 (versions set, changelog written, icons
and demo GIF committed); the steps below create the tag, the GitHub release and the npm package.
Replace `1.0.0` with the version you are releasing.

## 1. Check main

```sh
git checkout main && git pull
rm -rf node_modules packages/*/node_modules scripts/node_modules
pnpm install --frozen-lockfile
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build && pnpm test:e2e && pnpm docs:tools --check
```

## 2. Bump the version

Set the same version in `packages/extension/package.json` (WXT writes it into the manifest) and
`packages/bridge/package.json`, add a section to `CHANGELOG.md`, and commit. Skip this for 1.0.0,
which is already set.

## 3. Build the extension zip

```sh
pnpm build
pnpm --filter @autochrome/extension zip
```

This produces `packages/extension/.output/autochrome-1.0.0-chrome.zip`. Load it unzipped in
`chrome://extensions` once as a last check.

## 4. Tag and create the GitHub release

```sh
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 packages/extension/.output/autochrome-1.0.0-chrome.zip \
  --title "v1.0.0" --notes "See CHANGELOG.md."
```

(Or create the release in the GitHub UI and attach the zip.)

## 5. Publish the bridge to npm

`packages/bridge/package.json` has `"private": true` so it cannot be published by accident. Remove
that line for the release (do not commit the removal unless you want to):

```sh
cd packages/bridge
# delete the "private": true line from package.json
npm pack --dry-run   # should list only dist, README.md, LICENSE and package.json
npm login
npm publish
```

`npx autochrome-bridge` runs the built `dist/cli.js` and needs Node 22 or newer. Run `pnpm build`
first so `dist` is current.

## 6. Smoke test

In a clean directory and Chrome profile:

1. Install the released zip as an unpacked extension.
2. `npx -y autochrome-bridge --version` prints `autochrome-bridge v1.0.0 (protocol 1)`.
3. `npx -y autochrome-bridge token`, paste the token in Settings → Bridge, and check the status dot
   turns green.
4. `claude mcp add autochrome -- npx -y autochrome-bridge`, then ask Claude Code to open a page and
   read it; approve the prompt in Chrome.
5. In the side panel, add a provider key, run a small task, and check Stop works.

## Afterwards

Update the README note about npm availability and the "from a release zip" section if needed, tick
the release item in `CHECKLIST.md` and announce.
