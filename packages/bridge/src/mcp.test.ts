import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toolNames } from '@autochrome/shared';
import type { Hub } from './hub';
import {
  TEST_TOKEN,
  connectFakeExtension,
  echoResult,
  startTestHub,
  type FakeExtension,
} from './testUtils';

const packageDir = path.resolve(import.meta.dirname, '..');
const cli = path.join(packageDir, 'dist/cli.js');

let hub: Hub;
let extension: FakeExtension;
let client: Client;
let home: string;

beforeAll(async () => {
  // `pnpm test` runs before `pnpm build`, so build the CLI under test here.
  execFileSync('pnpm', ['exec', 'tsup'], { cwd: packageDir, stdio: 'pipe' });

  hub = await startTestHub();
  extension = await connectFakeExtension(hub.port, (call) =>
    call.name === 'navigate'
      ? { id: call.id, ok: false, content: [{ type: 'text', text: 'boom' }] }
      : echoResult(call),
  );

  home = await mkdtemp(path.join(tmpdir(), 'autochrome-mcp-'));
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [cli, 'mcp', '--port', String(hub.port)],
      env: { PATH: process.env.PATH ?? '', HOME: home, AUTOCHROME_TOKEN: TEST_TOKEN },
    }),
  );
}, 60_000);

afterAll(async () => {
  await client?.close();
  extension?.close();
  await hub?.close();
  await rm(home, { recursive: true, force: true });
});

describe('MCP server', () => {
  it('lists every tool with a JSON Schema', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(toolNames);
    expect(tools.every((t) => t.inputSchema.type === 'object')).toBe(true);
  });

  it('lists the multi-tab and debug tools with their options', async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of ['console_logs', 'network_requests', 'network_response', 'js_eval']) {
      expect(byName.get(name)?.description, name).toBeTruthy();
    }
    expect(Object.keys(byName.get('tab_open')!.inputSchema.properties!)).toContain('background');
    expect(Object.keys(byName.get('tabs_list')!.inputSchema.properties!)).toContain('agentOnly');
    expect(byName.get('js_eval')!.description).toContain('always asked to approve');
  });

  it('forwards a call through the hub to the extension', async () => {
    const result = await client.callTool({ name: 'find', arguments: { query: 'login' } });
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: 'text', text: 'find:{"query":"login"}' }]);
  });

  it('maps ok:false to isError', async () => {
    const result = await client.callTool({ name: 'navigate', arguments: { url: 'x' } });
    expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'boom' }] });
  });

  it('reports unknown tools as errors', async () => {
    const result = await client.callTool({ name: 'nope', arguments: {} });
    expect(result.isError).toBe(true);
  });
});
