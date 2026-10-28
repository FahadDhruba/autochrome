import { expect, refOf, test } from './harness';

test('read_page lists interactive elements with refs and values', async ({
  callText,
  openFixture,
}) => {
  const page = await openFixture('form.html');
  await page.fill('#name', 'Ada');

  const tree = await callText('read_page');
  expect(tree).toMatch(/\[e\d+\] link "Go to next page"/);
  expect(tree).toMatch(/\[e\d+\] button "Count"/);
  expect(tree).toMatch(/\[e\d+\] textbox "Name" value="Ada"/);
  expect(tree).toMatch(/\[e\d+\] textbox "Email"/);
  expect(tree).toMatch(/\[e\d+\] combobox "Color" value="Red"/);
  expect(tree).toMatch(/\[e\d+\] checkbox "Subscribe"$/m);
  expect(tree).toMatch(/\[e\d+\] button "Submit"/);
  expect(tree).not.toContain('Secret');
  expect(tree).not.toContain('heading');
});

test('read_page "all" includes structure, headings and checked state', async ({
  callText,
  openFixture,
}) => {
  const page = await openFixture('form.html');
  await page.check('#subscribe');

  const tree = await callText('read_page', { filter: 'all' });
  expect(tree).toContain('heading "Signup" level=1');
  expect(tree).toMatch(/^form$/m);
  expect(tree).toMatch(/^ {2}\[e\d+\] checkbox "Subscribe" checked$/m);
});

test('read_page sees open shadow roots and role=button elements', async ({
  callText,
  openFixture,
}) => {
  await openFixture('shadow.html');
  const tree = await callText('read_page');
  expect(tree).toMatch(/\[e\d+\] button "Inside shadow"/);
  expect(tree).toMatch(/\[e\d+\] button "Custom control"/);
});

test('find matches role, name and value case-insensitively', async ({ callText, openFixture }) => {
  const page = await openFixture('form.html');
  await page.fill('#email', 'Grace@Example.com');

  expect(await callText('find', { query: 'SUBMIT' })).toMatch(
    /^<page_content [^\n]*>\n\[e\d+\] button "Submit"\n<\/page_content>$/,
  );
  expect(await callText('find', { query: 'grace@example' })).toMatch(/textbox "Email"/);
  expect(await callText('find', { query: 'checkbox' })).toMatch(/checkbox "Subscribe"/);
  expect(await callText('find', { query: 'zzz' })).toContain('No elements match "zzz".');
});

test('find refs stay valid alongside read_page refs', async ({ callText, openFixture }) => {
  await openFixture('form.html');
  const tree = await callText('read_page');
  const found = await callText('find', { query: 'Count' });
  expect(refOf(found, /Count/)).toBe(refOf(tree, /Count/));
});

test('get_text returns title, url and readable text', async ({
  baseUrl,
  callText,
  openFixture,
}) => {
  await openFixture('next.html');
  const text = await callText('get_text');
  expect(text).toContain('Title: Next page');
  expect(text).toContain(`URL: ${baseUrl}/next.html`);
  expect(text).toContain('You arrived at the second page.');
});

test('screenshot width equals innerWidth and is a JPEG', async ({ callTool, openFixture }) => {
  const page = await openFixture('form.html');
  const result = await callTool('screenshot');
  expect(result.ok).toBe(true);
  const image = result.content[0];
  if (image?.type !== 'image') throw new Error('expected an image');
  expect(image.mimeType).toBe('image/jpeg');

  const width = await page.evaluate(() => innerWidth);
  const bytes = Buffer.from(image.data, 'base64');
  expect(bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
  // Height is not compared: Chrome's "being debugged" infobar shrinks the viewport once attached.
  expect(jpegSize(bytes).width).toBe(width);
});

test('wait for a fixed time and for text', async ({ callText, openFixture }) => {
  const page = await openFixture('form.html');
  const started = Date.now();
  await callText('wait', { ms: 300 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(290);

  await page.click('#later');
  expect(await callText('wait', { text: 'Loaded later' })).toContain('Loaded later');
});

test('wait times out when the text never appears', async ({ callTool, openFixture }) => {
  await openFixture('form.html');
  const result = await callTool('wait', { text: 'never shows up', timeoutMs: 500 });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.content)).toContain('Timed out waiting for text');
});

/** Read width/height from the first SOF marker of a JPEG. */
function jpegSize(bytes: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < bytes.length) {
    const marker = bytes[offset + 1]!;
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('No SOF marker found');
}
