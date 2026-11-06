import { expect, refOf, test } from './harness';
import type { RecordedRequest } from './mockAnthropic';

test.beforeEach(async ({ setSafety }) => setSafety({ mode: 'auto' }));

/** All text in the last message of a request, tool results included. */
function lastText(request: RecordedRequest): string {
  const last = request.body.messages.at(-1)!;
  return last.content
    .flatMap((block) => [
      block.text,
      ...((block.content as { text?: string }[]) ?? []).map((c) => c.text),
    ])
    .filter(Boolean)
    .join('\n');
}

test('ask_user shows the question in the panel and returns the answer', async ({
  mockAnthropic: mock,
  openSidePanel,
}) => {
  mock.play(
    [
      {
        type: 'tool_use',
        id: 'toolu_ask',
        name: 'ask_user',
        input: { question: 'Which color do you want?', choices: ['Red', 'Blue'] },
      },
    ],
    (request) => [{ type: 'text', text: `Got it: ${lastText(request)}` }],
  );
  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('Pick a color for me');
  await panel.getByLabel('Message').press('Enter');

  const card = panel.getByTestId('question-card');
  await expect(card).toContainText('Which color do you want?');
  await card.getByRole('button', { name: 'Blue' }).click();
  await expect(card).toBeHidden();
  await expect(panel.getByText('Got it: The user answered: Blue')).toBeVisible();
  await expect(panel.getByTestId('tool-card').first()).toContainText('Asked you: “Which color');
});

test('Take over pauses the agent until the user hands back, with a note', async ({
  mockAnthropic: mock,
  openSidePanel,
}) => {
  mock.play(
    [{ type: 'tool_use', id: 'toolu_wait', name: 'wait', input: { ms: 1500 } }],
    (request) => [
      { type: 'text', text: lastText(request).includes('logged in') ? 'Resumed.' : '?' },
    ],
  );
  const panel = await openSidePanel();
  await panel.getByLabel('Message').fill('Do the thing');
  await panel.getByLabel('Message').press('Enter');
  await panel.getByRole('button', { name: 'Take over' }).click();

  const bar = panel.getByTestId('takeover-bar');
  await expect(bar).toBeVisible();
  // The wait has finished by now, but the agent waits for the hand-back.
  await panel.waitForTimeout(2000);
  expect(mock.requests).toHaveLength(1);

  await bar.getByLabel('Note for the AI (optional)').fill('I logged in');
  await bar.getByRole('button', { name: 'Hand back' }).click();
  await expect(panel.getByText('Resumed.')).toBeVisible();
  expect(lastText(mock.requests[1]!)).toContain('The user took over the browser');
});

test('attached files are listed for the model and upload_file puts them in the page', async ({
  baseUrl,
  context,
  mockAnthropic: mock,
  openSidePanel,
}) => {
  let attachmentId = '';
  mock.play(
    (request) => {
      attachmentId = /id (a[\w-]+),/.exec(lastText(request))![1]!;
      return [
        {
          type: 'tool_use',
          id: 'toolu_open',
          name: 'tab_open',
          input: { url: `${baseUrl}/interact.html` },
        },
        { type: 'tool_use', id: 'toolu_read', name: 'read_page', input: {} },
      ];
    },
    (request) => [
      {
        type: 'tool_use',
        id: 'toolu_up',
        name: 'upload_file',
        input: { ref: refOf(lastText(request), /"Resume"/), attachmentIds: [attachmentId] },
      },
    ],
    [{ type: 'text', text: 'Uploaded.' }],
  );
  const panel = await openSidePanel();
  await panel.getByLabel('Files to attach').setInputFiles({
    name: 'cv.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Ada Lovelace CV'),
  });
  await expect(panel.getByRole('list', { name: 'Attached files' })).toContainText('cv.txt');
  await panel.getByLabel('Message').fill('Upload my CV');
  await panel.getByLabel('Message').press('Enter');
  await expect(panel.getByText('Uploaded.')).toBeVisible();

  const page = context.pages().find((p) => p.url().endsWith('/interact.html'))!;
  await expect(page.locator('#files')).toHaveText('visible: cv.txt=Ada Lovelace CV');
  expect(lastText(mock.requests[0]!)).toContain('Attached files, for upload_file: cv.txt');
});
