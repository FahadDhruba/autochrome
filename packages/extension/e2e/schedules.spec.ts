/* eslint-disable @typescript-eslint/no-explicit-any -- storage records are read untyped */
import type { Page } from '@playwright/test';
import type { Workflow } from '@autochrome/shared';
import { expect, test } from './harness';
import type { RecordedRequest } from './mockAnthropic';

type Seed = {
  id: string;
  name: string;
  enabled?: boolean;
  run?: object;
  when?: object;
  nextRunAt?: number;
};

const signInTarget = { role: 'button', name: 'Sign in', selector: '#signin' };

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

async function seedWorkflow(debugPage: Page, workflow: Workflow) {
  await debugPage.evaluate(async (wf) => {
    await chrome.storage.local.set({
      [`workflow:${wf.id}`]: wf,
      'workflow:index': [
        { id: wf.id, name: wf.name, updatedAt: wf.updatedAt, steps: wf.steps.length },
      ],
    });
  }, workflow);
}

/** Puts a schedule in storage the way the side panel does. */
async function seedSchedule(debugPage: Page, seed: Seed) {
  await debugPage.evaluate(async (s) => {
    const schedule = {
      enabled: true,
      run: { kind: 'workflow', workflowId: 'w-login', variables: {} },
      when: { every: 'day', time: '09:00' },
      sites: [],
      nextRunAt: Date.now() + 3_600_000,
      ...s,
    };
    const stored = await chrome.storage.local.get('schedule:index');
    const index = ((stored['schedule:index'] as { id: string }[] | undefined) ?? []).filter(
      (entry) => entry.id !== schedule.id,
    );
    await chrome.storage.local.set({
      [`schedule:${schedule.id}`]: schedule,
      'schedule:index': [schedule, ...index],
    });
  }, seed);
}

type FireResult = { ran: true; runId: string; status: string } | { ran: false; reason: string };

/** Runs the schedule's alarm handler now (a test-only hook; real alarms cannot be waited for). */
const fire = (debugPage: Page, id: string): Promise<FireResult> =>
  debugPage.evaluate(
    (scheduleId) =>
      chrome.runtime.sendMessage({ type: 'autochrome:test-fire-schedule', id: scheduleId }),
    id,
  );

const storedRuns = (debugPage: Page) =>
  debugPage.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([key]) => /^run:[0-9a-f-]{36}$/.test(key))
      .map(([, run]) => run as Record<string, any>);
  });

/** One value from extension storage. */
const stored = <T = Record<string, any>>(debugPage: Page, key: string): Promise<T> =>
  debugPage.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key) as Promise<T>;

const notificationIds = (debugPage: Page) =>
  debugPage.evaluate(async () => Object.keys(await chrome.notifications.getAll()));

const alarmNames = (debugPage: Page) =>
  debugPage.evaluate(async () =>
    (await chrome.alarms.getAll())
      .map((alarm) => alarm.name)
      .filter((n) => n.startsWith('schedule:')),
  );

const groupTitles = (debugPage: Page) =>
  debugPage.evaluate(async () => (await chrome.tabGroups.query({})).map((group) => group.title));

const pagesWith = (page: Page, file: string) =>
  page
    .context()
    .pages()
    .filter((candidate) => candidate.url().endsWith(`/${file}`));

async function openRuns(openSidePanel: () => Promise<Page>): Promise<Page> {
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: 'Runs' }).click();
  return panel;
}

test.beforeEach(async ({ setSafety }) => {
  // Scheduled runs must act as in Auto mode whatever is saved here.
  await setSafety({ mode: 'ask', sites: [] });
});

