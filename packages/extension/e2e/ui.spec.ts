import { expect, openModelChip, test } from './harness';

test.beforeEach(async ({ setSafety }) => setSafety({ mode: 'auto' }));

test('tool cards are collapsed rows that open on click and keyboard; failures start open', async ({
  mockAnthropic: mock,
  openSidePanel,
}) => {
  mock.play(
    [
      { type: 'tool_use', id: 'toolu_tabs', name: 'tabs_list', input: {} },
      { type: 'tool_use', id: 'toolu_bad', name: 'click', input: { ref: 'e999' } },
    ],
    [{ type: 'text', text: 'Done.' }],
  );
  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('List tabs');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByText('Done.')).toBeVisible();

  const [ok, failed] = [
    panel.getByTestId('tool-card').nth(0),
    panel.getByTestId('tool-card').nth(1),
  ];
  const okHead = ok.getByRole('button', { name: /tabs_list/ });
  await expect(okHead).toHaveAttribute('aria-expanded', 'false');
  await expect(ok.locator('.tool-body')).toHaveCount(0);
  await expect(ok.locator('.tool-result-text')).toContainText('tab');

  const before = await okHead.boundingBox();
  await okHead.click();
  await expect(okHead).toHaveAttribute('aria-expanded', 'true');
  await expect(ok.locator('.tool-result')).toBeVisible();
  // The header row keeps its size and place when the card opens.
  expect(await okHead.boundingBox()).toEqual(before);
  await okHead.click();
  await expect(okHead).toHaveAttribute('aria-expanded', 'false');

  // Enter and Space toggle too.
  await okHead.focus();
  await panel.keyboard.press('Enter');
  await expect(okHead).toHaveAttribute('aria-expanded', 'true');
  await panel.keyboard.press('Space');
  await expect(okHead).toHaveAttribute('aria-expanded', 'false');

  // An error opens by itself and shows the first line of the error in the row.
  const failedHead = failed.locator('.tool-head');
  await expect(failedHead).toHaveAttribute('aria-expanded', 'true');
  await expect(failed.locator('.tool-result-text')).not.toBeEmpty();
  await failedHead.click();
  await expect(failedHead).toHaveAttribute('aria-expanded', 'false');
});

test('a card waiting for approval starts open', async ({
  baseUrl,
  mockAnthropic: mock,
  openSidePanel,
  setSafety,
}) => {
  await setSafety({ mode: 'ask' });
  mock.play([
    {
      type: 'tool_use',
      id: 'toolu_open',
      name: 'tab_open',
      input: { url: `${baseUrl}/form.html` },
    },
  ]);
  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('Open the form');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByTestId('approval-card')).toBeVisible();
  await expect(panel.getByTestId('tool-card').locator('.tool-head')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await panel.getByRole('button', { name: 'Deny' }).click();
});

test('the chat drawer closes on the backdrop and on Escape and returns focus', async ({
  openSidePanel,
}) => {
  const panel = await openSidePanel();
  const chats = panel.getByRole('button', { name: 'Chats' });
  const drawer = panel.getByRole('dialog', { name: 'Chat history' });

  await chats.click();
  await expect(drawer).toBeVisible();
  await expect(drawer).toBeFocused();

  await panel.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(chats).toBeFocused();

  await chats.click();
  await expect(drawer).toBeVisible();
  // The drawer is narrower than the panel; the dimmed rest of it is the backdrop.
  await panel.getByTestId('drawer-backdrop').click({ position: { x: 380, y: 300 } });
  await expect(drawer).toBeHidden();
  await expect(chats).toBeFocused();
});

