import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { CLOSE_BAD_TOKEN, PROTOCOL_VERSION, toolNames, type ToolResult } from '@autochrome/shared';
import type { Hub } from './hub';
import { NOT_CONNECTED_MESSAGE } from './dispatcher';
import {
  TEST_TOKEN,
  connectFakeExtension,
  echoResult,
  startTestHub,
  waitFor,
  type FakeExtension,
} from './testUtils';

let hub: Hub;
const extensions: FakeExtension[] = [];

afterEach(async () => {
  for (const extension of extensions.splice(0)) extension.close();
  await hub.close();
});

const url = (path: string) => `http://127.0.0.1:${hub.port}${path}`;
const auth = { authorization: `Bearer ${TEST_TOKEN}` };

async function postTool(name: string, input: object = {}): Promise<ToolResult> {
  const res = await fetch(url(`/v1/tools/${name}`), {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(input),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as ToolResult;
}

/** Opens /client and resolves with the close code and reason once the hub closes it. */
function clientClose(hello: object, headers: Record<string, string> = {}) {
  return new Promise<{ code: number; reason: string }>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${hub.port}/client`, { headers });
    socket.on('open', () => socket.send(JSON.stringify(hello)));
    socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    socket.on('error', reject);
  });
}

describe('HTTP API', () => {
  it('reports status and lists tools with JSON Schema', async () => {
    hub = await startTestHub();
    const status = await fetch(url('/v1/status'), { headers: auth });
    expect(await status.json()).toEqual({
      extensionConnected: false,
      protocolVersion: PROTOCOL_VERSION,
    });

    const tools = (await (await fetch(url('/v1/tools'), { headers: auth })).json()) as {
      name: string;
      inputSchema: { properties?: Record<string, unknown>; required?: string[] };
    }[];
    expect(tools.map((t) => t.name)).toEqual(toolNames);
    const navigate = tools.find((t) => t.name === 'navigate');
    expect(navigate?.inputSchema.required).toEqual(['url']);
    expect(tools.find((t) => t.name === 'read_page')?.inputSchema.required).toBeUndefined();
  });

  it('round-trips a call through the extension and updates status', async () => {
    hub = await startTestHub();
    const extension = await connectFakeExtension(hub.port, echoResult);
    extensions.push(extension);

    const status = await fetch(url('/v1/status'), { headers: auth });
    expect(((await status.json()) as { extensionConnected: boolean }).extensionConnected).toBe(
      true,
    );

    const result = await postTool('navigate', { url: 'https://example.com' });
    expect(result.ok).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: 'navigate:{"url":"https://example.com"}' },
    ]);
    expect(extension.calls).toHaveLength(1);
  });

  it('answers ok:false straight away when the extension is not connected', async () => {
    hub = await startTestHub();
    const result = await postTool('tabs_list');
    expect(result).toMatchObject({
      ok: false,
      content: [{ type: 'text', text: NOT_CONNECTED_MESSAGE }],
    });
  });

  it('holds a call until the extension connects within the grace period', async () => {
    hub = await startTestHub({ extensionGraceMs: 5_000 });
    const pending = postTool('tabs_list');
    extensions.push(await connectFakeExtension(hub.port, echoResult));
    expect(await pending).toMatchObject({ ok: true });
  });

  it('fails pending calls when the extension disconnects', async () => {
    hub = await startTestHub();
    const extension = await connectFakeExtension(hub.port, () => undefined);
    const pending = postTool('tabs_list');
    await waitFor(() => extension.calls.length === 1);
    extension.close();
    expect(await pending).toMatchObject({ ok: false });
  });

  it('times out a call the extension never answers', async () => {
    hub = await startTestHub({ callTimeoutMs: 100 });
    extensions.push(await connectFakeExtension(hub.port, () => undefined));
    const result = await postTool('tabs_list');
    expect(result.ok).toBe(false);
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('timed out') });
  });

  it('rejects missing and wrong tokens', async () => {
    hub = await startTestHub();
    expect((await fetch(url('/v1/status'))).status).toBe(401);
    expect(
      (await fetch(url('/v1/status'), { headers: { authorization: 'Bearer nope' } })).status,
    ).toBe(401);
  });

  it('rejects web page origins even with the right token', async () => {
    hub = await startTestHub();
    const res = await fetch(url('/v1/status'), {
      headers: { ...auth, origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown tools and 400 for bad JSON', async () => {
    hub = await startTestHub();
    const unknown = await fetch(url('/v1/tools/nope'), { method: 'POST', headers: auth });
    expect(unknown.status).toBe(404);
    const bad = await fetch(url('/v1/tools/tabs_list'), {
      method: 'POST',
      headers: auth,
      body: '{oops',
    });
    expect(bad.status).toBe(400);
  });
});

describe('WebSocket', () => {
  const hello = (token: string) => ({
    type: 'hello',
    role: 'client',
    token,
    protocolVersion: PROTOCOL_VERSION,
  });

  it('closes a client with a bad token and a clear reason', async () => {
    hub = await startTestHub();
    expect(await clientClose(hello('wrong'))).toEqual({
      code: CLOSE_BAD_TOKEN,
      reason: 'Invalid token.',
    });
  });

  it('rejects web origins on /client and non-extension origins on /extension', async () => {
    hub = await startTestHub();
    await expect(
      clientClose(hello(TEST_TOKEN), { origin: 'https://evil.example' }),
    ).rejects.toThrow(/403/);
    const noOrigin = new WebSocket(`ws://127.0.0.1:${hub.port}/extension`);
    await expect(
      new Promise((resolve, reject) => {
        noOrigin.on('open', resolve);
        noOrigin.on('error', reject);
      }),
    ).rejects.toThrow(/403/);
    const webOrigin = new WebSocket(`ws://127.0.0.1:${hub.port}/extension`, {
      headers: { origin: 'http://localhost:3000' },
    });
    await expect(
      new Promise((resolve, reject) => {
        webOrigin.on('open', resolve);
        webOrigin.on('error', reject);
      }),
    ).rejects.toThrow(/403/);
  });

  it('gives concurrent calls from two clients their own results', async () => {
    hub = await startTestHub();
    // Answer in reverse order so results cannot match by arrival order.
    const held: Array<() => void> = [];
    extensions.push(
      await connectFakeExtension(
        hub.port,
        (call) =>
          new Promise((resolve) => {
            held.push(() => resolve(echoResult(call)));
            if (held.length === 2) held.reverse().forEach((release) => release());
          }),
      ),
    );

    const open = (label: string) =>
      new Promise<{ socket: WebSocket; reply: Promise<ToolResult> }>((resolve) => {
        const socket = new WebSocket(`ws://127.0.0.1:${hub.port}/client`);
        socket.on('open', () => socket.send(JSON.stringify(hello(TEST_TOKEN))));
        let sent = false;
        const reply = new Promise<ToolResult>((done) => {
          socket.on('message', (data) => {
            const message = JSON.parse(data.toString()) as { type: string; result?: ToolResult };
            if (message.type === 'welcome' && !sent) {
              sent = true;
              // Both clients deliberately use the same call id.
              socket.send(
                JSON.stringify({
                  type: 'call',
                  call: { id: 'same-id', name: 'find', input: { query: label } },
                }),
              );
              resolve({ socket, reply });
            } else if (message.type === 'result' && message.result) {
              done(message.result);
            }
          });
        });
      });

    const [a, b] = await Promise.all([open('a'), open('b')]);
    const [resultA, resultB] = await Promise.all([a.reply, b.reply]);
    expect(resultA).toMatchObject({ id: 'same-id', content: [{ text: 'find:{"query":"a"}' }] });
    expect(resultB).toMatchObject({ id: 'same-id', content: [{ text: 'find:{"query":"b"}' }] });
    a.socket.close();
    b.socket.close();
  });

  it('answers a WebSocket call to an unknown tool instead of disconnecting', async () => {
    hub = await startTestHub();
    const socket = new WebSocket(`ws://127.0.0.1:${hub.port}/client`);
    socket.on('open', () => socket.send(JSON.stringify(hello(TEST_TOKEN))));
    const result = await new Promise<ToolResult>((resolve) => {
      socket.on('message', (data) => {
        const message = JSON.parse(data.toString()) as { type: string; result?: ToolResult };
        if (message.type === 'welcome') {
          socket.send(
            JSON.stringify({ type: 'call', call: { id: 'c1', name: 'nope', input: {} } }),
          );
        } else if (message.type === 'result' && message.result) {
          resolve(message.result);
        }
      });
    });
    expect(result).toMatchObject({
      id: 'c1',
      ok: false,
      content: [{ text: 'Unknown tool "nope".' }],
    });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it('replaces an older extension connection with a newer one', async () => {
    hub = await startTestHub();
    const first = await connectFakeExtension(hub.port, echoResult);
    const closed = new Promise((resolve) => first.socket.on('close', resolve));
    extensions.push(await connectFakeExtension(hub.port, echoResult));
    await closed;
    expect((await postTool('tabs_list')).ok).toBe(true);
  });
});
