import { expect, test } from './harness';

test('errors when there is no target tab', async ({ callTool }) => {
  const result = await callTool('read_page');
  expect(result.ok).toBe(false);
  expect(result.content).toEqual([
    { type: 'text', text: 'No target tab. Use tab_open or tab_switch first.' },
  ]);
});

test('tab_open puts the tab in the autochrome group and makes it current', async ({
  baseUrl,
  callText,
  context,
  debugPage,
}) => {
  const opened = await callText('tab_open', { url: `${baseUrl}/form.html` });
  const tabId = Number(/Opened tab (\d+)/.exec(opened)?.[1]);
  expect(opened).toContain('Form fixture');

  const list = await callText('tabs_list');
  expect(list).toContain(`${tabId} · Form fixture · ${baseUrl}/form.html [current, agent]`);
  expect(list).toMatch(/debug\.html$/m);

  const group = await debugPage.evaluate(async (id) => {
    const tab = await chrome.tabs.get(id);
    return chrome.tabGroups.get(tab.groupId);
  }, tabId);
  expect(group).toMatchObject({ title: 'autochrome', color: 'cyan' });
  expect(context.pages()).toHaveLength(3);
});

test('tab_switch and tab_close', async ({ baseUrl, callText, openFixture }) => {
  const first = await openFixture('form.html');
  await openFixture('next.html');
  const list = await callText('tabs_list');
  const firstId = Number(new RegExp(`(\\d+) · Form fixture`).exec(list)?.[1]);

  await callText('tab_switch', { tabId: firstId });
  expect(await callText('get_text')).toContain('Title: Form fixture');

  const switched = await callText('tabs_list');
  expect(switched).toContain(`${firstId} · Form fixture · ${baseUrl}/form.html [current, agent]`);
  expect(switched).toContain('Next page');

  await callText('tab_close', { tabId: firstId });
  await expect.poll(() => first.isClosed()).toBe(true);
  expect(await callText('tabs_list')).not.toContain(`${firstId} · `);
});

test('navigate, go_back and go_forward', async ({ baseUrl, callText, openFixture }) => {
  const page = await openFixture('form.html');

  const navigated = await callText('navigate', { url: `${baseUrl}/next.html` });
  expect(navigated).toContain('Next page');
  expect(page.url()).toBe(`${baseUrl}/next.html`);

  expect(await callText('go_back')).toContain('Form fixture');
  expect(page.url()).toBe(`${baseUrl}/form.html`);

  expect(await callText('go_forward')).toContain('Next page');
  expect(page.url()).toBe(`${baseUrl}/next.html`);
});
