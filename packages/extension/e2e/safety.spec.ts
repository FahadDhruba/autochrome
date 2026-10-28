import type { Page } from '@playwright/test';
import { expect, refOf } from './harness';
import { test, TOKEN } from './hub';
import type { RecordedRequest } from './mockAnthropic';

/** The tool_result block for `toolUseId` in the last message of a request. */
function toolResult(request: RecordedRequest, toolUseId: string) {
  const block = request.body.messages.at(-1)?.content.find((b) => b.tool_use_id === toolUseId);
  const content = block?.content as { text?: string }[] | undefined;
  return {
    isError: block?.is_error === true,
    text: content?.map((item) => item.text ?? '').join('\n') ?? '',
  };
}

async function send(panel: Page, text: string) {
  await panel.getByLabel('Message').fill(text);
  await panel.getByLabel('Message').press('Enter');
}

const card = (panel: Page) => panel.getByTestId('approval-card');

test('per-site: asks on a new site, remembers "Allow on this site", then stops asking', async ({
  baseUrl,
  debugPage,
  mockAnthropic: mock,
  openSidePanel,
}) => {
  mock.play(
    [
      {
        type: 'tool_use',
        id: 'toolu_open',
        name: 'tab_open',
        input: { url: `${baseUrl}/form.html` },
      },
    ],
    [{ type: 'tool_use', id: 'toolu_read', name: 'read_page', input: {} }],
    [{ type: 'text', text: 'First run done.' }],
    [{ type: 'tool_use', id: 'toolu_text', name: 'get_text', input: {} }],
    [{ type: 'text', text: 'Second run done.' }],
  );
  const panel = await openSidePanel();
  await send(panel, 'Look at the form');

  await expect(card(panel)).toBeVisible();
  await expect(card(panel)).toContainText('The AI wants to');
  await expect(card(panel)).toContainText('tab_open');
  await expect(card(panel)).toContainText(baseUrl);
  await expect(card(panel).getByRole('button', { name: 'Allow once' })).toBeVisible();
  await card(panel).getByRole('button', { name: 'Allow on this site' }).click();

  // Everything after that is on the allowed site, so nothing else asks.
  await expect(panel.getByText('First run done.')).toBeVisible();
  await expect(card(panel)).toHaveCount(0);
  expect(await debugPage.evaluate(() => chrome.storage.local.get('safety.sites'))).toEqual({
    'safety.sites': [baseUrl],
  });

  await send(panel, 'Read it again');
  await expect(panel.getByText('Second run done.')).toBeVisible();
  await expect(card(panel)).toHaveCount(0);
  expect(toolResult(mock.requests.at(-1)!, 'toolu_text').text).toContain('<page_content');
});

test('per-site: reading an unapproved site asks, and Deny returns an error to the AI', async ({
  baseUrl,
  mockAnthropic: mock,
  openFixture,
  openSidePanel,
}) => {
  await openFixture('form.html');
  mock.play(
    [{ type: 'tool_use', id: 'toolu_read', name: 'read_page', input: {} }],
    [{ type: 'text', text: 'I could not read it.' }],
  );
  const panel = await openSidePanel();
  await send(panel, 'Read the page');

  await expect(card(panel)).toContainText('read_page');
  await expect(card(panel)).toContainText(baseUrl);
  await card(panel).getByRole('button', { name: 'Deny' }).click();

  await expect(panel.getByText('I could not read it.')).toBeVisible();
  expect(toolResult(mock.requests.at(-1)!, 'toolu_read')).toEqual({
    isError: true,
    text: 'The user denied this action.',
  });
});

