import type { Page } from '@playwright/test';
import type { Workflow } from '@autochrome/shared';
import { expect, refOf, test } from './harness';
import type { RecordedRequest } from './mockAnthropic';

test.beforeEach(async ({ setSafety }) => setSafety({ mode: 'auto' }));

const signInTarget = {
  role: 'button',
  name: 'Sign in',
  selector: '#signin',
  url: 'http://localhost/login.html',
};

function loginWorkflow(baseUrl: string, patch: Partial<Workflow> = {}): Workflow {
  return {
    id: 'w-login',
    name: 'Sign in to the fixture',
    variables: [],
    steps: [
      { tool: 'navigate', input: { url: `${baseUrl}/login.html` }, note: 'Go to the login page' },
      {
        tool: 'form_input',
        input: { value: 'ada@example.com' },
        target: { role: 'textbox', name: 'Email', selector: '#email' },
        note: 'Set "Email" to "ada@example.com"',
      },
      { tool: 'click', input: {}, target: signInTarget, note: 'Click "Sign in"' },
    ],
    createdFrom: 'recording',
    updatedAt: 1,
    ...patch,
  };
}

/** Puts a workflow in storage the way the panel does. */
async function seed(debugPage: Page, workflow: Workflow) {
  await debugPage.evaluate(async (wf) => {
    const stored = await chrome.storage.local.get('workflow:index');
    const index = ((stored['workflow:index'] as { id: string }[] | undefined) ?? []).filter(
      (entry) => entry.id !== wf.id,
    );
    await chrome.storage.local.set({
      [`workflow:${wf.id}`]: wf,
      'workflow:index': [
        { id: wf.id, name: wf.name, updatedAt: wf.updatedAt, steps: wf.steps.length },
        ...index,
      ],
    });
  }, workflow);
}

async function openWorkflows(openSidePanel: () => Promise<Page>): Promise<Page> {
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: 'Workflows' }).click();
  return panel;
}

/** The most recent tab showing a fixture page, other than `excluding`. */
function tabWith(page: Page, file: string, excluding?: Page): Page | undefined {
  return page
    .context()
    .pages()
    .filter((candidate) => candidate !== excluding && candidate.url().endsWith(`/${file}`))
    .at(-1);
}

/** The notes of the steps in the open editor, in order. */
const editorNotes = (panel: Page) =>
  panel
    .getByLabel(/^Note for step/)
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

const runStatus = (panel: Page) => panel.getByTestId('run-status');
const stepNotes = (panel: Page) => panel.getByTestId('run-step').locator('.wf-step-note');

test('records what you do, never stores the password, and replays it in a fresh tab', async ({
  debugPage,
  openFixture,
  openSidePanel,
}) => {
  const original = await openFixture('login.html');
  const panel = await openWorkflows(openSidePanel);

  await original.bringToFront();
  await panel.getByRole('button', { name: 'Record' }).click();
  const bar = panel.getByTestId('recording-bar');
  await expect(bar).toBeVisible();
  await expect(panel.getByTestId('recording-count')).toHaveText('1 step');

  await original.getByLabel('Email').fill('ada@example.com');
  await original.getByLabel('Password').fill('hunter2');
  await original.getByLabel('Plan').focus();
  await original.keyboard.press('ArrowDown');
  await original.getByLabel('Remember me').check();
  await original.getByRole('button', { name: 'Sign in' }).click();
  await expect(original.locator('#result')).toContainText('signed in');

  await expect(panel.getByTestId('recording-count')).toHaveText('6 steps');
  await expect(bar).toContainText('Click "Sign in"');

  // The typed password never left the page: not in storage, not in the recording.
  const everything = await debugPage.evaluate(async () =>
    JSON.stringify([await chrome.storage.local.get(null), await chrome.storage.session.get(null)]),
  );
  expect(everything).not.toContain('hunter2');
  expect(everything).toContain('{{password}}');

  await bar.getByRole('button', { name: 'Stop' }).click();
  await expect(bar).toBeHidden();
  const editor = panel.getByRole('region', { name: 'Workflow editor' });
  await expect(editor).toBeVisible();
  await expect
    .poll(() => editorNotes(panel))
    .toEqual([
      expect.stringMatching(/^Go to http/),
      'Set "Email" to "ada@example.com"',
      'Set "Password" to "{{password}}"',
      'Set "Plan" to "Pro"',
      'Check "Remember me"',
      'Click "Sign in"',
    ]);
  await expect(editor.getByText('{{password}}', { exact: true })).toBeVisible();

  // Replay with the password asked for at run time.
  await editor.getByRole('button', { name: 'Run', exact: true }).click();
  const dialog = panel.getByRole('form', { name: /^Run / });
  await dialog.getByLabel('Password').fill('s3cret');
  await dialog.getByRole('button', { name: 'Run' }).click();

  await expect(runStatus(panel)).toHaveText('Finished');
  await expect(stepNotes(panel)).toHaveCount(6);
  await expect(panel.getByTestId('run-step').locator('.wf-status-ok')).toHaveCount(6);

  const replay = tabWith(panel, 'login.html', original)!;
  expect(replay).toBeDefined();
  await expect(replay.locator('#result')).toContainText(
    '"email":"ada@example.com","password":"s3cret","plan":"pro","remember":true',
  );

  // The run is in the log without the password.
  const runs = await debugPage.evaluate(async () =>
    JSON.stringify(await chrome.storage.local.get(null)),
  );
  expect(runs).toContain('"workflowName"');
  expect(runs).not.toContain('s3cret');
});

