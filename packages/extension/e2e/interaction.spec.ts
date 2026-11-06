import { expect, refOf, test } from './harness';

/** Like refOf, but also finds refs inside iframes ("f12e5"). */
function anyRef(tree: string, pattern: RegExp): string {
  const line = tree.split('\n').find((l) => pattern.test(l));
  const ref = line && /\[(f\d+e\d+|e\d+)\]/.exec(line)?.[1];
  if (!ref) throw new Error(`No ref for ${pattern} in:\n${tree}`);
  return ref;
}

test('a confirm dialog stops the click, blocks the tab until answered, and can be cancelled', async ({
  callText,
  callTool,
  openFixture,
}) => {
  const page = await openFixture('dialogs.html');
  // Playwright dismisses dialogs by itself unless something listens for them.
  page.on('dialog', () => undefined);
  const ref = refOf(await callText('read_page'), /button "Delete item"/);

  const clicked = await callText('click', { ref });
  expect(clicked).toContain('A confirm dialog is open on this tab: “Delete this item?”');

  const blocked = await callTool('read_page');
  expect(blocked.ok).toBe(false);
  expect(JSON.stringify(blocked.content)).toContain('Answer it with the dialog tool');

  expect(await callText('dialog', { accept: false })).toContain('Dismissed the confirm dialog');
  await expect(page.locator('#status')).toHaveText('kept');
});

test('a prompt dialog takes the typed answer', async ({ callText, openFixture }) => {
  const page = await openFixture('dialogs.html');
  page.on('dialog', () => undefined);
  const ref = refOf(await callText('read_page'), /button "Ask name"/);
  await callText('click', { ref });
  await callText('dialog', { accept: true, promptText: 'Ada' });
  await expect(page.locator('#status')).toHaveText('name: Ada');
});

test('read_page reads same-origin and cross-origin iframes, and their refs work', async ({
  callText,
  openFixture,
}) => {
  const page = await openFixture('frames.html');
  await expect(page.frames()).toHaveLength(3);
  const tree = await callText('read_page');
  expect(tree).toMatch(
    /iframe "Same origin"\n(\s+.*\n)*?\s+\[f\d+e\d+\] button "Inner button same"/,
  );
  expect(tree).toMatch(
    /iframe "Cross origin"\n(\s+.*\n)*?\s+\[f\d+e\d+\] button "Inner button cross"/,
  );
  expect(tree).not.toContain('could not be read');

  for (const name of ['same', 'cross']) {
    const ref = anyRef(tree, new RegExp(`button "Inner button ${name}"`));
    expect(ref).toMatch(/^f\d+e\d+$/);
    await callText('click', { ref });
    const frame = page.frames().find((f) => f.url().includes(`name=${name}`))!;
    await expect(frame.locator('#status')).toHaveText(`clicked ${name}`);
  }

  const holder = anyRef(tree, /textbox "Card holder"/);
  await callText('form_input', { ref: holder, value: 'Ada' });
  const same = page.frames().find((f) => f.url().includes('name=same'))!;
  await expect(same.locator('#holder')).toHaveValue('Ada');

  expect(await callText('find', { query: 'Inner button cross' })).toMatch(/\[f\d+e\d+\]/);
  expect(await callText('get_text')).toContain('Inner button cross');
});

test('hover opens a hover menu, and drag moves a slider and drops a card', async ({
  callText,
  openFixture,
}) => {
  const page = await openFixture('interact.html');
  const track = await page.locator('#track').boundingBox();
  await callText('drag', {
    fromX: track!.x + 10,
    fromY: track!.y + 10,
    toX: track!.x + track!.width * 0.75,
    toY: track!.y + 10,
  });
  await expect(page.locator('#volume')).toHaveText(/volume (7\d)/);

  const card = await page.locator('#card').boundingBox();
  const done = await page.locator('#done').boundingBox();
  await callText('drag', {
    fromX: card!.x + 20,
    fromY: card!.y + 10,
    toX: done!.x + 20,
    toY: done!.y + 10,
  });
  await expect(page.locator('#moved')).toHaveText('moved card-a');

  const tree = await callText('read_page');
  expect(tree).not.toContain('Pricing');
  const nav = await page.locator('#nav span').boundingBox();
  await callText('hover', { x: nav!.x + 5, y: nav!.y + 5 });
  expect(await callText('read_page')).toContain('link "Pricing"');
});

test('upload_file fills file inputs, hidden ones behind a label, and drop zones', async ({
  callText,
  openFixture,
}) => {
  const page = await openFixture('interact.html');
  const tree = await callText('read_page');
  expect(tree).toMatch(/\[e\d+\] button "Resume" value="file input, no file chosen"/);

  await callText('upload_file', {
    ref: refOf(tree, /"Resume"/),
    fileName: 'cv.txt',
    text: 'Ada CV',
  });
  await expect(page.locator('#files')).toHaveText('visible: cv.txt=Ada CV');

  await callText('upload_file', { ref: refOf(tree, /button "Choose photo"/), text: 'pixels' });
  await expect(page.locator('#files')).toHaveText('picker: file.txt=pixels');

  const zone = await page.locator('#dropzone').boundingBox();
  await callText('upload_file', {
    x: zone!.x + 20,
    y: zone!.y + 20,
    fileName: 'notes.md',
    text: '# Notes',
  });
  await expect(page.locator('#files')).toHaveText('dropped: notes.md=# Notes');
});
