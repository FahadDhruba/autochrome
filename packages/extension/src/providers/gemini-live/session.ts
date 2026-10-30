import type { ProviderEvent } from '../types';
import { describeClose, mapServerMessage, type LiveState } from './messages';
import type { LiveSocket } from './socket';

export const IDLE_TIMEOUT_MS = 60_000;

type Incoming =
  | { type: 'message'; data: unknown }
  | { type: 'close'; code: number; reason: string }
  | { type: 'abort' };

function decode(data: unknown): unknown {
  const text = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

type Options = {
  socket: LiveSocket;
  setup: object;
  turns: object[];
  signal: AbortSignal;
  /** Shown in errors; never the URL, which carries the key. */
  baseUrl: string;
};

/** Runs one Live session: setup, one user turn, and events until the step ends. */
export async function* runSession(options: Options): AsyncGenerator<ProviderEvent> {
  const { socket, signal } = options;
  const incoming: Incoming[] = [];
  let wake: (() => void) | undefined;
  const push = (item: Incoming) => {
    incoming.push(item);
    wake?.();
  };
  const next = async (): Promise<Incoming | undefined> => {
    if (incoming.length === 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, IDLE_TIMEOUT_MS);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wake = undefined;
    }
    return incoming.shift();
  };

  socket.binaryType = 'arraybuffer';
  socket.onopen = () => socket.send(JSON.stringify({ setup: options.setup }));
  socket.onmessage = (event) => push({ type: 'message', data: event.data });
  socket.onclose = (event) => push({ type: 'close', code: event.code, reason: event.reason });
  const onAbort = () => push({ type: 'abort' });
  signal.addEventListener('abort', onAbort);
  if (signal.aborted) onAbort();

  const state: LiveState = { calls: 0 };
  try {
    while (true) {
      const item = await next();
      if (!item) {
        yield { type: 'error', message: 'Gemini Live did not answer in time. Try again.' };
        return;
      }
      if (item.type === 'abort') {
        yield { type: 'error', message: 'Stopped.' };
        return;
      }
      if (item.type === 'close') {
        const clean = item.code === 1000 || item.code === 1005;
        yield {
          type: 'error',
          message: clean
            ? 'Gemini Live ended the session before answering.'
            : describeClose(item.code, item.reason, options.baseUrl),
        };
        return;
      }
      const message = decode(item.data);
      if (!message || typeof message !== 'object') continue;
      const mapped = mapServerMessage(message, state);
      if (mapped.setupComplete) {
        socket.send(
          JSON.stringify({ clientContent: { turns: options.turns, turnComplete: true } }),
        );
      }
      yield* mapped.events;
      if (mapped.finished) return;
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    try {
      socket.close(1000);
    } catch {
      // Already closed.
    }
  }
}