test('a workflow schedule runs, logs, notifies, closes its tabs and moves on', async ({
  debugPage,
  baseUrl,
  openSidePanel,
}) => {
  // A wait keeps the run going long enough to see its tab group.
  const workflow = loginWorkflow(baseUrl);
  workflow.steps.push({ tool: 'wait', input: { ms: 1500 }, note: 'Wait' });
  await seedWorkflow(debugPage, workflow);
  await seedSchedule(debugPage, { id: 's-flow', name: 'Morning sign-in' });

  const before = Date.now();
  const firing = fire(debugPage, 's-flow');
  await expect.poll(() => groupTitles(debugPage)).toContain('autochrome · Morning sign-in');
  const result = await firing;
  expect(result).toMatchObject({ ran: true, status: 'ok' });
  const { runId } = result as Extract<FireResult, { ran: true }>;

  // Ran as asked: the click on a form submit button went through without a prompt in "ask" mode.
  const [run] = await storedRuns(debugPage);
  expect(run).toMatchObject({
    id: runId,
    trigger: 'schedule',
    source: 'scheduled',
    kind: 'workflow',
    scheduleId: 's-flow',
    scheduleName: 'Morning sign-in',
    status: 'ok',
  });
  expect(run!.steps.map((step: { status: string }) => step.status)).toEqual([
    'ok',
    'ok',
    'ok',
    'ok',
  ]);

  // Its tabs closed because it worked.
  await expect.poll(() => pagesWith(debugPage, 'login.html').length).toBe(0);
  await expect.poll(() => groupTitles(debugPage)).not.toContain('autochrome · Morning sign-in');

  // The schedule moved on and remembers the result; the alarm follows.
  const schedule = await stored(debugPage, 'schedule:s-flow');
  expect(schedule.nextRunAt).toBeGreaterThan(before);
  expect(schedule.lastRun).toMatchObject({ id: runId, status: 'ok', trigger: 'schedule' });
  await expect.poll(() => alarmNames(debugPage)).toContain('schedule:s-flow');

  // One notification, with the result.
  expect(await notificationIds(debugPage)).toEqual([`run:${runId}`]);

  // The Runs view lists it with its log.
  const panel = await openRuns(openSidePanel);
  const item = panel.getByTestId('run-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Morning sign-in');
  await expect(item).toContainText('Schedule');
  await item.click();
  await expect(panel.getByTestId('run-status')).toHaveText('Finished');
  await expect(panel.getByTestId('run-step')).toHaveCount(4);
  await expect(panel.getByTestId('run-origin')).toContainText('Schedule · Morning sign-in');
});

test('a failed run leaves its tab open, logs the failed step and says so', async ({
  debugPage,
  baseUrl,
  openSidePanel,
}) => {
  await seedWorkflow(
    debugPage,
    loginWorkflow(baseUrl, {
      steps: [
        { tool: 'navigate', input: { url: `${baseUrl}/login-renamed.html` }, note: 'Go to login' },
        { tool: 'click', input: {}, target: signInTarget, note: 'Click "Sign in"' },
      ],
    }),
  );
  await seedSchedule(debugPage, { id: 's-fail', name: 'Broken check' });

  const result = await fire(debugPage, 's-fail');
  expect(result).toMatchObject({ ran: true, status: 'failed' });
  const { runId } = result as Extract<FireResult, { ran: true }>;

  // The page stays open, in the schedule's own group, for inspection.
  expect(pagesWith(debugPage, 'login-renamed.html')).toHaveLength(1);
  expect(await groupTitles(debugPage)).toContain('autochrome · Broken check');

  expect(await notificationIds(debugPage)).toEqual([`run:${runId}`]);
  const notice = await debugPage.evaluate(
    async (id) => (await chrome.notifications.getAll())[`run:${id}`],
    runId,
  );
  expect(notice).toBeTruthy();

  const schedule = await stored(debugPage, 'schedule:s-fail');
  expect(schedule.lastRun).toMatchObject({ status: 'failed' });

  const panel = await openRuns(openSidePanel);
  await panel.getByTestId('run-item').click();
  await expect(panel.getByTestId('run-status')).toHaveText('Failed');
  const steps = panel.getByTestId('run-step');
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(1).locator('.wf-status')).toHaveText('failed');
  await expect(steps.nth(1)).toContainText('No AI provider is set up');
});