test('risky: "Place order" asks even on an allowed site; Deny leaves the page alone', async ({
  baseUrl,
  context,
  mockAnthropic: mock,
  openSidePanel,
  setSafety,
}) => {
  await setSafety({ sites: [baseUrl] });
  // Refs stay valid until the next read_page, so every click uses the one from the first read.
  const orderRef = () =>
    refOf(toolResult(mock.requests[1]!, 'toolu_read').text, /button "Place order"/);
  mock.play(
    [
      {
        type: 'tool_use',
        id: 'toolu_open',
        name: 'tab_open',
        input: { url: `${baseUrl}/checkout.html` },
      },
      { type: 'tool_use', id: 'toolu_read', name: 'read_page', input: {} },
    ],
    () => [{ type: 'tool_use', id: 'toolu_deny', name: 'click', input: { ref: orderRef() } }],
    () => [{ type: 'tool_use', id: 'toolu_allow', name: 'click', input: { ref: orderRef() } }],
    [{ type: 'text', text: 'Ordered.' }],
  );
  const panel = await openSidePanel();
  await send(panel, 'Order it');

  const fixture = async () =>
    context.pages().find((page) => page.url().endsWith('/checkout.html'))!;
  await expect(card(panel)).toContainText('Clicks "Place order" (purchase)');
  await expect(card(panel).getByTestId('approval-risk')).toBeVisible();
  // Risky actions cannot be allowed for the whole site.
  await expect(card(panel).getByRole('button', { name: 'Allow on this site' })).toHaveCount(0);
  await card(panel).getByRole('button', { name: 'Deny' }).click();

  await expect(card(panel)).toBeVisible();
  expect(toolResult(mock.requests.at(-1)!, 'toolu_deny')).toEqual({
    isError: true,
    text: 'The user denied this action.',
  });
  await expect(card(panel)).toContainText('Clicks "Place order" (purchase)');
  await expect((await fixture()).locator('#status')).toHaveText('not ordered');

  await card(panel).getByRole('button', { name: 'Allow once' }).click();
  await expect(panel.getByText('Ordered.')).toBeVisible();
  await expect((await fixture()).locator('#status')).toHaveText('ordered');
});

test('risky: typing a card number or a password asks, a harmless button does not', async ({
  baseUrl,
  context,
  mockAnthropic: mock,
  openSidePanel,
  setSafety,
}) => {
  await setSafety({ sites: [baseUrl] });
  const ref = (pattern: RegExp) => refOf(toolResult(mock.requests[1]!, 'toolu_read').text, pattern);
  mock.play(
    [
      {
        type: 'tool_use',
        id: 'toolu_open',
        name: 'tab_open',
        input: { url: `${baseUrl}/checkout.html` },
      },
      { type: 'tool_use', id: 'toolu_read', name: 'read_page', input: {} },
    ],
    () => [
      { type: 'tool_use', id: 'toolu_count', name: 'click', input: { ref: ref(/button "Count"/) } },
      {
        type: 'tool_use',
        id: 'toolu_card',
        name: 'type',
        input: { text: '4242', ref: ref(/Card number/) },
      },
      {
        type: 'tool_use',
        id: 'toolu_pw',
        name: 'form_input',
        input: { ref: ref(/Password/), value: 'secret' },
      },
    ],
    [{ type: 'text', text: 'Finished.' }],
  );
  const panel = await openSidePanel();
  await send(panel, 'Fill it in');

  // The harmless button runs unasked; the card field and the password field ask.
  await expect(card(panel)).toContainText('Types into a payment field');
  await card(panel).getByRole('button', { name: 'Deny' }).click();
  await expect(card(panel)).toContainText('Types into a password field');
  await card(panel).getByRole('button', { name: 'Deny' }).click();
  await expect(panel.getByText('Finished.')).toBeVisible();

  const page = context.pages().find((p) => p.url().endsWith('/checkout.html'))!;
  await expect(page.locator('#card')).toHaveValue('');
  await expect(page.locator('#password')).toHaveValue('');
  expect(toolResult(mock.requests[2]!, 'toolu_count').isError).toBe(false);
  expect(toolResult(mock.requests[2]!, 'toolu_card').isError).toBe(true);
  expect(toolResult(mock.requests[2]!, 'toolu_pw').isError).toBe(true);
});

