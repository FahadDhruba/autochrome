import { toolDefinitions, type ToolCall, type ToolResult } from '@autochrome/shared';
import { z } from 'zod';
import { toolHandlers } from './tools';
import type { ToolHandlers } from './tools/types';

function failure(id: string, message: string): ToolResult {
  return { id, ok: false, content: [{ type: 'text', text: message }] };
}

/** The single entry point for running a tool: validates input and turns every error into a result. */
export async function executeTool(
  call: ToolCall,
  handlers: ToolHandlers = toolHandlers,
): Promise<ToolResult> {
  try {
    if (!Object.hasOwn(toolDefinitions, call.name)) {
      return failure(call.id, `Unknown tool "${call.name}".`);
    }
    if (typeof call.input === 'string') {
      // A model that streamed unparseable JSON arguments; the raw text helps it correct itself.
      return failure(call.id, `Invalid JSON arguments for ${call.name}: ${call.input}`);
    }
    const parsed = toolDefinitions[call.name].input.safeParse(call.input ?? {});
    if (!parsed.success) {
      return failure(call.id, `Invalid input for ${call.name}:\n${z.prettifyError(parsed.error)}`);
    }
    // The handler map is keyed by the same name that selected the schema above.
    const handler = handlers[call.name] as (
      input: unknown,
    ) => ReturnType<ToolHandlers['tabs_list']>;
    return { id: call.id, ok: true, content: await handler(parsed.data) };
  } catch (error) {
    return failure(call.id, error instanceof Error ? error.message : String(error));
  }
}
