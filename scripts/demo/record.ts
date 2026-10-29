// Records docs/demo.gif: the built extension, a scripted (mock) model and a local demo page.
// Requires `pnpm build` first. Run with `pnpm demo [--frames <dir>]`.
// Frames are the demo page and the side panel composited side by side (Playwright cannot
// capture the real side panel, so it is opened as a normal tab, as in the e2e tests).
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';
import { MockAnthropic, type RecordedRequest } from '../../packages/extension/e2e/mockAnthropic.ts';

const { applyPalette, GIFEncoder, quantize } = gifenc;
const root = path.resolve(import.meta.dirname, '../..');
const extensionPath = path.join(root, 'packages/extension/.output/chrome-mv3');
const outFile = path.join(root, 'docs/demo.gif');
const PAGE_W = 600;
const PANEL_W = 400;
const HEIGHT = 600;
const MAX_SECONDS = 20;
const MAX_BYTES = 3 * 1024 * 1024;
const framesDir = process.argv.includes('--frames')
  ? process.argv[process.argv.indexOf('--frames') + 1]
  : undefined;

const TASK = 'Sign me up for the meetup as Ada Lovelace, ada@example.com, in-person ticket.';

/** The ref on the first tool-result line that matches the pattern. */
function refIn(request: RecordedRequest, pattern: RegExp): string {
  // Refs stay valid until the next read_page, so look through every tool result so far.
  const text = request.body.messages
    .flatMap((message) => message.content)
    .flatMap((block) => (block.content as { text?: string }[] | undefined) ?? [])
    .map((item) => item.text ?? '')
    .join('\n');
  const lines = text.split('\n');
  const line = lines.find((l) => pattern.test(l));
  const ref = line && /\[(e\d+)\]/.exec(line)?.[1];
  if (!ref) throw new Error(`No ref for ${pattern} in ${text}`);
  return ref;
}

const toolUse = (id: string, name: string, input: object) =>
  ({ type: 'tool_use', id, name, input }) as const;

