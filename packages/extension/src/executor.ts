import {
  toolDefinitions,
  type ToolCall,
  type ToolContent,
  type ToolName,
  type ToolResult,
} from '@autochrome/shared';
import { z } from 'zod';
import { authorize } from './safety/authorize';
import { gateEnv, pageSite } from './safety/env';
import type { ToolSource } from './safety/types';
import { wrapPageContent } from './safety/wrap';
import { toolHandlers } from './tools';
import type { ToolHandlers } from './tools/types';

/** Tools whose text comes from a web page and must be marked as untrusted. */
const PAGE_CONTENT_TOOLS = new Set<ToolName>(['read_page', 'find', 'get_text']);

export type ExecuteOptions = {
  source: ToolSource;
  /** Aborting denies an approval prompt that is still waiting. */
  signal?: AbortSignal;
  handlers?: ToolHandlers;
  /** Returns why the call must not run, or undefined. Defaults to the real permission gate. */
  authorize?: (
    call: ToolCall,
    source: ToolSource,
    signal?: AbortSignal,
  ) => Promise<string | undefined>;
  /** The site of the tab a page tool read. */
  pageSite?: (tabId: number | undefined) => Promise<string>;
};

function failure(id: string, message: string): ToolResult {
  return { id, ok: false, content: [{ type: 'text', text: message }] };
}

async function wrapContent(
  content: ToolContent[],
  tabId: number | undefined,
  getSite: NonNullable<ExecuteOptions['pageSite']>,
): Promise<ToolContent[]> {
  const site = await getSite(tabId);
  return content.map((item) =>
    item.type === 'text' ? { type: 'text', text: wrapPageContent(site, item.text) } : item,
  );
}

/**
 * The single entry point for running a tool: validates input, asks the permission gate (unless
 * the user themselves is calling from the debug page) and turns every error into a result.
 */
export async function executeTool(call: ToolCall, options: ExecuteOptions): Promise<ToolResult> {
  const { source, signal, handlers = toolHandlers } = options;
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

    // The gate sees the parsed input, so defaults are filled in.
    const checked: ToolCall = { ...call, input: parsed.data };
    const denial = await (
      options.authorize ?? ((c, s, sig) => authorize(c, s, sig, { env: gateEnv }))
    )(checked, source, signal);
    if (denial !== undefined) return failure(call.id, denial);

    // The handler map is keyed by the same name that selected the schema above.
    const handler = handlers[call.name] as (
      input: unknown,
    ) => ReturnType<ToolHandlers['tabs_list']>;
    const content = await handler(parsed.data);
    if (!PAGE_CONTENT_TOOLS.has(call.name)) return { id: call.id, ok: true, content };

    const tabId = (parsed.data as { tabId?: number }).tabId;
    return {
      id: call.id,
      ok: true,
      content: await wrapContent(content, tabId, options.pageSite ?? pageSite),
    };
  } catch (error) {
    return failure(call.id, error instanceof Error ? error.message : String(error));
  }
}
