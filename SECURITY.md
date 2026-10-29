# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/FahadDhruba/autochrome/security/advisories/new). Do not
open a public issue for a security problem.

Include what you found, how to reproduce it and the version (extension `manifest.json` version and
`npx autochrome-bridge --version`). This is a small volunteer project: expect an acknowledgement
within about a week, and a fix or an explanation after that. Reports are credited unless you ask
otherwise.

Supported version: the latest release.

## Threat model

autochrome lets an AI act in your real, signed-in browser. That is powerful by design, so the
design tries to keep you in control:

- **You choose how much the AI may do.** Safety modes (ask every action, per-site, auto) gate every
  tool call from one place in the extension, for the side panel agent and the bridge alike.
  Purchases, sending, deleting and password or card entry ask even on allowed sites, except in auto
  mode. `js_eval` asks every time in every mode. Browser-internal pages (`chrome://`, extension
  pages, the Chrome Web Store) are refused.
- **Web pages are untrusted.** Page text returned to the model is wrapped in `<page_content>` tags
  and the system prompt says to treat it as data, never as instructions.
- **Keys stay local.** Provider API keys are kept in the extension's local storage and are sent only
  to the provider you configure, never to the bridge.
- **The bridge is local and authenticated.** It listens on `127.0.0.1` only, requires the pairing
  token (stored in `~/.autochrome/token`, mode `0600`), and rejects HTTP requests that carry a
  browser `Origin` header so web pages cannot call it.

## Known limits

- **Prompt injection cannot be fully prevented.** A hostile page can try to steer the model. The
  wrapping and the approval prompts reduce the risk; they do not remove it. Read approval prompts
  before accepting, and avoid auto mode on untrusted pages or sensitive accounts.
- Risky-action detection is keyword and form based and will miss some cases.
- The extension needs broad permissions (all sites, `debugger`, `scripting`) to do its job. Chrome
  shows a debugging banner while it is attached.
- Anyone who can read your pairing token, or who runs code as your user, can drive your browser
  through the bridge.
- Not yet tested against real provider APIs; see the Status section of the README.
