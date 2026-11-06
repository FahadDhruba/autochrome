import { readFile } from 'node:fs/promises';
import { expect, openView, test } from './harness';
import type { RecordedRequest } from './mockAnthropic';

test.beforeEach(async ({ setSafety }) => setSafety({ mode: 'auto' }));

/** All text in the first user message of a request. */
function firstUserText(request: RecordedRequest): string {
  return request.body.messages[0]!.content.map((block) => block.text ?? '').join('\n');
}

test('a right-click prompt left for the panel is sent when the panel opens', async ({
  debugPage,
  mockAnthropic: mock,
  openSidePanel,
}) => {
  mock.play([{ type: 'text', text: 'Here is a summary.' }]);
  await debugPage.evaluate(() =>
    chrome.storage.session.set({
      pendingPrompt: { text: 'Summarize the page I have open', at: Date.now() },
    }),
  );
  const panel = await openSidePanel();
  await expect(panel.getByTestId('user-text')).toHaveText('Summarize the page I have open');
  await expect(panel.getByText('Here is a summary.')).toBeVisible();
  expect(await debugPage.evaluate(() => chrome.storage.session.get('pendingPrompt'))).toEqual({});
});

test('Add context attaches the open tabs, shown as a chip and sent to the model', async ({
  mockAnthropic: mock,
  openFixture,
  openSidePanel,
}) => {
  await openFixture('form.html');
  mock.play([{ type: 'text', text: 'You have a form open.' }]);
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: 'Add context' }).click();
  await panel.getByRole('menuitem', { name: 'My open tabs' }).click();
  await expect(panel.getByRole('list', { name: 'Attached files and context' })).toContainText(
    'open tabs',
  );
  await panel.getByLabel('Message').fill('What do I have open?');
  await panel.getByLabel('Message').press('Enter');

  await expect(panel.getByText('You have a form open.')).toBeVisible();
  await expect(panel.getByTestId('user-text')).toContainText('What do I have open?');
  await expect(panel.getByRole('list', { name: 'Attached' })).toContainText('open tabs');
  const sent = firstUserText(mock.requests[0]!);
  expect(sent).toContain('Context: my open tabs');
  expect(sent).toContain('Form fixture');
  expect(sent).toContain('<page_content');
});

test('extract_table reads page tables as markdown, and answers render as downloadable tables', async ({
  callText,
  mockAnthropic: mock,
  openFixture,
  openSidePanel,
}) => {
  await openFixture('interact.html');
  const tables = await callText('extract_table');
  expect(tables).toContain('Prices (3 rows):');
  expect(tables).toContain('| Plan | Price |');
  expect(tables).toContain('| Pro \\| Team | $15 |');

  mock.play([
    { type: 'text', text: '| Plan | Price |\n|---|---|\n| **Basic** | $5 |\n| Pro | $15 |' },
  ]);
  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('Prices please');
  await panel.getByLabel('Message').press('Enter');
  const table = panel.locator('.md-table');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table).toContainText('2 rows');

  const [csv] = await Promise.all([
    panel.waitForEvent('download'),
    table.getByRole('button', { name: 'CSV' }).click(),
  ]);
  expect(csv.suggestedFilename()).toBe('table.csv');
  expect(await readFile((await csv.path())!, 'utf8')).toBe('Plan,Price\nBasic,$5\nPro,$15');
});

test('typing "/" offers saved prompts, and Settings can add one', async ({
  mockAnthropic,
  openSidePanel,
}) => {
  void mockAnthropic;
  const panel = await openSidePanel();
  const box = panel.getByLabel('Message');
  await box.fill('/su');
  const menu = panel.getByRole('listbox', { name: 'Saved prompts' });
  await expect(menu.getByRole('option')).toHaveText([/\/summarize/]);
  await box.press('Enter');
  await expect(box).toHaveValue('Summarize the page I have open in 5 bullet points.');

  await openView(panel, 'Settings');
  const section = panel.getByRole('region', { name: 'Prompt settings' });
  await section.getByRole('button', { name: 'Add prompt' }).click();
  await section.getByLabel('Prompt name').last().fill('Weekly Report');
  await section.getByLabel('Prompt text').last().fill('Write my weekly report.');
  await section.getByRole('button', { name: 'Save prompts' }).click();
  await expect(section.getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect(section.getByLabel('Prompt name').last()).toHaveValue('weekly-report');

  await panel.getByRole('button', { name: 'Back to chat' }).click();
  await panel.getByLabel('Message').fill('/week');
  await panel.getByRole('option', { name: /weekly-report/ }).click();
  await expect(panel.getByLabel('Message')).toHaveValue('Write my weekly report.');
});

test('a token limit stops the task, and a model price shows the cost', async ({
  debugPage,
  mockAnthropic: mock,
  openSidePanel,
}) => {
  await debugPage.evaluate(async () => {
    const { 'anthropic.model': model } = await chrome.storage.local.get('anthropic.model');
    await chrome.storage.local.set({
      limits: { maxSteps: 50, maxTokens: 200 },
      prices: { [`anthropic/${model ?? 'claude-sonnet-5-5'}`]: { input: 3, output: 15 } },
    });
  });
  const step = (id: string) => [{ type: 'tool_use' as const, id, name: 'tabs_list', input: {} }];
  mock.play(step('t1'), step('t2'), step('t3'));
  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('Keep going');
  await panel.getByLabel('Message').press('Enter');

  await expect(panel.getByTestId('assistant-text').last()).toContainText('over the limit of 200');
  expect(mock.requests).toHaveLength(2);
  await expect(panel.getByTestId('usage')).toContainText('≈ ');
});
