import { expect, refOf, test } from './harness';

test('click by ref changes the page', async ({ callText, openFixture }) => {
  const page = await openFixture('form.html');
  const ref = refOf(await callText('read_page'), /button "Count"/);

  await callText('click', { ref });
  await callText('click', { ref });
  await expect(page.locator('#clicks')).toHaveText('clicks: 2');
});

test('click by x/y taken from the viewport', async ({ callText, openFixture }) => {
  const page = await openFixture('form.html');
  const box = (await page.locator('#counter').boundingBox())!;

  await callText('click', { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await expect(page.locator('#clicks')).toHaveText('clicks: 1');
});

test('click supports double click and right button', async ({ callText, openFixture }) => {
  const page = await openFixture('form.html');
  await page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { log: string[] }).log = log;
    document.addEventListener('dblclick', () => log.push('dblclick'));
    document.addEventListener('contextmenu', () => log.push('contextmenu'));
  });
  const ref = refOf(await callText('read_page'), /button "Count"/);

  await callText('click', { ref, clickCount: 2 });
  await callText('click', { ref, button: 'right' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { log: string[] }).log))
    .toEqual(['dblclick', 'contextmenu']);
});

test('type then key Enter submits the form', async ({ callText, openFixture }) => {
  const page = await openFixture('form.html');
  const ref = refOf(await callText('read_page'), /textbox "Name"/);

  await callText('type', { text: 'Ada Lovelace', ref });
  await expect(page.locator('#name')).toHaveValue('Ada Lovelace');
  await callText('key', { keys: 'Enter' });
  await expect(page.locator('#result')).toContainText('"name":"Ada Lovelace"');
});

test('key handles shortcuts and key sequences', async ({ callText, openFixture }) => {
  const page = await openFixture('form.html');
  const ref = refOf(await callText('read_page'), /textbox "Name"/);

  await callText('type', { text: 'first', ref });
  await callText('key', { keys: 'Control+a' });
  await callText('type', { text: 'second' });
  await expect(page.locator('#name')).toHaveValue('second');

  await callText('key', { keys: 'Shift+Tab' });
  await expect(page.locator('#name')).not.toBeFocused();
  await callText('key', { keys: 'Tab Tab' });
  await expect(page.locator('#email')).toBeFocused();
});

test('form_input sets select, checkbox and text with input + change events', async ({
  callText,
  openFixture,
}) => {
  const page = await openFixture('form.html');
  const tree = await callText('read_page');

  await callText('form_input', { ref: refOf(tree, /combobox "Color"/), value: 'Green' });
  await callText('form_input', { ref: refOf(tree, /checkbox "Subscribe"/), value: true });
  await callText('form_input', { ref: refOf(tree, /textbox "Name"/), value: 'Grace' });

  await expect(page.locator('#color')).toHaveValue('green');
  await expect(page.locator('#subscribe')).toBeChecked();
  await expect(page.locator('#name')).toHaveValue('Grace');
  expect(await page.evaluate(() => (window as unknown as { events: string[] }).events)).toEqual([
    'color:input',
    'color:change',
    'subscribe:input',
    'subscribe:change',
    'name:input',
    'name:change',
  ]);

  await callText('form_input', { ref: refOf(tree, /checkbox "Subscribe"/), value: false });
  await expect(page.locator('#subscribe')).not.toBeChecked();
});

test('form_input reports bad values', async ({ callTool, callText, openFixture }) => {
  await openFixture('form.html');
  const tree = await callText('read_page');

  const select = await callTool('form_input', { ref: refOf(tree, /combobox/), value: 'Purple' });
  expect(select.ok).toBe(false);
  expect(select.content[0]).toMatchObject({ text: expect.stringContaining('No option "Purple"') });

  const checkbox = await callTool('form_input', { ref: refOf(tree, /checkbox/), value: 'yes' });
  expect(checkbox.ok).toBe(false);
});

test('scroll moves the viewport in both directions', async ({ callText, openFixture }) => {
  const page = await openFixture('long.html');
  const scrollY = () => page.evaluate(() => window.scrollY);

  await callText('scroll', { direction: 'down', amount: 800 });
  await expect.poll(scrollY).toBeGreaterThanOrEqual(700);
  await callText('scroll', { direction: 'up', amount: 800 });
  await expect.poll(scrollY).toBe(0);
});

test('scroll with a ref brings that element into view first', async ({ callText, openFixture }) => {
  const page = await openFixture('long.html');
  const ref = refOf(await callText('read_page'), /link "Bottom link"/);

  await callText('scroll', { direction: 'down', amount: 100, ref });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(3000);
});

test('refs from before a navigation are rejected as stale', async ({
  baseUrl,
  callText,
  callTool,
  openFixture,
}) => {
  await openFixture('form.html');
  const ref = refOf(await callText('read_page'), /button "Count"/);

  await callText('navigate', { url: `${baseUrl}/next.html` });
  const result = await callTool('click', { ref });
  expect(result.ok).toBe(false);
  expect(result.content).toEqual([
    { type: 'text', text: `Unknown ref ${ref}. Call read_page again.` },
  ]);
});