test('a prompt schedule runs the mock provider, saves a chat and links it from the run', async ({
  debugPage,
  baseUrl,
  mockAnthropic: mock,
  openSidePanel,
}) => {
  mock.play(
    [
      {
        type: 'tool_use',
        id: 'toolu_open',
        name: 'tab_open',
        input: { url: `${baseUrl}/checkout.html` },
      },
    ],
    [{ type: 'text', text: 'The page is called Checkout.' }],
  );
  await seedSchedule(debugPage, {
    id: 's-prompt',
    name: 'Page title',
    run: {
      kind: 'prompt',
      prompt: 'What is the page called?',
      providerId: 'anthropic',
      model: 'mock-model',
    },
  });

  const result = await fire(debugPage, 's-prompt');
  expect(result).toMatchObject({ ran: true, status: 'ok' });

  // The scheduled agent worked unattended, with the chosen model.
  expect(mock.requests).toHaveLength(2);
  expect(mock.requests[0]!.body.model).toBe('mock-model');
  expect(mock.requests[0]!.body.system.map((block) => block.text).join('\n')).toContain(
    'unattended scheduled run',
  );
  // tab_open in "ask" mode did not wait for anyone; the run closed its tab afterwards.
  await expect.poll(() => pagesWith(debugPage, 'checkout.html').length).toBe(0);

  const [run] = await storedRuns(debugPage);
  expect(run).toMatchObject({
    kind: 'prompt',
    trigger: 'schedule',
    scheduleName: 'Page title',
    summary: 'The page is called Checkout.',
    status: 'ok',
  });
  expect(run!.steps).toHaveLength(1);
  const chat = await stored(debugPage, `chat:${run!.chatId}`);
  expect(chat.title).toBe('Page title: What is the page called?');

  const panel = await openRuns(openSidePanel);
  await panel.getByTestId('run-item').click();
  await expect(panel.getByTestId('run-summary')).toHaveText('The page is called Checkout.');
  await panel.getByRole('button', { name: 'Open chat' }).click();
  await expect(panel.getByText('What is the page called?').first()).toBeVisible();
  await expect(panel.getByText('The page is called Checkout.').first()).toBeVisible();
});

test('a scheduled run cannot run JavaScript, and acts without asking otherwise', async ({
  debugPage,
  baseUrl,
  context,
  mockAnthropic: mock,
}) => {
  const resultOf = (request: RecordedRequest, id: string) => {
    const block = request.body.messages.at(-1)!.content.find((b) => b.tool_use_id === id);
    return {
      isError: block?.is_error === true,
      text: (block?.content as { text?: string }[]).map((item) => item.text ?? '').join('\n'),
    };
  };
  mock.play(
    [
      {
        type: 'tool_use',
        id: 'toolu_open',
        name: 'tab_open',
        input: { url: `${baseUrl}/checkout.html` },
      },
    ],
    [{ type: 'tool_use', id: 'toolu_js', name: 'js_eval', input: { code: '1 + 1' } }],
    [{ type: 'tool_use', id: 'toolu_find', name: 'find', input: { query: 'Place order' } }],
    (request) => {
      const found = resultOf(request, 'toolu_find').text;
      const ref = /\[(e\d+)\][^\n]*Place order/.exec(found)?.[1] ?? /(e\d+)/.exec(found)![1]!;
      return [{ type: 'tool_use', id: 'toolu_click', name: 'click', input: { ref } }];
    },
    [{ type: 'text', text: 'Needs the side panel for JavaScript.' }],
  );
  await seedSchedule(debugPage, {
    id: 's-js',
    name: 'Orders',
    run: { kind: 'prompt', prompt: 'Order and evaluate', providerId: 'anthropic', model: 'm' },
  });

  const pagesBefore = context.pages().length;
  const result = await fire(debugPage, 's-js');
  expect(result).toMatchObject({ ran: true, status: 'ok' });

  const js = resultOf(mock.requests[2]!, 'toolu_js');
  expect(js.isError).toBe(true);
  expect(js.text).toContain('Scheduled runs cannot run JavaScript; run it from the side panel');
  // "Place order" is risky, yet it ran without a prompt: no approval popup ever opened.
  expect(resultOf(mock.requests[4]!, 'toolu_click').isError).toBe(false);
  expect(context.pages().length).toBeLessThanOrEqual(pagesBefore + 1);
  expect(context.pages().some((page) => page.url().includes('approve.html'))).toBe(false);
});

test('a disabled schedule does not run', async ({ debugPage, baseUrl }) => {
  await seedWorkflow(debugPage, loginWorkflow(baseUrl));
  await seedSchedule(debugPage, { id: 's-off', name: 'Off', enabled: false });

  expect(await fire(debugPage, 's-off')).toEqual({
    ran: false,
    reason: 'The schedule is disabled.',
  });
  expect(await storedRuns(debugPage)).toHaveLength(0);
  expect(await notificationIds(debugPage)).toEqual([]);
  expect(pagesWith(debugPage, 'login.html')).toHaveLength(0);
  expect(await alarmNames(debugPage)).not.toContain('schedule:s-off');
});