test('ask mode prompts for every action, even a scroll', async ({
  baseUrl,
  mockAnthropic: mock,
  openSidePanel,
  setSafety,
}) => {
  await setSafety({ mode: 'ask', sites: [baseUrl] });
  mock.play(
    [
      {
        type: 'tool_use',
        id: 'toolu_open',
        name: 'tab_open',
        input: { url: `${baseUrl}/long.html` },
      },
    ],
    [{ type: 'tool_use', id: 'toolu_scroll', name: 'scroll', input: { direction: 'down' } }],
    [{ type: 'text', text: 'Scrolled.' }],
  );
  const panel = await openSidePanel();
  await send(panel, 'Scroll the page');

  await expect(card(panel)).toContainText('tab_open');
  await card(panel).getByRole('button', { name: 'Allow once' }).click();
  await expect(card(panel)).toContainText('scroll');
  await card(panel).getByRole('button', { name: 'Allow once' }).click();
  await expect(panel.getByText('Scrolled.')).toBeVisible();
});

test('Stop withdraws a waiting prompt', async ({ baseUrl, mockAnthropic: mock, openSidePanel }) => {
  mock.play([
    {
      type: 'tool_use',
      id: 'toolu_open',
      name: 'tab_open',
      input: { url: `${baseUrl}/form.html` },
    },
  ]);
  const panel = await openSidePanel();
  await send(panel, 'Open the form');

  await expect(card(panel)).toBeVisible();
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(card(panel)).toHaveCount(0);
  await expect(panel.getByTestId('assistant-text').last()).toContainText('Stopped.');
});

test('auto mode never prompts, but still refuses chrome:// pages', async ({
  baseUrl,
  mockAnthropic: mock,
  openSidePanel,
  setSafety,
}) => {
  await setSafety({ mode: 'auto' });
  mock.play(
    [
      {
        type: 'tool_use',
        id: 'toolu_open',
        name: 'tab_open',
        input: { url: `${baseUrl}/checkout.html` },
      },
      {
        type: 'tool_use',
        id: 'toolu_chrome',
        name: 'navigate',
        input: { url: 'chrome://settings' },
      },
    ],
    [{ type: 'text', text: 'Done.' }],
  );
  const panel = await openSidePanel();
  await send(panel, 'Go to Chrome settings');

  await expect(panel.getByText('Done.')).toBeVisible();
  await expect(card(panel)).toHaveCount(0);
  await expect(panel.getByTestId('auto-badge')).toBeVisible();
  expect(toolResult(mock.requests.at(-1)!, 'toolu_chrome')).toEqual({
    isError: true,
    text: 'autochrome cannot control chrome:// pages.',
  });
});

test('the debug page is never gated', async ({ baseUrl, callText, openFixture, setSafety }) => {
  await setSafety({ mode: 'ask' });
  await openFixture('form.html');
  expect(await callText('get_text')).toContain('Signup');
  await callText('navigate', { url: `${baseUrl}/next.html` });
  expect(await callText('read_page')).toContain('<page_content site="' + baseUrl + '">');
});

test('page content is wrapped as untrusted data', async ({ baseUrl, callText, openFixture }) => {
  await openFixture('checkout.html');
  const tree = await callText('read_page');
  expect(tree.startsWith(`<page_content site="${baseUrl}">\n`)).toBe(true);
  expect(tree.endsWith('\n</page_content>')).toBe(true);
  const found = await callText('find', { query: 'Place order' });
  expect(found).toMatch(/^<page_content site=".*">\n.*Place order.*\n<\/page_content>$/s);
});

