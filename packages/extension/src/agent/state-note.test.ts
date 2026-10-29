import { describeTools, type ToolCall, type ToolResult } from '@autochrome/shared';
import { describe, expect, it } from 'vitest';
import {
  toAnthropicMessages,
  toAnthropicSystem,
  toAnthropicTools,
} from '../providers/anthropic/translate';
import type { ChatMessage, Provider, ProviderEvent, StreamRequest } from '../providers/types';
import { runAgent } from './loop';

const anthropicBody = (req: StreamRequest) => ({
  tools: toAnthropicTools(req.tools),
  system: toAnthropicSystem(req.system),
  messages: toAnthropicMessages(req.messages),
});
type AnthropicBody = ReturnType<typeof anthropicBody>;

const NOTES = ['Tab state: tab 1 is current', 'Tab state: tab 1 and tab 2 (new) are open'];

/** Runs two model steps with a different tab state note each, and records the requests. */
async function twoSteps() {
  const requests: StreamRequest[] = [];
  const turns: ProviderEvent[][] = [
    [
      { type: 'tool_call', id: 'c1', name: 'tabs_list', input: {} },
      { type: 'done', stopReason: 'tool_use' },
    ],
    [
      { type: 'text_delta', text: 'done' },
      { type: 'done', stopReason: 'end' },
    ],
  ];
  const provider: Provider = {
    id: 'anthropic',
    listModels: async () => [],
    async *stream(req) {
      requests.push({ ...req, messages: structuredClone(req.messages) });
      yield* turns[requests.length - 1]!;
    },
  };
  const messages: ChatMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'go' }] }];
  let step = 0;
  await runAgent({
    provider,
    settings: { apiKey: 'k', baseUrl: '', model: 'm' },
    model: 'm',
    system: 'You are a browsing agent.',
    tools: describeTools().map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
    messages,
    execute: async (call: ToolCall): Promise<ToolResult> => ({
      id: call.id,
      ok: true,
      content: [{ type: 'text', text: 'tabs' }],
    }),
    stateNote: async () => NOTES[step++],
    emit: () => {},
    signal: new AbortController().signal,
  });
  return { requests, messages };
}

describe('tab state note', () => {
  it('is sent with every step as the last part, and never stored in the history', async () => {
    const { requests, messages } = await twoSteps();
    const lastPart = (request: StreamRequest) => request.messages.at(-1)!.parts.at(-1);
    expect(lastPart(requests[0]!)).toEqual({ type: 'text', text: NOTES[0], volatile: true });
    expect(lastPart(requests[1]!)).toEqual({ type: 'text', text: NOTES[1], volatile: true });
    expect(JSON.stringify(messages)).not.toContain('Tab state');
  });

  it('keeps the Anthropic cached prefix byte-identical when only the tab state changes', async () => {
    const { requests } = await twoSteps();
    const [first, second] = requests.map(anthropicBody) as [AnthropicBody, AnthropicBody];

    // cache_control marks where a prefix ends; it is not part of the cached content itself.
    const bytes = (value: unknown) =>
      JSON.stringify(value, (key, item) => (key === 'cache_control' ? undefined : item));

    // Step 1's cached prefix is everything up to its last stable block, i.e. without the note.
    const history = first.messages.slice(0, -1);
    const lastUser = first.messages.at(-1)!;
    const stable = (lastUser.content as { text?: string }[]).filter(
      (block) => block.text !== NOTES[0],
    );
    expect(stable).toHaveLength(lastUser.content.length - 1);
    const prefixOfFirst = bytes({
      tools: first.tools,
      system: first.system,
      messages: [...history, { ...lastUser, content: stable }],
    });
    const prefixOfSecond = bytes({
      tools: second.tools,
      system: second.system,
      messages: second.messages.slice(0, first.messages.length),
    });

    expect(prefixOfSecond).toBe(prefixOfFirst);
    expect(bytes(second.messages)).toContain(NOTES[1]);
    expect(bytes(second.messages)).not.toContain(NOTES[0]);
  });

  it('leaves the cache mark on the newest stable block, before the note', async () => {
    const { requests } = await twoSteps();
    const content = toAnthropicMessages(requests[1]!.messages).at(-1)!.content as {
      text?: string;
      type: string;
      cache_control?: unknown;
    }[];
    expect(content.at(-1)).toEqual({ type: 'text', text: NOTES[1] });
    expect(content.at(-2)).toMatchObject({
      type: 'tool_result',
      cache_control: { type: 'ephemeral' },
    });
  });
});
