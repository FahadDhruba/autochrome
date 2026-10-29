import type { Page } from '@playwright/test';
import { expect, test } from './harness';
import type { RecordedRequest } from './mockAnthropic';

/** The tool_result text for `toolUseId` in the last message of a request. */
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

test.describe('console and network capture', () => {
  /** Opens the fixture, attaches the debugger, then reloads so everything is captured. */
  test.beforeEach(async ({ baseUrl, callText, openFixture }) => {
    await openFixture('console.html');
    // The first call attaches. Drop what Chrome replays, then reload so the network is captured.
    await callText('console_logs', { clear: true });
    await callText('navigate', { url: `${baseUrl}/console.html` });
  });

  test('console_logs shows every level and the uncaught exception', async ({ callText }) => {
    await expect
      .poll(() => callText('console_logs', { pattern: 'uncaught-boom' }))
      .toContain('error Error: uncaught-boom');

    const logs = await callText('console_logs');
    expect(logs).toMatch(/\] debug debug-message/);
    expect(logs).toMatch(/\] log log-message \{"answer":42\}/);
    expect(logs).toMatch(/\] info info-message/);
    expect(logs).toMatch(/\] warning warn-message .*console\.html:\d+\)/);
    expect(logs).toMatch(/\] error error-message/);
    expect(logs).toContain('Captured since');
    expect(logs).toContain('navigate to the same URL');
  });

  test('console_logs filters by level and pattern, and clear empties the buffer', async ({
    callText,
  }) => {
    await expect
      .poll(() => callText('console_logs', { level: 'error' }))
      .toContain('uncaught-boom');

    const errors = await callText('console_logs', { level: 'error' });
    expect(errors).toContain('error-message');
    expect(errors).not.toContain('log-message');
    expect(errors).not.toContain('warn-message');

    const matched = await callText('console_logs', { pattern: 'WARN-MESS' });
    expect(matched).toContain('warn-message');
    expect(matched).not.toContain('info-message');

    const limited = await callText('console_logs', { limit: 1 });
    expect(limited.split('\n').filter((line) => /^\[\d/.test(line))).toHaveLength(1);

    await callText('console_logs', { clear: true });
    expect(await callText('console_logs')).toContain('No console messages.');
  });

  test('network_requests lists fetches with statuses and filters failures', async ({
    baseUrl,
    callText,
  }) => {
    await expect
      .poll(() => callText('network_requests', { status: 'failed' }))
      .toContain('127.0.0.1:1/unreachable');

    await expect
      .poll(() => callText('network_requests', { urlPattern: 'data.json' }))
      .toMatch(/data\.json \(Fetch, /);
    const all = await callText('network_requests', { urlPattern: baseUrl });
    expect(all).toMatch(/\[[\d.]+\] GET 200 .*\/data\.json \(Fetch, \d+ B, \d+ ms\)/);
    expect(all).toMatch(/GET 404 .*\/missing\.json/);

    const failed = await callText('network_requests', { status: 'failed' });
    expect(failed).toMatch(/GET failed: net::ERR_\w+ http:\/\/127\.0\.0\.1:1\/unreachable/);
    expect(failed).not.toContain('data.json');

    const notFound = await callText('network_requests', { status: '4xx' });
    expect(notFound).toContain('missing.json');
    expect(notFound).not.toContain('data.json');
    expect(await callText('network_requests', { status: 404 })).toContain('missing.json');
    expect(await callText('network_requests', { status: '5xx' })).toContain(
      'No matching requests.',
    );
    expect(await callText('network_requests', { method: 'POST' })).toContain(
      'No matching requests.',
    );
  });

  test('network_response returns headers and the JSON body', async ({ baseUrl, callText }) => {
    await expect
      .poll(() => callText('network_requests', { urlPattern: 'data.json' }))
      .toMatch(/ GET 200 .*\(Fetch, /);
    const listing = await callText('network_requests', { urlPattern: 'data.json' });
    const line = listing.split('\n').find((l) => l.includes('/data.json'))!;
    const requestId = /\[([^\]]+)\]/.exec(line)![1]!;

    const response = await callText('network_response', { requestId });
    expect(response).toContain(`GET ${baseUrl}/data.json`);
    expect(response).toContain('Status: 200');
    expect(response).toMatch(/content-type: application\/json/i);
    expect(response).toContain('"hello": "world"');

    await expect(callText('network_response', { requestId: 'nope' })).rejects.toThrow(
      'No request with id',
    );
  });
});

