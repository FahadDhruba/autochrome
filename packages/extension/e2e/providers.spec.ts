import { expect, openModelChip, refOf, test } from './harness';
import type { ProviderRequest } from './mockProviders';

type GeminiPart = {
  text?: string;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string };
  functionResponse?: { name: string; response: { output?: string } };
};

type OpenAiMessage = {
  role: string;
  content: unknown;
  tool_call_id?: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
};

const toolMessage = (request: ProviderRequest, callId: string): string => {
  const messages = request.body.messages as OpenAiMessage[];
  return String(
    messages.find((m) => m.role === 'tool' && m.tool_call_id === callId)?.content ?? '',
  );
};

const geminiResponse = (request: ProviderRequest, name: string): string => {
  const parts = (request.body.contents as { parts: GeminiPart[] }[]).flatMap((c) => c.parts);
  return String(
    parts.find((p) => p.functionResponse?.name === name)?.functionResponse?.response.output ?? '',
  );
};

test.beforeEach(async ({ setSafety }) => setSafety({ mode: 'auto' }));

test('runs the chat flow against an OpenAI-compatible server', async ({
  baseUrl,
  context,
  debugPage,
  mockOpenAi: mock,
  openSidePanel,
}) => {
  await debugPage.evaluate(
    (url) =>
      chrome.storage.local.set({
        'compatible.baseUrl': `${url}/v1`,
        'compatible.model': 'mock-chat',
        defaultProvider: 'compatible',
      }),
    mock.baseUrl,
  );
  mock.play(
    {
      text: 'Opening the form.',
      calls: [
        { id: 'call_open', name: 'tab_open', input: { url: `${baseUrl}/form.html` } },
        { id: 'call_read', name: 'read_page', input: {} },
      ],
    },
    (request) => ({
      calls: [
        {
          id: 'call_click',
          name: 'click',
          input: { ref: refOf(toolMessage(request, 'call_read'), /Count/) },
        },
      ],
    }),
    { text: 'I clicked the Count button.' },
  );

  const panel = await openSidePanel();
  await openModelChip(panel);
  await expect(panel.getByLabel('Provider')).toHaveValue('compatible');
  await expect(panel.getByLabel('Model')).toHaveValue('mock-chat');
  await panel.getByLabel('Message').fill('Open the form and click Count');
  await panel.getByLabel('Message').press('Enter');

  await expect(panel.getByTestId('tool-card').locator('.tool-name')).toHaveText([
    'tab_open',
    'read_page',
    'click',
  ]);
  await expect(panel.getByText('I clicked the Count button.')).toBeVisible();
  await expect(panel.getByTestId('usage')).toContainText('cached');

  const fixture = context.pages().find((page) => page.url().endsWith('/form.html'))!;
  await expect(fixture.locator('#clicks')).toHaveText('clicks: 1');

  expect(mock.requests).toHaveLength(3);
  const [first, second] = mock.requests;
  expect(first!.headers.authorization).toBeUndefined();
  expect(first!.body).toMatchObject({
    model: 'mock-chat',
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 8192,
  });
  expect(first!.body.messages[0]).toMatchObject({ role: 'system' });
  expect(first!.body.tools[0]).toMatchObject({
    type: 'function',
    function: { name: expect.any(String) },
  });
  const history = second!.body.messages as OpenAiMessage[];
  // The trailing user message is the tab state note.
  expect(history.map((m) => m.role)).toEqual([
    'system',
    'user',
    'assistant',
    'tool',
    'tool',
    'user',
  ]);
  expect(history.at(-1)!.content).toContain('Tab state');
  expect(history[2]!.tool_calls!.map((c) => c.id)).toEqual(['call_open', 'call_read']);
  expect(JSON.parse(history[2]!.tool_calls![0]!.function.arguments)).toEqual({
    url: `${baseUrl}/form.html`,
  });
});

test('runs the chat flow against Gemini and sends thought signatures back', async ({
  baseUrl,
  debugPage,
  mockGemini: mock,
  openSidePanel,
}) => {
  await debugPage.evaluate(
    (url) =>
      chrome.storage.local.set({
        'gemini.apiKey': 'gem-key',
        'gemini.baseUrl': url,
        'gemini.model': 'mock-gemini',
        defaultProvider: 'gemini',
      }),
    mock.baseUrl,
  );
  mock.play(
    {
      text: 'Opening the form.',
      calls: [
        {
          id: 'g_open',
          name: 'tab_open',
          input: { url: `${baseUrl}/form.html` },
          signature: 'sig-open',
        },
        { name: 'read_page', input: {} },
      ],
    },
    (request) => ({
      calls: [
        { name: 'click', input: { ref: refOf(geminiResponse(request, 'read_page'), /Count/) } },
      ],
    }),
    { text: 'Clicked it.' },
  );

  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('Open the form and click Count');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByTestId('tool-card')).toHaveCount(3);
  await expect(panel.getByText('Clicked it.')).toBeVisible();

  expect(mock.requests).toHaveLength(3);
  const [first, second] = mock.requests;
  expect(first!.headers['x-goog-api-key']).toBe('gem-key');
  expect(first!.url).toContain('/v1beta/models/mock-gemini:streamGenerateContent?alt=sse');
  expect(first!.body.tools[0].functionDeclarations.length).toBeGreaterThan(10);
  expect(first!.body.generationConfig).toEqual({ maxOutputTokens: 8192 });

  const contents = second!.body.contents as { role: string; parts: GeminiPart[] }[];
  expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
  expect(contents[1]!.parts[0]).toEqual({ text: 'Opening the form.' });
  expect(contents[1]!.parts[1]).toMatchObject({
    functionCall: { id: 'g_open', name: 'tab_open' },
    thoughtSignature: 'sig-open',
  });
  // The second call had no id, so none is echoed back.
  expect(contents[1]!.parts[2]!.functionCall).not.toHaveProperty('id');
  expect(contents[2]!.parts.map((p) => p.functionResponse?.name)).toEqual([
    'tab_open',
    'read_page',
  ]);
});

