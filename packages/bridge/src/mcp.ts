import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { describeTools, isToolName } from '@autochrome/shared';
import type { Link } from './link';
import pkg from '../package.json' with { type: 'json' };

export function createMcpServer(link: Link): Server {
  const server = new Server(
    { name: 'autochrome', version: pkg.version },
    { capabilities: { tools: {} } },
  );
  const tools = describeTools().map((tool) => ({
    ...tool,
    inputSchema: { type: 'object' as const, ...tool.inputSchema },
  }));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: input } = request.params;
    if (!isToolName(name)) {
      return { isError: true, content: [{ type: 'text', text: `Unknown tool "${name}".` }] };
    }
    const result = await link.call(name, input ?? {});
    return { isError: !result.ok, content: result.content };
  });

  return server;
}

export async function runMcpServer(link: Link): Promise<void> {
  await createMcpServer(link).connect(new StdioServerTransport());
}
