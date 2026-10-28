#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { DEFAULT_BRIDGE_PORT } from '@autochrome/shared';
import { startHub } from './hub';
import { createLink } from './link';
import { log } from './log';
import { runMcpServer } from './mcp';
import { loadToken } from './token';
import { versionLine } from './version';

const HELP = `Usage: autochrome-bridge [command] [options]

Commands:
  mcp     Speak MCP over stdio and join (or start) the hub. Default.
  serve   Run a standalone hub for scripts (HTTP and WebSocket API).
  token   Print the pairing token for the extension.

Options:
  --port <n>    Hub port (default ${DEFAULT_BRIDGE_PORT}, or AUTOCHROME_PORT)
  --version     Print the version
  --help        Show this help`;

function parsePort(value: string | undefined): number {
  const port = value === undefined ? DEFAULT_BRIDGE_PORT : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port "${value}".`);
  }
  return port;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.help) return console.log(HELP);
  if (values.version) return console.log(versionLine());

  const command = positionals[0] ?? 'mcp';
  if (command === 'token') return console.log(await loadToken());

  const port = parsePort(values.port ?? process.env.AUTOCHROME_PORT);
  const token = await loadToken();

  if (command === 'serve') {
    const hub = await startHub({ port, token });
    log(`hub listening on 127.0.0.1:${hub.port}`);
    const stop = () => void hub.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } else if (command === 'mcp') {
    // Port 0 would give every reconnect attempt a fresh port, so nothing could ever connect.
    if (port === 0) throw new Error('mcp needs a fixed port.');
    const link = createLink({ port, token });
    const stop = () => void link.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    process.stdin.on('end', stop);
    await runMcpServer(link);
  } else {
    throw new Error(`Unknown command "${command}".\n\n${HELP}`);
  }
}

main().catch((error: unknown) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
