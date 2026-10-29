import type { Step, TargetHint, ToolName, Workflow } from '@autochrome/shared';
import type { ChatMessage, Part } from '../providers/types';
import { noteFor } from './note';

/** Actions that can be replayed. Reads, tab juggling and debugging tools are left out. */
const REPLAYABLE = new Set<ToolName>([
  'navigate',
  'go_back',
  'go_forward',
  'tab_open',
  'click',
  'type',
  'key',
  'scroll',
  'form_input',
  'wait',
]);

type ToolCallPart = Extract<Part, { type: 'tool_call' }>;
type ToolResultPart = Extract<Part, { type: 'tool_result' }>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * The step for one successful tool call, or undefined when the call is not replayable. Refs and
 * tab ids only live as long as the chat, so they are dropped; the target hint takes their place.
 */
export function stepFromCall(
  call: Pick<ToolCallPart, 'name' | 'input'>,
  target?: TargetHint,
): Step | undefined {
  const tool = call.name as ToolName;
  if (!REPLAYABLE.has(tool) || !isObject(call.input)) return undefined;
  const input = { ...call.input };
  delete input.tabId;
  delete input.ref;
  // A tab opened in the background is not the one the next steps act on.
  if (tool === 'tab_open' && input.background === true) return undefined;
  if (tool === 'tab_open') delete input.background;
  if (target && tool === 'click') {
    delete input.x;
    delete input.y;
  }
  if (tool === 'scroll' && call.input.ref !== undefined && !target) {
    // No element to find again: scroll the page instead.
    delete input.x;
    delete input.y;
  }
  return { tool, input, ...(target && { target }), note: noteFor(tool, input, target) };
}

/** A workflow starts from a page: add the navigation the chat did before it was recorded. */
function withStartPage(steps: Step[]): Step[] {
  const first = steps[0];
  const url = first?.target?.url;
  if (!first || !url || first.tool === 'navigate' || first.tool === 'tab_open') return steps;
  return [{ tool: 'navigate', input: { url }, note: noteFor('navigate', { url }) }, ...steps];
}

/** The successful replayable tool calls in order, with the element each one acted on. */
export function stepsFromMessages(messages: ChatMessage[]): Step[] {
  const parts = messages.flatMap((message) => message.parts);
  const results = new Map<string, ToolResultPart>();
  for (const part of parts) if (part.type === 'tool_result') results.set(part.callId, part);

  const steps = parts.flatMap((part) => {
    if (part.type !== 'tool_call') return [];
    const result = results.get(part.id);
    if (!result || result.isError) return [];
    const step = stepFromCall(part, result.target);
    return step ? [step] : [];
  });
  return withStartPage(steps);
}

export function workflowFromChat(chat: { title: string; messages: ChatMessage[] }): Workflow {
  return {
    id: crypto.randomUUID(),
    name: chat.title || 'Saved chat',
    variables: [],
    steps: stepsFromMessages(chat.messages),
    createdFrom: 'chat',
    updatedAt: Date.now(),
  };
}
