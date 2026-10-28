import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';
import type { ToolName, ToolResult } from '@autochrome/shared';

const extensionPath = path.resolve(import.meta.dirname, '../.output/chrome-mv3');
const fixturesPath = path.resolve(import.meta.dirname, 'fixtures');

async function serveFixtures(): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const name = path.basename(new URL(req.url ?? '/', 'http://x').pathname);
      res.setHeader('content-type', 'text/html');
      res.end(await readFile(path.join(fixturesPath, name)));
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

export type CallTool = (name: ToolName, input?: object) => Promise<ToolResult>;

type Fixtures = {
  context: BrowserContext;
  /** Base URL of the local fixture server. */
  baseUrl: string;
  /** The extension's debug page; tools run from here exactly as the debugger UI does. */
  debugPage: Page;
  callTool: CallTool;
  /** Like callTool, but throws on failure and returns the first text item. */
  callText: (name: ToolName, input?: object) => Promise<string>;
  /** Open a fixture in an agent tab and return the Playwright handle for it. */
  openFixture: (file: string) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'autochrome-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },

  baseUrl: async ({}, use) => {
    const server = await serveFixtures();
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    server.close();
  },

  debugPage: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/debug.html`);
    await use(page);
  },

  callTool: async ({ debugPage }, use) => {
    await use((name, input = {}) =>
      debugPage.evaluate(
        (call) => chrome.runtime.sendMessage({ type: 'autochrome:execute', call }),
        { id: crypto.randomUUID(), name, input },
      ),
    );
  },

  callText: async ({ callTool }, use) => {
    await use(async (name, input) => {
      const result = await callTool(name, input);
      const first = result.content[0];
      if (!result.ok || first?.type !== 'text') {
        throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
      }
      return first.text;
    });
  },

  openFixture: async ({ context, baseUrl, callText }, use) => {
    await use(async (file) => {
      // Playwright can register the new tab after tab_open returns, so wait for the event.
      const [page] = await Promise.all([
        context.waitForEvent('page'),
        callText('tab_open', { url: `${baseUrl}/${file}` }),
      ]);
      return page;
    });
  },
});

export { expect } from '@playwright/test';

/** The ref of the first line matching `pattern` in read_page/find output. */
export function refOf(tree: string, pattern: RegExp): string {
  const line = tree.split('\n').find((l) => pattern.test(l));
  const ref = line && /\[(e\d+)\]/.exec(line)?.[1];
  if (!ref) throw new Error(`No ref for ${pattern} in:\n${tree}`);
  return ref;
}
