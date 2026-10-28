import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ToolResult } from '@autochrome/shared';
import { test as base } from './harness';

const cli = path.resolve(import.meta.dirname, '../../bridge/dist/cli.js');
export const TOKEN = 'e2e-bridge-token';

export type Hub = {
  port: number;
  status: () => Promise<{ extensionConnected: boolean }>;
  callTool: (name: string, input?: object) => Promise<ToolResult>;
};

/** Runs the built bridge CLI as a standalone hub on a free port. */
export const test = base.extend<{ hub: Hub }>({
  hub: async ({}, use) => {
    const child = spawn(process.execPath, [cli, 'serve', '--port', '0'], {
      env: { PATH: process.env.PATH ?? '', AUTOCHROME_TOKEN: TOKEN },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const port = await new Promise<number>((resolve, reject) => {
      let output = '';
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = /listening on 127\.0\.0\.1:(\d+)/.exec(output);
        if (match) resolve(Number(match[1]));
      });
      child.once('exit', () => reject(new Error(`Hub exited early:\n${output}`)));
    });

    const request = async (path: string, init?: RequestInit) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${TOKEN}` },
      });
    await use({
      port,
      status: async () => (await request('/v1/status')).json(),
      callTool: async (name, input = {}) =>
        (
          await request(`/v1/tools/${name}`, { method: 'POST', body: JSON.stringify(input) })
        ).json(),
    });
    child.kill();
  },
});