test('on start, an overdue schedule catches up once and its alarm is set again', async ({
  debugPage,
  baseUrl,
}) => {
  await seedWorkflow(debugPage, loginWorkflow(baseUrl));
  const longAgo = Date.now() - 3 * 24 * 3_600_000;
  await seedSchedule(debugPage, {
    id: 's-late',
    name: 'Missed',
    when: { every: 'minutes', minutes: 15 },
    nextRunAt: longAgo,
  });
  await seedSchedule(debugPage, { id: 's-ok', name: 'Not due' });
  await seedSchedule(debugPage, {
    id: 's-dis',
    name: 'Disabled',
    enabled: false,
    nextRunAt: longAgo,
  });

  const resume = () =>
    debugPage.evaluate(() => chrome.runtime.sendMessage({ type: 'autochrome:test-resume' }));
  await resume();
  await expect.poll(async () => (await storedRuns(debugPage)).length).toBe(1);
  await expect
    .poll(async () =>
      stored(debugPage, 'schedule:s-late').then((schedule) => schedule.lastRun?.status),
    )
    .toBe('ok');

  // Three days of missed 15-minute runs make one run, and the next one is in the future.
  const late = await stored(debugPage, 'schedule:s-late');
  expect(late.nextRunAt).toBeGreaterThan(Date.now());
  expect(late.nextRunAt).toBeLessThan(Date.now() + 16 * 60_000);
  const alarms = await debugPage.evaluate(async () =>
    (await chrome.alarms.getAll())
      .filter((a) => a.name.startsWith('schedule:'))
      .map((a) => [a.name, a.scheduledTime] as const),
  );
  expect(alarms.map(([name]) => name).sort()).toEqual(['schedule:s-late', 'schedule:s-ok']);
  expect(alarms.find(([name]) => name === 'schedule:s-late')![1]).toBe(late.nextRunAt);

  // Starting again right away finds nothing overdue.
  await resume();
  await debugPage.waitForTimeout(500);
  expect(await storedRuns(debugPage)).toHaveLength(1);
  const runs = await storedRuns(debugPage);
  expect(runs[0]).toMatchObject({ scheduleId: 's-late', trigger: 'schedule' });
});

test('create, run now, toggle and delete a schedule from the side panel', async ({
  debugPage,
  baseUrl,
  openSidePanel,
}) => {
  await seedWorkflow(debugPage, loginWorkflow(baseUrl));
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: 'Schedules' }).click();
  await expect(panel.getByText('No schedules yet.')).toBeVisible();

  await panel.getByRole('button', { name: 'New schedule' }).click();
  const editor = panel.getByRole('form', { name: 'Schedule editor' });
  await editor.getByLabel('Name').fill('Weekday sign-in');
  await editor
    .getByLabel('Workflow', { exact: true })
    .selectOption({ label: 'Sign in to the fixture' });
  await editor.getByLabel('When').selectOption('day');
  await editor.getByLabel('Time of day').fill('07:30');
  await editor.getByLabel('Mon').check();
  await editor.getByLabel('Tue').check();

  // Intervals under 15 minutes are refused.
  await editor.getByLabel('When').selectOption('minutes');
  await editor.getByLabel('Minutes between runs').fill('5');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor.getByRole('alert')).toContainText('at most every 15 minutes');
  await editor.getByLabel('When').selectOption('day');
  await editor.getByRole('button', { name: 'Save' }).click();

  const item = panel.getByTestId('schedule-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Weekday sign-in');
  await expect(item).toContainText('Mon, Tue at 07:30');
  await expect(panel.getByTestId('schedule-next')).toContainText('Next:');
  await expect.poll(() => alarmNames(debugPage)).toEqual([expect.stringMatching(/^schedule:/)]);

  // Settings warns while a schedule is on.
  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.getByTestId('schedule-warning')).toContainText(
    'Scheduled runs act in Auto mode',
  );
  await panel.getByRole('button', { name: 'Schedules' }).click();

  // Run now works while it is on and shows the result.
  await panel.getByRole('button', { name: 'Run Weekday sign-in now' }).click();
  await expect(panel.getByTestId('schedule-last')).toContainText('Last: ok', { timeout: 20_000 });
  await panel.getByTestId('schedule-last').click();
  await expect(panel.getByTestId('run-status')).toHaveText('Finished');
  await expect(panel.getByTestId('run-origin')).toContainText('Schedule · Weekday sign-in');
  await panel.getByRole('button', { name: 'Back to runs' }).click();
  await panel.getByRole('button', { name: 'Schedules' }).click();

  // Turning it off removes the alarm and the Safety warning.
  await panel.getByLabel('Enable Weekday sign-in').uncheck();
  await expect(panel.getByTestId('schedule-next')).toHaveText('Disabled');
  await expect.poll(() => alarmNames(debugPage)).toEqual([]);
  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.getByTestId('schedule-warning')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Schedules' }).click();

  await panel.getByLabel('Enable Weekday sign-in').check();
  await expect.poll(() => alarmNames(debugPage)).toHaveLength(1);

  await panel.getByRole('button', { name: 'Delete Weekday sign-in' }).click();
  await expect(item).toHaveCount(0);
  await expect.poll(() => alarmNames(debugPage)).toEqual([]);
});

