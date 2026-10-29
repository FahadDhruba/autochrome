# Releasing

Releases are automatic. The **Release** workflow (`.github/workflows/release.yml`) runs after CI
passes on `main`. For the version in `packages/extension/package.json` it creates whatever is
missing: the `v<version>` tag and GitHub release (with the extension zip, and that version's
`CHANGELOG.md` section as the notes), and the `autochrome-bridge` package on npm. Merges that do
not change the version do nothing.

## Release a new version

1. In a PR, set the same version in `packages/extension/package.json` (WXT writes it into the
   manifest) and `packages/bridge/package.json`. The workflow fails if they differ.
2. Add a `## [<version>] - <date>` section to `CHANGELOG.md`, plus its link at the bottom. The
   workflow fails if the section is missing.
3. Merge. When CI is green on `main`, the release appears on the
   [Releases page](https://github.com/FahadDhruba/autochrome/releases) with
   `autochrome-<version>-chrome.zip` attached, and the new bridge version is on npm.

If a release run fails, fix the cause in a PR; the next green CI run on `main` retries it. You can
also re-run the failed Release workflow from the Actions tab.

## npm

The same workflow publishes `autochrome-bridge` to npm with
[trusted publishing](https://docs.npmjs.com/trusted-publishers): npm checks the workflow's GitHub
identity, so there is no npm token in the repository, and each version gets a provenance statement
linking it to the commit it was built from. It is skipped when the version is already on npm.

### One-time setup

npm only lets you add a trusted publisher to a package that already exists, so the first version is
published by hand:

```sh
git checkout main && git pull
pnpm install --frozen-lockfile && pnpm build
cd packages/bridge
pnpm pack            # turns workspace: dependencies into real versions
npm login
npm publish ./autochrome-bridge-1.0.0.tgz --access public
```

Then on npmjs.com open the package → **Settings** → **Trusted publishing**, choose **GitHub
Actions**, and enter owner `FahadDhruba`, repository `autochrome`, workflow file `release.yml`
(no environment). After that, every release publishes automatically. You can also set the package
to require two-factor authentication and disallow tokens, since the workflow no longer needs one.

If the workflow runs before the package exists, its npm step fails; publish by hand as above and
re-run the failed Release workflow, which then skips npm.

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
