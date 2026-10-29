import { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  decodeMessage,
  toExtensionMessage,
  type ToolCall,
  type ToolResult,
} from '@autochrome/shared';
import { startHub, type Hub, type HubOptions } from './hub';

export const TEST_TOKEN = 'test-token';

export function startTestHub(options: Partial<HubOptions> = {}): Promise<Hub> {
  return startHub({ port: 0, token: TEST_TOKEN, extensionGraceMs: 0, ...options });
}

export type FakeExtension = {
  socket: WebSocket;
  calls: ToolCall[];
  close: () => void;
};

/** Connects like the real extension would, answering each call with `respond`. */
export async function connectFakeExtension(
  port: number,
  respond: (call: ToolCall) => ToolResult | Promise<ToolResult> | undefined,
  token = TEST_TOKEN,
): Promise<FakeExtension> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/extension`, {
    headers: { origin: 'chrome-extension://fake' },
  });
  const calls: ToolCall[] = [];
  socket.on('message', async (data) => {
    const message = decodeMessage(toExtensionMessage, data.toString());
    if (message?.type !== 'call') return;
    calls.push(message.call);
    const result = await respond(message.call);
    if (result) socket.send(JSON.stringify({ type: 'result', result }));
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', () => {
      socket.send(
        JSON.stringify({
          type: 'hello',
          role: 'extension',
          token,
          protocolVersion: PROTOCOL_VERSION,
        }),
      );
    });
    socket.once('message', () => resolve());
  });
  return { socket, calls, close: () => socket.close() };
}

/** A result that echoes the tool name and input as text. */
export function echoResult(call: ToolCall): ToolResult {
  return {
    id: call.id,
    ok: true,
    content: [{ type: 'text', text: `${call.name}:${JSON.stringify(call.input)}` }],
  };
}

export async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
