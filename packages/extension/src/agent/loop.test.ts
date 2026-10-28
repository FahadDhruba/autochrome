import type { ToolCall, ToolResult } from '@autochrome/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Provider, ProviderEvent, StreamRequest } from '../providers/types';
import { runAgent, type AgentRun } from './loop';
import type { AgentEvent } from './protocol';

const toolTurn = (...ids: string[]): ProviderEvent[] => [
  { type: 'text_delta', text: 'working' },
  ...ids.map((id) => ({ type: 'tool_call' as const, id, name: 'tabs_list', input: {} })),
  { type: 'done', stopReason: 'tool_use', usage: { inputTokens: 10, outputTokens: 5 } },
];
const finalTurn: ProviderEvent[] = [
  { type: 'text_delta', text: 'All done' },
  {
    type: 'done',
    stopReason: 'end',
    usage: { inputTokens: 20, outputTokens: 7, cacheReadTokens: 3 },
  },
];

/** Plays one scripted turn per stream call and records what it was sent. */
function fakeProvider(turns: ProviderEvent[][] | ((step: number) => ProviderEvent[])) {
  const requests: StreamRequest[] = [];
  const provider: Provider = {
    id: 'anthropic',
    listModels: async () => [],
    async *stream(req) {
      const step = requests.length;
      requests.push({ ...req, messages: structuredClone(req.messages) });
      const turn = typeof turns === 'function' ? turns(step) : turns[step];
      for (const event of turn ?? []) {
        if (req.signal.aborted) return;
        yield event;
      }
    },
  };
  return { provider, requests };
}

function setup(
  turns: ProviderEvent[][] | ((step: number) => ProviderEvent[]),
  overrides: Partial<AgentRun> = {},
) {
  const { provider, requests } = fakeProvider(turns);
  const events: AgentEvent[] = [];
  const messages: ChatMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'go' }] }];
  const execute = vi.fn(async (call: ToolCall): Promise<ToolResult> => ({
    id: call.id,
    ok: true,
    content: [{ type: 'text', text: `ran ${call.name}` }],
  }));
  const controller = new AbortController();
  const run: AgentRun = {
    provider,
    settings: { apiKey: 'k', baseUrl: '', model: 'm' },
    model: 'm',
    system: 'sys',
    tools: [],
    messages,
    execute,
    emit: (event) => events.push(event),
    signal: controller.signal,
    ...overrides,
  };
  return { run, events, messages, execute, requests, controller };
}

describe('runAgent', () => {
  it('runs a tool round trip and finishes with summed usage', async () => {
    const { run, events, messages, execute, requests } = setup([toolTurn('c1', 'c2'), finalTurn]);
    await runAgent(run);

    expect(execute.mock.calls.map(([call]) => call.id)).toEqual(['c1', 'c2']);
    expect(events.map((event) => event.type)).toEqual([
      'text_delta',
      'tool_start',
      'tool_end',
      'tool_start',
      'tool_end',
      'text_delta',
      'done',
    ]);
    expect(events.at(-1)).toEqual({
      type: 'done',
      usage: { inputTokens: 30, outputTokens: 12, cacheReadTokens: 3 },
    });
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(messages[2]?.parts).toEqual([
      {
        type: 'tool_result',
        callId: 'c1',
        isError: false,
        content: [{ type: 'text', text: 'ran tabs_list' }],
      },
      {
        type: 'tool_result',
        callId: 'c2',
        isError: false,
        content: [{ type: 'text', text: 'ran tabs_list' }],
      },
    ]);
    // The second request already contains the tool results.
    expect(requests[1]?.messages).toHaveLength(3);
  });

  it('reports failed tools to the model as errors', async () => {
    const execute = vi.fn(async (call: ToolCall) => ({
      id: call.id,
      ok: false,
      content: [{ type: 'text' as const, text: 'boom' }],
    }));
    const { run, messages } = setup([toolTurn('c1'), finalTurn], { execute });
    await runAgent(run);
    expect(messages[2]?.parts[0]).toMatchObject({ type: 'tool_result', isError: true });
  });

  it('stops mid-stream without keeping unexecuted tool calls', async () => {
    const { run, events, messages, controller, execute } = setup([toolTurn('c1')], {
      emit: (event) => {
        events.push(event);
        if (event.type === 'text_delta') controller.abort();
      },
    });
    await runAgent(run);
    expect(execute).not.toHaveBeenCalled();
    expect(messages.flatMap((m) => m.parts).some((p) => p.type === 'tool_call')).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('stops between tool calls and still answers every call', async () => {
    const { run, events, messages, controller, execute } = setup([toolTurn('c1', 'c2')]);
    execute.mockImplementationOnce(async (call) => {
      controller.abort();
      return { id: call.id, ok: true, content: [{ type: 'text', text: 'first' }] };
    });
    await runAgent(run);

    expect(execute).toHaveBeenCalledTimes(1);
    const results = messages[2]?.parts;
    expect(results).toHaveLength(2);
    expect(results?.[1]).toMatchObject({ callId: 'c2', isError: true });
    expect(messages.at(-1)?.role).toBe('assistant');
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('stops after the step limit with a message', async () => {
    const { run, events, messages, requests } = setup(() => toolTurn('c'), { maxSteps: 3 });
    await runAgent(run);
    expect(requests).toHaveLength(3);
    const last = messages.at(-1);
    expect(last).toMatchObject({ role: 'assistant' });
    expect(JSON.stringify(last)).toContain('Stopped after 3 steps');
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('uses 50 steps by default', async () => {
    const { run, requests } = setup(() => toolTurn('c'));
    await runAgent(run);
    expect(requests).toHaveLength(50);
  });

  it('emits provider errors and drops half-finished tool calls', async () => {
    const { run, events, messages } = setup([
      [...toolTurn('c1').slice(0, 2), { type: 'error', message: 'Rate limit reached.' }],
    ]);
    await runAgent(run);
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Rate limit reached.' });
    expect(messages.flatMap((m) => m.parts).some((p) => p.type === 'tool_call')).toBe(false);
  });

  it('sends pruned screenshots to the provider but keeps them in history', async () => {
    const shot = (id: string) => ({
      type: 'tool_result' as const,
      callId: id,
      isError: false,
      content: [{ type: 'image' as const, data: id, mimeType: 'image/jpeg' }],
    });
    const { run, messages, requests } = setup([finalTurn]);
    messages.push(
      ...['a', 'b', 'c', 'd'].map((id) => ({ role: 'user' as const, parts: [shot(id)] })),
    );
    await runAgent(run);
    expect(JSON.stringify(requests[0]?.messages)).toContain('[earlier screenshot removed]');
    expect(JSON.stringify(messages)).not.toContain('[earlier screenshot removed]');
  });

  it('calls onMessage after each appended message', async () => {
    const onMessage = vi.fn();
    const { run } = setup([toolTurn('c1'), finalTurn], { onMessage });
    await runAgent(run);
    expect(onMessage).toHaveBeenCalledTimes(3);
  });
});