test('an element that moved or was renamed is repaired by the AI, and the workflow can be updated', async ({
  debugPage,
  baseUrl,
  mockAnthropic: mock,
  openSidePanel,
  context,
}) => {
  await seed(
    debugPage,
    loginWorkflow(baseUrl, {
      steps: loginWorkflow(baseUrl).steps.map((step) =>
        step.tool === 'navigate'
          ? { ...step, input: { url: `${baseUrl}/login-renamed.html` } }
          : step,
      ),
    }),
  );
  mock.play(
    (request: RecordedRequest) => {
      const prompt = (request.body.messages[0]!.content[0] as { text: string }).text;
      const ref = refOf(prompt, /button "Log in"/);
      return [{ type: 'tool_use', id: 'toolu_fix', name: 'click', input: { ref } }];
    },
    [{ type: 'text', text: 'DONE I clicked the Log in button instead.' }],
  );

  const panel = await openWorkflows(openSidePanel);
  await panel.getByRole('button', { name: 'Run Sign in to the fixture' }).click();

  await expect(runStatus(panel)).toHaveText('Finished, with steps repaired by the AI', {
    timeout: 20_000,
  });
  const steps = panel.getByTestId('run-step');
  await expect(steps.locator('.wf-status')).toHaveText(['ok', 'ok', 'repaired by AI']);
  await expect(steps.nth(2)).toContainText('Could not find button "Sign in"');
  await expect(steps.nth(2)).toContainText('I clicked the Log in button instead.');

  // What the AI was told: the failed step, the page, the limit.
  const request = mock.requests[0]!;
  expect(request.body.system[0]!.text).toContain('at most 8 tool calls');
  const prompt = (request.body.messages[0]!.content[0] as { text: string }).text;
  expect(prompt).toContain('Step 3 of 3 failed');
  expect(prompt).toContain('Click "Sign in"');

  const replay = tabWith(panel, 'login-renamed.html')!;
  await expect(replay.locator('#result')).toContainText('signed in');

  await panel.getByRole('button', { name: 'Update workflow with repaired step' }).click();
  await expect(panel.getByText('Workflow updated.')).toBeVisible();

  // The next run finds the button by itself and needs no AI.
  await panel.getByRole('button', { name: 'Back to workflows' }).click();
  await panel.getByRole('button', { name: 'Edit Sign in to the fixture' }).click();
  await expect(panel.getByLabel('Note for step 3')).toHaveValue('Click "Log in"');
  await panel.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(runStatus(panel)).toHaveText('Finished');
  expect(mock.requests).toHaveLength(2);
  expect(context.pages().length).toBeGreaterThan(2);
});

test('fails the step with a clear message and a screenshot when no AI provider is set up', async ({
  debugPage,
  baseUrl,
  openSidePanel,
}) => {
  await seed(
    debugPage,
    loginWorkflow(baseUrl, {
      steps: [
        { tool: 'navigate', input: { url: `${baseUrl}/login-renamed.html` }, note: 'Go to login' },
        { tool: 'click', input: {}, target: signInTarget, note: 'Click "Sign in"' },
        { tool: 'key', input: { keys: 'Enter' }, note: 'Press Enter' },
      ],
    }),
  );
  const panel = await openWorkflows(openSidePanel);
  await panel.getByRole('button', { name: 'Run Sign in to the fixture' }).click();

  await expect(runStatus(panel)).toHaveText('Failed', { timeout: 20_000 });
  const steps = panel.getByTestId('run-step');
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(1).locator('.wf-status')).toHaveText('failed');
  await expect(steps.nth(1)).toContainText('No AI provider is set up');
  await expect(steps.nth(1).getByAltText(/Screenshot of the page/)).toBeVisible();
  // The run stopped there, so the last step never ran.
  await expect(
    panel.getByRole('button', { name: 'Update workflow with repaired step' }),
  ).toHaveCount(0);
});

