import { randomUUID } from 'node:crypto';
import type { ToolCall, ToolResult, ToExtensionMessage } from '@autochrome/shared';

export const NOT_CONNECTED_MESSAGE =
  'Chrome extension not connected. Open Chrome with autochrome installed and paste the bridge token in its side panel (Settings → Bridge).';

/** How long a call waits for the extension to (re)connect before failing. */
export const DEFAULT_EXTENSION_GRACE_MS = 30_000;

type Pending = {
  originalId: string;
  resolve: (result: ToolResult) => void;
  timer: NodeJS.Timeout;
};

function failure(id: string, message: string): ToolResult {
  return { id, ok: false, content: [{ type: 'text', text: message }] };
}

/**
 * Routes calls to the single extension connection. It gives every call its own id so that
 * ids chosen by different clients cannot collide, and restores the caller's id on the result.
 */
export class Dispatcher {
  private send: ((message: ToExtensionMessage) => void) | undefined;
  private readonly pending = new Map<string, Pending>();
  private attachWaiters: Array<() => void> = [];

  constructor(
    private readonly timeoutMs: number,
    private readonly extensionGraceMs = DEFAULT_EXTENSION_GRACE_MS,
  ) {}

  get extensionConnected(): boolean {
    return this.send !== undefined;
  }

  attach(send: (message: ToExtensionMessage) => void): void {
    this.send = send;
    for (const wake of this.attachWaiters) wake();
    this.attachWaiters = [];
  }

  detach(): void {
    this.send = undefined;
    for (const [id, entry] of this.pending) {
      this.settle(id, entry, failure(entry.originalId, 'Chrome extension disconnected.'));
    }
  }

  async dispatch(call: ToolCall): Promise<ToolResult> {
    // The extension may be between reconnect attempts (e.g. the hub just started), so wait a bit.
    if (!this.send) await this.waitForAttach();
    const send = this.send;
    if (!send) return failure(call.id, NOT_CONNECTED_MESSAGE);

    const hubId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const entry = this.pending.get(hubId);
        if (entry) {
          const seconds = Math.round(this.timeoutMs / 1000);
          this.settle(hubId, entry, failure(call.id, `Tool call timed out after ${seconds}s.`));
        }
      }, this.timeoutMs);
      this.pending.set(hubId, { originalId: call.id, resolve, timer });
      send({ type: 'call', call: { ...call, id: hubId } });
    });
  }

  private waitForAttach(): Promise<void> {
    if (this.extensionGraceMs <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.attachWaiters = this.attachWaiters.filter((waiter) => waiter !== wake);
        resolve();
      }, this.extensionGraceMs);
      this.attachWaiters.push(wake);
    });
  }

  /** Called with a result from the extension; unknown ids (e.g. after a timeout) are ignored. */
  handleResult(result: ToolResult): void {
    const entry = this.pending.get(result.id);
    if (entry) this.settle(result.id, entry, { ...result, id: entry.originalId });
  }

  private settle(hubId: string, entry: Pending, result: ToolResult): void {
    clearTimeout(entry.timer);
    this.pending.delete(hubId);
    entry.resolve(result);
  }
}
