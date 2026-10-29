import { z } from 'zod';
import { PROTOCOL_VERSION } from './version';
import { toolDefinitions, toolNames, type ToolName } from './tools';

export const DEFAULT_BRIDGE_PORT = 47800;

/** WebSocket close codes the hub uses; the reason string carries the human-readable detail. */
export const CLOSE_BAD_MESSAGE = 4400;
export const CLOSE_BAD_TOKEN = 4401;
export const CLOSE_REPLACED = 4409;

const toolContent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
]);

const toolCall = z.object({
  id: z.string(),
  name: z.custom<ToolName>((value) => typeof value === 'string' && isToolName(value)),
  input: z.unknown(),
});

const toolResult = z.object({ id: z.string(), ok: z.boolean(), content: z.array(toolContent) });

const toolInfo = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
});

const hello = z.object({
  type: z.literal('hello'),
  role: z.enum(['client', 'extension']),
  token: z.string(),
  protocolVersion: z.number(),
});
const call = z.object({ type: z.literal('call'), call: toolCall });
const result = z.object({ type: z.literal('result'), result: toolResult });
const ping = z.object({ type: z.literal('ping') });
const pong = z.object({ type: z.literal('pong') });

/** Client or extension to hub. */
export const toHubMessage = z.discriminatedUnion('type', [
  hello,
  call,
  result,
  ping,
  z.object({ type: z.literal('list_tools') }),
]);

/** Hub to a client. */
export const toClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), extensionConnected: z.boolean() }),
  result,
  z.object({ type: z.literal('tools'), tools: z.array(toolInfo) }),
  z.object({ type: z.literal('status'), extensionConnected: z.boolean() }),
]);

/** Hub to the extension. */
export const toExtensionMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), extensionConnected: z.boolean() }),
  call,
  pong,
]);

export type ToHubMessage = z.infer<typeof toHubMessage>;
export type ToClientMessage = z.infer<typeof toClientMessage>;
export type ToExtensionMessage = z.infer<typeof toExtensionMessage>;
export type ToolInfo = z.infer<typeof toolInfo>;

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(toolDefinitions, name);
}

/** The tool list with JSON Schema inputs, as served over HTTP and MCP. */
export function describeTools(): ToolInfo[] {
  return toolNames.map((name) => ({
    name,
    description: toolDefinitions[name].description,
    inputSchema: z.toJSONSchema(toolDefinitions[name].input, { io: 'input' }),
  }));
}

/** Parse a JSON wire message; undefined when it is not valid JSON or does not match. */
export function decodeMessage<T>(schema: z.ZodType<T>, raw: string): T | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function protocolVersionMismatch(version: number): string | undefined {
  return version === PROTOCOL_VERSION
    ? undefined
    : `Protocol version ${version} is not supported (expected ${PROTOCOL_VERSION}).`;
}
