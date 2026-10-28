import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ToolResult } from '@autochrome/shared';
import { expect, refOf, test as base } from './harness';

const cli = path.resolve(import.meta.dirname, '../../bridge/dist/cli.js');
const TOKEN = 'e2e-bridge-token';

type Hub = {
  port: number;
  status: () => Promise<{ extensionConnected: boolean }>;
  callTool: (name: string, input?: object) => Promise<ToolResult>;
};

/** Runs the built bridge CLI as a standalone hub on a free port. */
const test = base.extend<{ hub: Hub }>({
  hub: async ({}, use) => {
    const child = spawn(process.execPath, [cli, 'serve', '--port', '0'], {
      env: { PATH: process.env.PATH ?? '', AUTOCHROME_TOKEN: TOKEN },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const port = await new Promise<number>((resolve, reject) => {
      let output = '';
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = /listening on 127\.0\.0\.1:(\d+)/.exec(output);
        if (match) resolve(Number(match[1]));
      });
      child.once('exit', () => reject(new Error(`Hub exited early:\n${output}`)));
    });

    const request = async (path: string, init?: RequestInit) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${TOKEN}` },
      });
    await use({
      port,
      status: async () => (await request('/v1/status')).json(),
      callTool: async (name, input = {}) =>
        (
          await request(`/v1/tools/${name}`, { method: 'POST', body: JSON.stringify(input) })
        ).json(),
    });
    child.kill();
  },
});

test('drives Chrome through the bridge over HTTP', async ({ baseUrl, debugPage, hub }) => {
  expect(await hub.status()).toMatchObject({ extensionConnected: false });

  const status = debugPage.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'autochrome:bridge-status' }),
  );
  expect(await status).toBe('no-token');

  await debugPage.evaluate(
    ([token, port]) => chrome.storage.local.set({ 'bridge.token': token, 'bridge.port': port }),
    [TOKEN, hub.port] as const,
  );
  await expect.poll(async () => (await hub.status()).extensionConnected).toBe(true);
  expect(
    await debugPage.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'autochrome:bridge-status' }),
    ),
  ).toBe('connected');

  const opened = await hub.callTool('tab_open', { url: `${baseUrl}/form.html` });
  expect(opened.ok).toBe(true);
  expect(opened.content[0]).toMatchObject({ text: expect.stringContaining('Form fixture') });

  const read = await hub.callTool('read_page');
  const tree = (read.content[0] as { text: string }).text;
  expect(read.ok).toBe(true);
  expect(refOf(tree, /textbox/i)).toMatch(/^e\d+$/);

  const invalid = await hub.callTool('click', {});
  expect(invalid.ok).toBe(false);
});

test('reconnects after the extension service worker is stopped', async ({
  context,
  debugPage,
  hub,
}) => {
  test.setTimeout(90_000);
  await debugPage.evaluate(
    ([token, port]) => chrome.storage.local.set({ 'bridge.token': token, 'bridge.port': port }),
    [TOKEN, hub.port] as const,
  );
  await expect.poll(async () => (await hub.status()).extensionConnected).toBe(true);

  const cdp = await context.newCDPSession(debugPage);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await expect.poll(async () => (await hub.status()).extensionConnected).toBe(false);

  // The 30 s alarm wakes the worker, which reconnects on start.
  await expect
    .poll(async () => (await hub.status()).extensionConnected, { timeout: 60_000 })
    .toBe(true);
  expect((await hub.callTool('tabs_list')).ok).toBe(true);
});

test('shows a bad token as such and does not connect', async ({ debugPage, hub }) => {
  await debugPage.evaluate(
    (port) => chrome.storage.local.set({ 'bridge.token': 'wrong', 'bridge.port': port }),
    hub.port,
  );
  await expect
    .poll(() =>
      debugPage.evaluate(() => chrome.runtime.sendMessage({ type: 'autochrome:bridge-status' })),
    )
    .toBe('bad-token');
  expect((await hub.status()).extensionConnected).toBe(false);
});
