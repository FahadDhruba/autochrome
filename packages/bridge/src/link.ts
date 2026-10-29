import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ToolResult, ToolName } from '@autochrome/shared';
import { startHub, type Hub } from './hub';
import { FatalHubError, HubClient } from './hubClient';
import { log } from './log';

export type Link = {
  call: (name: ToolName, input: unknown) => Promise<ToolResult>;
  close: () => Promise<void>;
};

export type LinkOptions = {
  port: number;
  token: string;
  /** How long a call waits for a hub connection before failing. */
  connectTimeoutMs?: number;
  /** Pause before retrying after a lost race for the port. */
  retryMs?: number;
  /** Passed to the hub if this process becomes it. */
  extensionGraceMs?: number;
};

function failure(id: string, message: string): ToolResult {
  return { id, ok: false, content: [{ type: 'text', text: message }] };
}

function isAddressInUse(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
}

/**
 * Keeps this process connected to the hub on `port`. If nobody is listening it starts the hub
 * itself; binding the port decides which of several waiting processes wins after a hub exits.
 */
export function createLink(options: LinkOptions): Link {
  const { port, token, connectTimeoutMs = 15_000, retryMs = 250, extensionGraceMs } = options;
  let current: HubClient | undefined;
  let fatal: Error | undefined;
  let hub: Hub | undefined;
  let closing = false;
  let waiters: Array<() => void> = [];

  const wake = () => {
    for (const waiter of waiters) waiter();
    waiters = [];
  };

  const run = async () => {
    while (!closing) {
      try {
        const client = await HubClient.connect(port, token);
        current = client;
        wake();
        await client.closed;
        current = undefined;
        if (!closing) log(`lost the hub on port ${port}; reconnecting`);
      } catch (error) {
        if (error instanceof FatalHubError) {
          fatal = error;
          wake();
          return;
        }
        try {
          hub = await startHub({ port, token, extensionGraceMs });
          log(`no hub found; this process is now the hub on 127.0.0.1:${port}`);
        } catch (listenError) {
          if (!isAddressInUse(listenError)) log(`cannot start the hub: ${String(listenError)}`);
          await sleep(retryMs + Math.random() * retryMs);
        }
      }
    }
  };
  const loop = run();

  const waitForClient = async (): Promise<HubClient | undefined> => {
    if (current || fatal) return current;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, connectTimeoutMs);
      waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    return current;
  };

  return {
    async call(name, input) {
      const id = randomUUID();
      const client = await waitForClient();
      if (!client) {
        return failure(id, fatal?.message ?? `Could not reach an autochrome hub on port ${port}.`);
      }
      return client.call({ id, name, input });
    },
    async close() {
      closing = true;
      current?.close();
      await hub?.close();
      wake();
      await loop;
    },
  };
}