test('switches a chat from Anthropic to a compatible provider mid-conversation', async ({
  baseUrl,
  debugPage,
  mockAnthropic,
  mockOpenAi,
  openSidePanel,
}) => {
  await debugPage.evaluate(
    (url) =>
      chrome.storage.local.set({
        'compatible.baseUrl': `${url}/v1`,
        'compatible.model': 'mock-chat',
      }),
    mockOpenAi.baseUrl,
  );
  mockAnthropic.play(
    [
      { type: 'text', text: 'Reading.' },
      { type: 'tool_use', id: 'toolu_tabs', name: 'tabs_list', input: {} },
    ],
    [{ type: 'text', text: 'Listed the tabs.' }],
  );
  mockOpenAi.play({ text: 'Continuing on the other model.' });

  const panel = await openSidePanel();
  await openModelChip(panel);
  await expect(panel.getByLabel('Provider')).toHaveValue('anthropic');
  await panel.getByLabel('Message').fill('List my tabs');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByText('Listed the tabs.')).toBeVisible();

  // The picker is locked while a task runs and free afterwards.
  await openModelChip(panel);
  await expect(panel.getByLabel('Provider')).toBeEnabled();
  await panel.getByLabel('Provider').selectOption('compatible');
  await expect(panel.getByLabel('Model')).toHaveValue('mock-chat');
  await panel.getByLabel('Message').fill(`Now open ${baseUrl}`);
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByText('Continuing on the other model.')).toBeVisible();

  expect(mockAnthropic.requests).toHaveLength(2);
  expect(mockOpenAi.requests).toHaveLength(1);
  const messages = mockOpenAi.requests[0]!.body.messages as OpenAiMessage[];
  expect(messages.map((m) => m.role)).toEqual([
    'system',
    'user',
    'assistant',
    'tool',
    'assistant',
    'user',
  ]);
  expect(messages[2]).toMatchObject({
    content: 'Reading.',
    tool_calls: [{ id: 'toolu_tabs', function: { name: 'tabs_list', arguments: '{}' } }],
  });
  expect(messages[3]!.tool_call_id).toBe('toolu_tabs');
  expect(messages[4]).toMatchObject({ content: 'Listed the tabs.' });

  // The choice is saved on the chat and comes back when it is reopened.
  await panel.reload();
  await panel.getByRole('button', { name: 'Chats' }).click();
  await panel.getByRole('button', { name: 'List my tabs', exact: true }).click();
  await openModelChip(panel);
  await expect(panel.getByLabel('Provider')).toHaveValue('compatible');
  await expect(panel.getByLabel('Model')).toHaveValue('mock-chat');
});

test('opens an older chat without a provider as an Anthropic chat', async ({
  debugPage,
  mockAnthropic,
  openSidePanel,
}) => {
  void mockAnthropic;
  await debugPage.evaluate(() =>
    chrome.storage.local.set({
      'anthropic.model': 'saved-model',
      'chat:index': [{ id: 'old', title: 'Old chat', updatedAt: 1 }],
      'chat:old': {
        id: 'old',
        title: 'Old chat',
        updatedAt: 1,
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Old chat' }] }],
      },
    }),
  );
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: 'Chats' }).click();
  await panel.getByRole('button', { name: 'Old chat', exact: true }).click();
  await openModelChip(panel);
  await expect(panel.getByLabel('Provider')).toHaveValue('anthropic');
  await expect(panel.getByLabel('Model')).toHaveValue('saved-model');
});

test('configures the compatible provider in Settings and makes it the default', async ({
  debugPage,
  mockOpenAi: mock,
  openSidePanel,
}) => {
  await debugPage.evaluate(() => chrome.storage.local.remove('anthropic.apiKey'));
  const panel = await openSidePanel();
  await expect(panel.getByTestId('empty-state')).toBeVisible();
  await panel.getByRole('button', { name: 'Open settings' }).click();

  await panel.getByLabel('Provider').selectOption('compatible');
  const section = panel.getByRole('region', { name: 'OpenAI-compatible settings' });
  await expect(section.getByLabel('API key (optional)')).toBeHidden();
  await section.getByLabel('Server').selectOption({ label: 'LM Studio' });
  await expect(section.getByLabel('Base URL')).toHaveValue('http://localhost:1234/v1');
  await section.getByLabel('Base URL').fill(`${mock.baseUrl}/v1`);
  await expect(section.getByLabel('Server')).toHaveValue('custom');
  await section.getByRole('button', { name: 'Save' }).click();
  await expect(section.getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect(panel.locator('#settings-models option')).toHaveCount(2);
  await section.getByLabel('Model').fill('mock-chat');
  await section.getByRole('button', { name: 'Save' }).click();
  await section.getByRole('button', { name: 'Use as default' }).click();
  await expect(section.getByRole('button', { name: 'Default provider' })).toBeDisabled();

  await panel.getByRole('button', { name: 'Back to chat' }).click();
  await expect(panel.getByTestId('empty-state')).toBeHidden();
  await openModelChip(panel);
  await expect(panel.getByLabel('Provider')).toHaveValue('compatible');
  await expect(panel.getByLabel('Provider').locator('option')).toHaveText(['OpenAI-compatible']);
});
