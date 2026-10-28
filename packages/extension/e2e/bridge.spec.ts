import { expect, refOf } from './harness';
import { test, TOKEN } from './hub';

test.beforeEach(async ({ setSafety }) => setSafety({ mode: 'auto' }));

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