test('asks for variables, fills defaults, and substitutes them', async ({
  debugPage,
  baseUrl,
  openSidePanel,
}) => {
  const base = loginWorkflow(baseUrl);
  await seed(
    debugPage,
    loginWorkflow(baseUrl, {
      variables: [{ name: 'who', label: 'Who signs in', default: 'ada@example.com' }],
      steps: base.steps.map((step) =>
        step.tool === 'form_input' ? { ...step, input: { value: '{{who}}' } } : step,
      ),
    }),
  );
  const panel = await openWorkflows(openSidePanel);
  await panel.getByRole('button', { name: 'Run Sign in to the fixture' }).click();

  const dialog = panel.getByRole('form', { name: /^Run / });
  await expect(dialog.getByLabel('Who signs in')).toHaveValue('ada@example.com');
  await dialog.getByLabel('Who signs in').fill('grace@example.com');
  await dialog.getByRole('button', { name: 'Run' }).click();

  await expect(runStatus(panel)).toHaveText('Finished');
  const replay = tabWith(panel, 'login.html')!;
  await expect(replay.locator('#result')).toContainText('"email":"grace@example.com"');
});

test('saves a finished chat as a workflow and replays it', async ({
  baseUrl,
  mockAnthropic: mock,
  openSidePanel,
  context,
}) => {
  const resultText = (request: RecordedRequest, id: string) => {
    const block = request.body.messages.at(-1)!.content.find((b) => b.tool_use_id === id);
    return (block?.content as { text?: string }[]).map((item) => item.text ?? '').join('\n');
  };
  mock.play(
    [
      { type: 'text', text: 'Opening the login page.' },
      {
        type: 'tool_use',
        id: 'toolu_open',
        name: 'tab_open',
        input: { url: `${baseUrl}/login.html` },
      },
      { type: 'tool_use', id: 'toolu_read', name: 'read_page', input: {} },
    ],
    (request) => {
      const tree = resultText(request, 'toolu_read');
      return [
        {
          type: 'tool_use',
          id: 'toolu_email',
          name: 'form_input',
          input: { ref: refOf(tree, /textbox "Email"/), value: 'ada@example.com' },
        },
        {
          type: 'tool_use',
          id: 'toolu_click',
          name: 'click',
          input: { ref: refOf(tree, /button "Sign in"/) },
        },
      ];
    },
    [{ type: 'text', text: 'Signed in.' }],
  );

  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('Sign in as Ada');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByText('Signed in.')).toBeVisible();
  const chatTab = context.pages().find((page) => page.url().endsWith('/login.html'))!;
  await expect(chatTab.locator('#result')).toContainText('signed in');

  await panel.getByRole('button', { name: 'Save as workflow' }).click();
  const editor = panel.getByRole('region', { name: 'Workflow editor' });
  await expect(editor.getByLabel('Name')).toHaveValue('Sign in as Ada');
  // Reads are dropped and refs became the elements they pointed at.
  await expect
    .poll(() => editorNotes(panel))
    .toEqual([
      `Go to ${baseUrl}/login.html`,
      'Set "Email" to "ada@example.com"',
      'Click "Sign in"',
    ]);

  await editor.getByRole('button', { name: 'Back to workflows' }).click();
  await panel.getByRole('button', { name: 'Run Sign in as Ada' }).click();
  await expect(runStatus(panel)).toHaveText('Finished');
  await expect(stepNotes(panel)).toHaveCount(3);
  const replay = tabWith(panel, 'login.html', chatTab)!;
  await expect(replay.locator('#result')).toContainText('"email":"ada@example.com"');
  expect(mock.requests).toHaveLength(3);
});

