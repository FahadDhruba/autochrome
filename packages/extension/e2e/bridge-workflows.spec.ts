import { expect } from './harness';
import { test, TOKEN } from './hub';

test.beforeEach(async ({ setSafety }) => setSafety({ mode: 'auto' }));

test('the bridge lists and runs workflows', async ({ baseUrl, context, debugPage, hub }) => {
  const workflow = {
    id: 'w-bridge',
    name: 'Fill the email',
    variables: [{ name: 'email', label: 'Email' }],
    steps: [
      { tool: 'navigate', input: { url: `${baseUrl}/login.html` }, note: 'Go to login' },
      {
        tool: 'form_input',
        input: { value: '{{email}}' },
        target: { role: 'textbox', name: 'Email', selector: '#email' },
        note: 'Set "Email"',
      },
      {
        tool: 'click',
        input: {},
        target: { role: 'button', name: 'Sign in', selector: '#signin' },
        note: 'Click "Sign in"',
      },
    ],
    createdFrom: 'recording',
    updatedAt: 1,
  };
  await debugPage.evaluate(
    ([port, token, wf]) =>
      chrome.storage.local.set({
        'bridge.token': token,
        'bridge.port': port,
        'workflow:w-bridge': wf,
        'workflow:index': [{ id: wf.id, name: wf.name, updatedAt: 1, steps: 3 }],
      }),
    [hub.port, TOKEN, workflow] as const,
  );
  await expect.poll(async () => (await hub.status()).extensionConnected).toBe(true);

  const tools = await (
    await fetch(`http://127.0.0.1:${hub.port}/v1/tools`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
  ).json();
  expect(JSON.stringify(tools)).toContain('workflow_run');

  const list = await hub.callTool('workflows_list');
  expect(list.ok).toBe(true);
  expect(list.content[0]).toMatchObject({
    text: 'w-bridge · Fill the email · 3 steps · variables: email',
  });

  // By name, with a variable; the result is the run log.
  const run = await hub.callTool('workflow_run', {
    name: 'fill the EMAIL',
    variables: { email: 'bridge@example.com' },
  });
  expect(run.ok).toBe(true);
  const summary = (run.content[0] as { text: string }).text;
  expect(summary).toContain('Workflow "Fill the email": ok');
  expect(summary).toContain('3. Click "Sign in": ok');
  const replay = context.pages().find((page) => page.url().endsWith('/login.html'))!;
  await expect(replay.locator('#result')).toContainText('"email":"bridge@example.com"');
  // The element hint stays inside the extension.
  expect(JSON.stringify(run)).not.toContain('"target"');

  const missing = await hub.callTool('workflow_run', { id: 'w-bridge' });
  expect(missing.ok).toBe(false);
  expect(missing.content[0]).toMatchObject({ text: 'Missing value for {{email}}.' });

  const unknown = await hub.callTool('workflow_run', { name: 'Nope' });
  expect(unknown.ok).toBe(false);
  expect(unknown.content[0]).toMatchObject({ text: 'No workflow named "Nope".' });

  const invalid = await hub.callTool('workflow_run', {});
  expect(invalid.ok).toBe(false);
});