async function main() {
  await stat(extensionPath).catch(() => {
    throw new Error('Extension not built. Run `pnpm build` first.');
  });

  const server = createServer(async (_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(await readFile(path.join(import.meta.dirname, 'page.html')));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const pageUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  const mock = new MockAnthropic();
  await mock.start();
  mock.delayMs = 900;
  mock.play(
    [
      { type: 'text', text: "I'll read the signup form to see what it asks for." },
      toolUse('t1', 'read_page', {}),
    ],
    (r) => [
      toolUse('t2', 'form_input', { ref: refIn(r, /textbox "Name"/), value: 'Ada Lovelace' }),
    ],
    (r) => [
      toolUse('t3', 'form_input', { ref: refIn(r, /textbox "Email"/), value: 'ada@example.com' }),
    ],
    (r) => [
      toolUse('t4', 'form_input', { ref: refIn(r, /combobox "Ticket"/), value: 'In person' }),
    ],
    (r) => [
      { type: 'text', text: 'All fields are filled. Submitting the form now.' },
      toolUse('t5', 'click', { ref: refIn(r, /button "Submit"/) }),
    ],
    [{ type: 'text', text: 'Done. Your seat is reserved: confirmation says "See you Thursday!".' }],
  );

  const userDataDir = await mkdtemp(path.join(tmpdir(), 'autochrome-demo-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const debug = await context.newPage();
    await debug.goto(`chrome-extension://${extensionId}/debug.html`);
    await debug.evaluate(
      ([baseUrl, site]) =>
        chrome.storage.local.set({
          'anthropic.apiKey': 'demo-key',
          'anthropic.baseUrl': baseUrl,
          'safety.mode': 'per-site',
          'safety.sites': [site],
        }),
      [mock.baseUrl, new URL(pageUrl).origin] as const,
    );

    const [demo] = await Promise.all([
      context.waitForEvent('page'),
      debug.evaluate(
        (url) =>
          chrome.runtime.sendMessage({
            type: 'autochrome:execute',
            call: { id: 'open', name: 'tab_open', input: { url } },
          }),
        pageUrl,
      ),
    ]);
    await demo.setViewportSize({ width: PAGE_W, height: HEIGHT });
    await demo.waitForLoadState('load');

    const panel = await context.newPage();
    await panel.setViewportSize({ width: PANEL_W, height: HEIGHT });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    /** Puts the page and the side panel side by side in one RGBA frame. */
    const compose = (page: Buffer, side: Buffer): Buffer => {
      const left = PNG.sync.read(page);
      const right = PNG.sync.read(side);
      const out = Buffer.alloc((PAGE_W + PANEL_W) * HEIGHT * 4, 255);
      for (let y = 0; y < HEIGHT; y++) {
        left.data.copy(out, y * (PAGE_W + PANEL_W) * 4, y * PAGE_W * 4, (y + 1) * PAGE_W * 4);
        right.data.copy(
          out,
          (y * (PAGE_W + PANEL_W) + PAGE_W) * 4,
          y * PANEL_W * 4,
          (y + 1) * PANEL_W * 4,
        );
        out.set([195, 202, 219, 255], (y * (PAGE_W + PANEL_W) + PAGE_W) * 4); // divider
      }
      return out;
    };

    const frames: { rgba: Buffer; at: number }[] = [];
    let recording = true;
    const started = Date.now();
    const capture = (async () => {
      while (recording) {
        const [a, b] = await Promise.all([
          demo.screenshot({ type: 'png' }),
          panel.screenshot({ type: 'png' }),
        ]);
        const rgba = compose(a, b);
        frames.push({ rgba, at: Date.now() - started });
      }
    })();
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    await pause(1200);
    const box = panel.getByLabel('Message');
    await box.click();
    await box.pressSequentially(TASK, { delay: 22 });
    await pause(500);
    await box.press('Enter');

    const card = panel.getByTestId('approval-card');
    await card.waitFor({ state: 'visible', timeout: 30_000 });
    await pause(2200);
    await card.getByRole('button', { name: 'Allow once' }).click();

    await panel.getByText('Your seat is reserved').waitFor({ timeout: 30_000 });
    await pause(2500);
    recording = false;
    await capture;
    await composeAndWrite(frames);
    await demo.close().catch(() => undefined);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
    await mock.stop();
    server.close();
  }
}

async function composeAndWrite(frames: { rgba: Buffer; at: number }[]) {
  // Merge identical neighbours so the GIF only stores what changed.
  const unique: { rgba: Buffer; at: number; delay: number }[] = [];
  for (const [i, frame] of frames.entries()) {
    const next = frames[i + 1]?.at ?? frame.at + 100;
    const delay = next - frame.at;
    const previous = unique.at(-1);
    if (previous && previous.rgba.equals(frame.rgba)) previous.delay += delay;
    else unique.push({ ...frame, delay });
  }
  const seconds = frames.at(-1)!.at / 1000;
  if (seconds > MAX_SECONDS)
    throw new Error(`Recording is ${seconds.toFixed(1)}s, over ${MAX_SECONDS}s.`);

  const width = PAGE_W + PANEL_W;
  const gif = GIFEncoder();
  for (const frame of unique) {
    const data = new Uint8Array(frame.rgba);
    const palette = quantize(data, 128);
    // GIF delays are in 1/100 s.
    gif.writeFrame(applyPalette(data, palette), width, HEIGHT, {
      palette,
      delay: Math.max(20, Math.round(frame.delay / 10) * 10),
    });
  }
  gif.finish();
  const bytes = gif.bytes();
  if (bytes.length > MAX_BYTES)
    throw new Error(`GIF is ${bytes.length} bytes, over the 3 MB limit.`);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, bytes);
  console.log(
    `docs/demo.gif: ${(bytes.length / 1024 / 1024).toFixed(2)} MB, ${seconds.toFixed(1)} s, ` +
      `${unique.length} frames (${frames.length} captured)`,
  );

  if (framesDir) {
    await mkdir(framesDir, { recursive: true });
    const picks = [0.2, 0.5, 0.95].map((f) => {
      const t = seconds * 1000 * f;
      return unique.findLast((frame) => frame.at <= t) ?? unique[0]!;
    });
    for (const [i, frame] of picks.entries()) {
      const png = new PNG({ width, height: HEIGHT });
      frame.rgba.copy(png.data);
      await writeFile(path.join(framesDir, `m7-frame-${i + 1}.png`), PNG.sync.write(png));
    }
  }
}

await main();