test.describe('settings', () => {
  test('mode, auto confirmation, allowed sites', async ({
    debugPage,
    openSidePanel,
    setSafety,
  }) => {
    await setSafety({ sites: ['https://a.example', 'https://b.example'] });
    const panel = await openSidePanel();
    await panel.getByRole('button', { name: 'Settings', exact: true }).click();
    const safety = panel.getByRole('region', { name: 'Safety settings' });

    await expect(safety.getByRole('radio', { name: /Per-site/ })).toBeChecked();
    await safety.getByRole('radio', { name: /Ask every action/ }).click();
    await expect
      .poll(() => debugPage.evaluate(() => chrome.storage.local.get('safety.mode')))
      .toEqual({ 'safety.mode': 'ask' });

    // Auto needs a confirmation first.
    await safety.getByRole('radio', { name: /Auto/ }).click();
    await expect(safety.getByRole('alert')).toContainText(
      'The AI can act on any site, including ones where you are signed in, without asking.',
    );
    await safety.getByRole('button', { name: 'Cancel' }).click();
    await expect(safety.getByRole('radio', { name: /Ask every action/ })).toBeChecked();
    await expect(panel.getByTestId('auto-badge')).toHaveCount(0);

    await safety.getByRole('radio', { name: /Auto/ }).click();
    await safety.getByRole('button', { name: 'Turn on Auto' }).click();
    await expect(safety.getByRole('radio', { name: /Auto/ })).toBeChecked();
    await expect(panel.getByTestId('auto-badge')).toBeVisible();

    await safety.getByRole('button', { name: 'Remove https://a.example' }).click();
    await expect(safety.getByText('https://a.example')).toHaveCount(0);
    await safety.getByRole('button', { name: 'Clear all' }).click();
    await expect(safety.getByText(/No sites allowed yet/)).toBeVisible();
    expect(await debugPage.evaluate(() => chrome.storage.local.get('safety.sites'))).toEqual({
      'safety.sites': [],
    });
  });
});

test.describe('bridge', () => {
  test.beforeEach(async ({ debugPage, hub }) => {
    await debugPage.evaluate(
      ([token, port]) => chrome.storage.local.set({ 'bridge.token': token, 'bridge.port': port }),
      [TOKEN, hub.port] as const,
    );
    await expect.poll(async () => (await hub.status()).extensionConnected).toBe(true);
  });

  const isApprovePage = (page: Page) => page.url().includes('/approve.html');

  test('with no side panel open, asks in a popup and the HTTP call waits for the answer', async ({
    baseUrl,
    context,
    hub,
    openFixture,
  }) => {
    await openFixture('checkout.html');
    const opened = context.waitForEvent('page', isApprovePage);
    const call = hub.callTool('click', { x: 5, y: 5 });

    const popup = await opened;
    await expect(popup.getByTestId('approval-card')).toContainText('An external tool wants to');
    await expect(popup.getByTestId('approval-card')).toContainText(baseUrl);
    await popup.getByRole('button', { name: 'Allow once' }).click();

    expect((await call).ok).toBe(true);
    await expect.poll(() => popup.isClosed()).toBe(true);
  });

  test('a denied popup request fails the HTTP call', async ({ context, hub, openFixture }) => {
    await openFixture('checkout.html');
    const opened = context.waitForEvent('page', isApprovePage);
    const call = hub.callTool('get_text');
    await (await opened).getByRole('button', { name: 'Deny' }).click();
    expect(await call).toMatchObject({
      ok: false,
      content: [{ type: 'text', text: 'The user denied this action.' }],
    });
  });

  test('closing the popup without answering denies', async ({ context, hub, openFixture }) => {
    await openFixture('checkout.html');
    const opened = context.waitForEvent('page', isApprovePage);
    const call = hub.callTool('get_text');
    const popup = await opened;
    await expect(popup.getByTestId('approval-card')).toBeVisible();
    await popup.close();
    expect((await call).ok).toBe(false);
  });

  test('with the side panel open, asks inline in the chat', async ({
    baseUrl,
    context,
    hub,
    openFixture,
    openSidePanel,
  }) => {
    await openFixture('checkout.html');
    const panel = await openSidePanel();
    const call = hub.callTool('get_text');

    await expect(card(panel)).toContainText('An external tool wants to');
    await expect(card(panel)).toContainText('get_text');
    await expect(card(panel)).toContainText(baseUrl);
    await card(panel).getByRole('button', { name: 'Allow on this site' }).click();
    const result = await call;
    expect(result.ok).toBe(true);
    expect(context.pages().some(isApprovePage)).toBe(false);

    // The site is now allowed for the bridge as well.
    expect((await hub.callTool('read_page')).ok).toBe(true);
    await expect(card(panel)).toHaveCount(0);
  });
});