test('a prompt schedule can be created in the editor with a provider and model', async ({
  debugPage,
  mockAnthropic: mock,
  openSidePanel,
}) => {
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: 'Schedules' }).click();
  await panel.getByRole('button', { name: 'New schedule' }).click();
  const editor = panel.getByRole('form', { name: 'Schedule editor' });
  await editor.getByLabel('Name').fill('Digest');
  await editor.getByLabel('What to run').selectOption('prompt');
  await editor.getByLabel('Prompt').fill('Summarise example.com');
  await editor.getByLabel('Model', { exact: true }).fill('claude-test');
  await editor.getByLabel('When').selectOption('week');
  await editor.getByLabel('Day of the week').selectOption('5');
  await editor.getByLabel('Time of day').fill('18:00');
  await editor.getByRole('button', { name: 'Save' }).click();

  await expect(panel.getByTestId('schedule-item')).toContainText('AI prompt · Every Fri at 18:00');
  const [schedule] = await debugPage.evaluate(async () => {
    const index = (await chrome.storage.local.get('schedule:index'))['schedule:index'];
    return index as Record<string, any>[];
  });
  expect(schedule).toMatchObject({
    name: 'Digest',
    enabled: true,
    run: {
      kind: 'prompt',
      prompt: 'Summarise example.com',
      providerId: 'anthropic',
      model: 'claude-test',
    },
    when: { every: 'week', day: 5, time: '18:00' },
  });
  expect(new Date(schedule!.nextRunAt).getDay()).toBe(5);
  expect(mock.requests).toHaveLength(0);
});

test('a notification click opens the run: in a tab with #run= when the side panel will not open', async ({
  debugPage,
  baseUrl,
  context,
}) => {
  await seedWorkflow(debugPage, loginWorkflow(baseUrl));
  await seedSchedule(debugPage, { id: 's-note', name: 'Notify me' });
  const result = (await fire(debugPage, 's-note')) as Extract<FireResult, { ran: true }>;

  // Without a real user gesture Chrome refuses sidePanel.open, so the run opens in a tab.
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    debugPage.evaluate(
      (runId) => chrome.runtime.sendMessage({ type: 'autochrome:test-click-notification', runId }),
      result.runId,
    ),
  ]);
  await opened.waitForLoadState();
  expect(opened.url()).toMatch(/\/sidepanel\.html#run=/);
  await expect(opened.getByTestId('run-status')).toHaveText('Finished');
  await expect(opened.getByTestId('run-origin')).toContainText('Schedule · Notify me');

  // The same route works when typed in directly.
  const direct = await context.newPage();
  await direct.goto(`${opened.url().split('#')[0]}#run=${result.runId}`);
  await expect(direct.getByTestId('run-status')).toHaveText('Finished');
});

test('runs started by hand appear in the Runs view too, and old runs read as manual', async ({
  debugPage,
  baseUrl,
  openSidePanel,
  setSafety,
}) => {
  await setSafety({ mode: 'auto' });
  await seedWorkflow(debugPage, loginWorkflow(baseUrl));
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: 'Workflows' }).click();
  await panel.getByRole('button', { name: 'Run Sign in to the fixture' }).click();
  await expect(panel.getByTestId('run-status')).toHaveText('Finished');

  await debugPage.evaluate(async () => {
    // An old record from before schedules existed has no trigger: it reads as manual.
    const run = {
      id: '00000000-0000-4000-8000-000000000000',
      workflowId: 'w-login',
      workflowName: 'Old run',
      source: 'workflow',
      startedAt: 1,
      finishedAt: 2,
      status: 'ok',
      totalSteps: 0,
      variableNames: [],
      steps: [],
    };
    const { 'run:index': index } = await chrome.storage.local.get('run:index');
    await chrome.storage.local.set({
      [`run:${run.id}`]: run,
      'run:index': [...(index as object[]), run],
    });
  });

  await panel.getByRole('button', { name: 'Runs' }).click();
  const items = panel.getByTestId('run-item');
  await expect(items).toHaveCount(2);
  await expect(items.filter({ hasText: 'Manual' })).toHaveCount(2);
  await expect(items.filter({ hasText: 'Old run' })).toContainText('Manual');
});
