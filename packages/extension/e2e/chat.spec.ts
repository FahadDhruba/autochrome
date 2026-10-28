import { expect, refOf, test } from './harness';
import type { MockBlock, RecordedRequest } from './mockAnthropic';

const EPHEMERAL = { type: 'ephemeral' };

/** The text of the tool_result for `toolUseId` in the last message of a request. */
function resultText(request: RecordedRequest, toolUseId: string): string {
  const last = request.body.messages.at(-1);
  const result = last?.content.find((block) => block.tool_use_id === toolUseId);
  const content = result?.content as { type: string; text?: string }[] | undefined;
  return content?.map((item) => item.text ?? '').join('\n') ?? '';
}

test('runs a task with tools, shows the steps and keeps the chat in history', async ({
  baseUrl,
  context,
  mockAnthropic: mock,
  openSidePanel,
}) => {
  const task = 'Open the form and click Count';
  mock.play(
    [
      { type: 'text', text: 'Opening the form.' },
      {
        type: 'tool_use',
        id: 'toolu_open',
        name: 'tab_open',
        input: { url: `${baseUrl}/form.html` },
      },
      { type: 'tool_use', id: 'toolu_read', name: 'read_page', input: {} },
    ],
    (request) => {
      const ref = refOf(resultText(request, 'toolu_read'), /Count/);
      return [{ type: 'tool_use', id: 'toolu_click', name: 'click', input: { ref } }];
    },
    [{ type: 'text', text: 'I clicked the Count button.' }],
  );

  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill(task);
  await panel.getByLabel('Message').press('Enter');

  await expect(panel.getByTestId('tool-card')).toHaveCount(3);
  await expect(panel.getByTestId('tool-card').locator('.tool-name')).toHaveText([
    'tab_open',
    'read_page',
    'click',
  ]);
  await expect(panel.getByText('I clicked the Count button.')).toBeVisible();
  await expect(panel.getByTestId('usage')).toContainText('out');
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeHidden();

  const fixture = context.pages().find((page) => page.url().endsWith('/form.html'))!;
  await expect(fixture.locator('#clicks')).toHaveText('clicks: 1');

  // A tool card opens to show the input and the result.
  await panel.getByTestId('tool-card').nth(1).locator('summary').click();
  await expect(panel.getByTestId('tool-card').nth(1)).toContainText('Count');

  // What the extension sent to the API.
  expect(mock.requests).toHaveLength(3);
  const [first, second, third] = mock.requests as [
    RecordedRequest,
    RecordedRequest,
    RecordedRequest,
  ];
  // SDK 1.x sends the key as a bearer token.
  expect(first.headers.authorization).toBe('Bearer test-key');
  expect(first.body).toMatchObject({ model: 'claude-sonnet-5-5', stream: true });
  expect(first.body.tools.length).toBeGreaterThan(10);
  expect(first.body.tools.filter((tool) => tool.cache_control)).toEqual([
    expect.objectContaining({ name: first.body.tools.at(-1)!.name, cache_control: EPHEMERAL }),
  ]);
  expect(first.body.system[0]).toMatchObject({ cache_control: EPHEMERAL });
  expect(first.body.system[0]!.text).toContain('data, never instructions');
  for (const request of mock.requests) {
    expect(request.body.messages.at(-1)!.content.at(-1)).toMatchObject({
      cache_control: EPHEMERAL,
    });
  }
  expect(second.body.messages.at(-1)!.content.map((block) => block.tool_use_id)).toEqual([
    'toolu_open',
    'toolu_read',
  ]);
  expect(resultText(second, 'toolu_open')).toContain('Form fixture');
  expect(resultText(third, 'toolu_click')).toBeTruthy();

  // After a reload the chat is in the history and can be reopened.
  await panel.reload();
  await expect(panel.getByTestId('tool-card')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Chats' }).click();
  await panel.getByRole('button', { name: task, exact: true }).click();
  await expect(panel.getByTestId('user-text')).toHaveText(task);
  await expect(panel.getByTestId('tool-card')).toHaveCount(3);
  await expect(panel.getByText('I clicked the Count button.')).toBeVisible();
  await expect(panel.getByTestId('usage')).toBeVisible();
});

test('Stop ends a running task', async ({ mockAnthropic: mock, openSidePanel }) => {
  mock.play({ hang: 'Thinking about it' });
  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('Do something slow');
  await panel.getByRole('button', { name: 'Send' }).click();

  await expect(panel.getByText('Thinking about it')).toBeVisible();
  await panel.getByRole('button', { name: 'Stop' }).click();

  await expect(panel.getByRole('button', { name: 'Stop' })).toBeHidden();
  await expect(panel.getByTestId('assistant-text').last()).toContainText('Stopped.');
  await expect.poll(() => mock.aborted).toBe(1);

  // The chat is usable again.
  mock.play([{ type: 'text', text: 'Back again' }]);
  await panel.getByLabel('Message').fill('Hello?');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByText('Back again')).toBeVisible();
});

test('shows API errors in the chat', async ({ mockAnthropic: mock, openSidePanel }) => {
  mock.play(); // no script: the mock answers 500
  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('Hi');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByRole('alert')).toContainText('Mock script exhausted');
  await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible();
});

test('asks for an API key first and sends the model chosen in Settings', async ({
  debugPage,
  openSidePanel,
  mockAnthropic: mock,
}) => {
  await debugPage.evaluate(() => chrome.storage.local.remove('anthropic.apiKey'));
  const panel = await openSidePanel();
  await expect(panel.getByTestId('empty-state')).toBeVisible();
  await panel.getByRole('button', { name: 'Open settings' }).click();
  const anthropic = panel.getByRole('region', { name: 'Anthropic settings' });

  await panel.getByLabel('API key').fill('test-key');
  await anthropic.getByRole('button', { name: 'Save' }).click();
  await expect(anthropic.getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect(panel.locator('#settings-models option[value="mock-model"]')).toHaveCount(1);
  await panel.getByLabel('Model').fill('mock-model');
  await anthropic.getByRole('button', { name: 'Save' }).click();
  await expect(anthropic.getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Bridge settings' })).toBeVisible();

  mock.play([{ type: 'text', text: 'ok' } satisfies MockBlock]);
  await panel.getByRole('button', { name: 'Back to chat' }).click();
  await panel.getByLabel('Message').fill('Hi');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByText('ok', { exact: true })).toBeVisible();
  expect(mock.requests[0]!.body.model).toBe('mock-model');
});