test('the model chip shows provider and model, and its popover changes the model sent', async ({
  mockAnthropic: mock,
  openSidePanel,
}) => {
  mock.play([{ type: 'text', text: 'ok' }]);
  const panel = await openSidePanel();
  const chip = panel.getByTestId('model-chip');
  await expect(chip).toContainText('Anthropic · claude-sonnet-5-5');
  await expect(panel.getByLabel('Model')).toHaveCount(0);

  await openModelChip(panel);
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  await panel.getByLabel('Model').fill('chip-model');
  await expect(chip).toContainText('Anthropic · chip-model');
  await panel.keyboard.press('Escape');
  await expect(panel.getByLabel('Model')).toHaveCount(0);
  await expect(chip).toBeFocused();

  await panel.getByLabel('Message').fill('Hi');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByText('ok', { exact: true })).toBeVisible();
  expect(mock.requests[0]!.body.model).toBe('chip-model');
});

test('the model chip is locked while a task runs, and Send does nothing when empty', async ({
  mockAnthropic: mock,
  openSidePanel,
}) => {
  mock.play({ hang: 'Thinking about it' });
  const panel = await openSidePanel();
  const send = panel.getByRole('button', { name: 'Send' });
  await expect(send).toHaveAttribute('aria-disabled', 'true');
  await send.click({ force: true });
  expect(mock.requests).toHaveLength(0);
  await expect(panel.getByLabel('Message')).toBeFocused();

  await panel.getByLabel('Message').fill('Slow one');
  await expect(send).toHaveAttribute('aria-disabled', 'false');
  await send.click();
  await expect(panel.getByText('Thinking about it')).toBeVisible();
  await expect(panel.getByTestId('model-chip')).toBeDisabled();
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByTestId('model-chip')).toBeEnabled();
});

test('the theme choice is saved and applied after a reload', async ({
  debugPage,
  mockAnthropic,
  openSidePanel,
}) => {
  void mockAnthropic;
  const panel = await openSidePanel();
  const html = panel.locator('html');
  await panel.getByRole('button', { name: 'Settings', exact: true }).click();
  const theme = panel.getByRole('radiogroup', { name: 'Theme' });
  await expect(theme.getByLabel('System')).toBeChecked();

  await theme.getByLabel('Dark').check();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(panel.locator('body')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
  expect(await debugPage.evaluate(() => chrome.storage.local.get('ui.theme'))).toEqual({
    'ui.theme': 'dark',
  });

  await panel.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await panel.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(panel.getByRole('radiogroup', { name: 'Theme' }).getByLabel('Dark')).toBeChecked();

  // Another page (the debug page) follows the same setting.
  await debugPage.reload();
  await expect(debugPage.locator('html')).toHaveAttribute('data-theme', 'dark');

  await panel.getByRole('radiogroup', { name: 'Theme' }).getByLabel('Light').check();
  await expect(panel.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(debugPage.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the first-run chat offers example prompts that fill the input', async ({
  mockAnthropic,
  openSidePanel,
}) => {
  void mockAnthropic;
  const panel = await openSidePanel();
  const empty = panel.getByTestId('chat-empty');
  await expect(empty).toContainText('Tell autochrome what to do in your browser.');
  await expect(empty.getByRole('button')).toHaveCount(3);

  const example = empty.getByRole('button').nth(1);
  const text = (await example.textContent())!;
  await example.click();
  await expect(panel.getByLabel('Message')).toHaveValue(text);
  await expect(panel.getByLabel('Message')).toBeFocused();
});

test('empty Workflows, Schedules and Runs views say what to do next', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: 'Workflows' }).click();
  const workflows = panel.getByTestId('workflows-empty');
  await expect(workflows.getByRole('button', { name: 'Record' })).toBeVisible();
  await expect(workflows.getByRole('button', { name: 'Import' })).toBeVisible();

  await panel.getByRole('button', { name: 'Schedules' }).click();
  await expect(
    panel.getByTestId('schedules-empty').getByRole('button', { name: 'New schedule' }),
  ).toBeVisible();

  await panel.getByRole('button', { name: 'Runs' }).click();
  await expect(panel.getByTestId('runs-empty')).toContainText('No runs yet');
});