test.describe('js_eval', () => {
  test('runs ungated from the debug page and returns JSON', async ({ callText, openFixture }) => {
    await openFixture('console.html');
    expect(await callText('js_eval', { code: '({ a: 1, b: [document.title] })' })).toContain(
      '{"a":1,"b":["Console fixture"]}',
    );
    expect(await callText('js_eval', { code: 'Promise.resolve(7)' })).toContain('7');
    await expect(callText('js_eval', { code: 'throw new Error("nope")' })).rejects.toThrow(
      'JavaScript threw: Error: nope',
    );
  });

  test('from the agent asks even in auto mode, shows the code and runs after approval', async ({
    mockAnthropic: mock,
    openFixture,
    openSidePanel,
    setSafety,
  }) => {
    await openFixture('console.html');
    await setSafety({ mode: 'auto' });
    const code = 'document.title + "!"';
    mock.play(
      [{ type: 'tool_use', id: 'toolu_eval', name: 'js_eval', input: { code } }],
      [{ type: 'text', text: 'Evaluated.' }],
    );
    const panel = await openSidePanel();
    await send(panel, 'What is the title?');

    await expect(card(panel)).toBeVisible();
    await expect(card(panel)).toContainText('js_eval');
    await expect(card(panel).getByTestId('approval-code')).toHaveText(code);
    await expect(card(panel).getByTestId('approval-risk')).toContainText(
      'Runs JavaScript in the page',
    );
    await expect(card(panel).getByRole('button', { name: 'Allow on this site' })).toHaveCount(0);
    await card(panel).getByRole('button', { name: 'Allow once' }).click();

    await expect(panel.getByText('Evaluated.')).toBeVisible();
    const result = toolResult(mock.requests[1]!, 'toolu_eval');
    expect(result.isError).toBe(false);
    expect(result.text).toContain('"Console fixture!"');
    expect(result.text).toContain('<page_content');
  });

  test('Deny returns an error to the agent and the code does not run', async ({
    mockAnthropic: mock,
    openFixture,
    openSidePanel,
    setSafety,
  }) => {
    const page = await openFixture('console.html');
    await setSafety({ mode: 'auto' });
    mock.play(
      [
        {
          type: 'tool_use',
          id: 'toolu_eval',
          name: 'js_eval',
          input: { code: 'document.title = "changed"' },
        },
      ],
      [{ type: 'text', text: 'Not allowed.' }],
    );
    const panel = await openSidePanel();
    await send(panel, 'Rename the page');

    await card(panel).getByRole('button', { name: 'Deny' }).click();
    await expect(panel.getByText('Not allowed.')).toBeVisible();
    expect(toolResult(mock.requests[1]!, 'toolu_eval')).toEqual({
      isError: true,
      text: 'The user denied this action.',
    });
    await expect(page).toHaveTitle('Console fixture');
  });
});

test('a multi-tab agent run reads two background tabs by tabId', async ({
  baseUrl,
  mockAnthropic: mock,
  openSidePanel,
  setSafety,
}) => {
  await setSafety({ sites: [baseUrl] });
  const openedIds = (request: RecordedRequest) =>
    ['toolu_a', 'toolu_b'].map((id) => /Opened tab (\d+)/.exec(toolResult(request, id).text)![1]!);
  mock.play(
    [
      {
        type: 'tool_use',
        id: 'toolu_a',
        name: 'tab_open',
        input: { url: `${baseUrl}/form.html`, background: true },
      },
      {
        type: 'tool_use',
        id: 'toolu_b',
        name: 'tab_open',
        input: { url: `${baseUrl}/next.html`, background: true },
      },
    ],
    (request) => {
      const [a, b] = openedIds(request);
      return [
        { type: 'tool_use', id: 'toolu_text_a', name: 'get_text', input: { tabId: Number(a) } },
        { type: 'tool_use', id: 'toolu_text_b', name: 'get_text', input: { tabId: Number(b) } },
      ];
    },
    [{ type: 'text', text: 'Read both.' }],
  );
  const panel = await openSidePanel();
  await send(panel, 'Compare the form page and the next page');
  await expect(panel.getByText('Read both.')).toBeVisible();

  const [formId, nextId] = openedIds(mock.requests[1]!);
  const third = mock.requests[2]!;
  expect(toolResult(third, 'toolu_text_a').text).toMatch(
    new RegExp(`^\\[tab ${formId} · Form fixture · ${baseUrl}/form\\.html\\]\\n<page_content`),
  );
  expect(toolResult(third, 'toolu_text_b').text).toMatch(
    new RegExp(`^\\[tab ${nextId} · Next page · ${baseUrl}/next\\.html\\]\\n<page_content`),
  );
  expect(toolResult(third, 'toolu_text_b').text).toContain('You arrived at the second page.');

  // Opening in the background never switched the current tab.
  expect(toolResult(mock.requests[1]!, 'toolu_a').text).toContain('in the background');

  // The note rides after the cached history in the last user message of the next request.
  const stateNote = (request: RecordedRequest) =>
    (request.body.messages.at(-1)!.content.at(-1) as { text?: string }).text ?? '';
  expect(stateNote(mock.requests[1]!)).toMatch(/^Tab state/);
  expect(stateNote(mock.requests[1]!)).toContain(
    `- ${formId} · Form fixture · ${baseUrl}/form.html`,
  );
  expect(stateNote(mock.requests[1]!)).toContain(`- ${nextId} · Next page · ${baseUrl}/next.html`);
  expect(stateNote(mock.requests[1]!)).not.toContain('[current]');
});