test('a workflow run is gated like the agent: it asks inline in the panel', async ({
  debugPage,
  baseUrl,
  setSafety,
  openSidePanel,
}) => {
  await setSafety({ mode: 'per-site', sites: [] });
  await seed(debugPage, loginWorkflow(baseUrl));
  const panel = await openWorkflows(openSidePanel);
  await panel.getByRole('button', { name: 'Run Sign in to the fixture' }).click();

  const card = panel.getByTestId('approval-card');
  await expect(card).toContainText('A workflow wants to');
  await expect(card).toContainText('navigate');
  await card.getByRole('button', { name: 'Allow on this site' }).click();

  await expect(runStatus(panel)).toHaveText('Finished');
  await expect(card).toHaveCount(0);
});

test('Stop ends a run that is waiting for an answer', async ({
  debugPage,
  baseUrl,
  setSafety,
  openSidePanel,
}) => {
  await setSafety({ mode: 'ask' });
  await seed(debugPage, loginWorkflow(baseUrl));
  const panel = await openWorkflows(openSidePanel);
  await panel.getByRole('button', { name: 'Run Sign in to the fixture' }).click();
  await expect(panel.getByTestId('approval-card')).toBeVisible();
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(runStatus(panel)).toHaveText('Stopped');
});

test('edits steps and turns a typed value into a variable', async ({
  debugPage,
  baseUrl,
  openSidePanel,
}) => {
  await seed(debugPage, loginWorkflow(baseUrl));
  const panel = await openWorkflows(openSidePanel);
  await panel.getByRole('button', { name: 'Edit Sign in to the fixture' }).click();
  const editor = panel.getByRole('region', { name: 'Workflow editor' });

  await editor.getByLabel('Name').fill('Fixture login');
  await editor.getByLabel('Note for step 3').fill('Press the big button');
  await editor.getByRole('button', { name: 'Move step 3 up' }).click();
  await expect(editor.getByLabel('Note for step 2')).toHaveValue('Press the big button');

  // Select the value and make it a variable.
  await editor.getByLabel('value of step 3').selectText();
  await editor.getByLabel('Variable name').fill('email');
  await editor.getByRole('button', { name: 'Make variable' }).click();
  await expect(editor.getByLabel('value of step 3')).toHaveValue('{{email}}');
  await expect(editor.getByText('{{email}}', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Default for email')).toHaveValue('ada@example.com');

  await editor.getByRole('button', { name: 'Delete step 1' }).click();
  await expect(editor.getByText('Steps (2)')).toBeVisible();

  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor.getByRole('button', { name: 'Saved' })).toBeVisible();
  const saved = (await debugPage.evaluate(
    async () => (await chrome.storage.local.get('workflow:w-login'))['workflow:w-login'],
  )) as Workflow;
  expect(saved).toMatchObject({
    name: 'Fixture login',
    variables: [{ name: 'email', default: 'ada@example.com' }],
  });
  expect(saved.steps.map((s) => s.note)).toEqual([
    'Press the big button',
    'Set "Email" to "{{email}}"',
  ]);
});

test('exports a workflow to JSON and imports it back, rejecting bad files', async ({
  debugPage,
  baseUrl,
  openSidePanel,
}, testInfo) => {
  await seed(debugPage, loginWorkflow(baseUrl));
  const panel = await openWorkflows(openSidePanel);

  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Export Sign in to the fixture' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Sign-in-to-the-fixture.json');
  const file = testInfo.outputPath('workflow.json');
  await download.saveAs(file);

  // Importing a workflow whose id exists keeps both.
  await panel.getByLabel('Import workflow file').setInputFiles(file);
  await expect(panel.getByRole('status')).toContainText('Imported “Sign in to the fixture”');
  await expect(panel.getByTestId('workflow-item')).toHaveCount(2);

  await panel.getByLabel('Import workflow file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ id: 'x', name: 'Bad', steps: [{ tool: 'nope', input: {} }] }),
    ),
  });
  await expect(panel.getByRole('status')).toContainText('Not a workflow');
  await panel.getByLabel('Import workflow file').setInputFiles({
    name: 'notjson.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{oops'),
  });
  await expect(panel.getByRole('status')).toHaveText('This file is not valid JSON.');
  await expect(panel.getByTestId('workflow-item')).toHaveCount(2);
});

test('deleting a workflow removes it from the list', async ({
  debugPage,
  baseUrl,
  openSidePanel,
}) => {
  await seed(debugPage, loginWorkflow(baseUrl));
  const panel = await openWorkflows(openSidePanel);
  await panel.getByRole('button', { name: 'Delete Sign in to the fixture' }).click();
  await expect(panel.getByTestId('workflow-item')).toHaveCount(0);
  await expect(panel.getByText('No workflows yet.')).toBeVisible();
});
