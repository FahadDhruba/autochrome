import type { ToolCall, ToolResult } from '@autochrome/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Chat } from '../history';
import type { Provider, ProviderEvent } from '../providers/types';
import type { RunResult } from '../workflows/types';
import { runPromptSchedule, type PromptDeps, type PromptSchedule } from './prompt';

const schedule: PromptSchedule = {
  id: 's1',
  name: 'News digest',
  enabled: true,
  run: { kind: 'prompt', prompt: 'Summarise the front page', providerId: 'anthropic', model: 'm' },
  when: { every: 'day', time: '08:00' },
  sites: [],
  nextRunAt: 1,
};

function provider(turns: ProviderEvent[][]): Provider {
  let step = 0;
  return {
    id: 'anthropic',
    listModels: async () => [],
    async *stream() {
      for (const event of turns[step++] ?? []) yield event;
    },
  };
}

function setup(turns: ProviderEvent[][], overrides: Partial<PromptDeps> = {}) {
  let clock = 0;
  const chats: Chat[] = [];
  const runs: RunResult[] = [];
  const calls: ToolCall[] = [];
  const deps: PromptDeps = {
    loadTarget: async () => ({
      provider: provider(turns),
      settings: { apiKey: 'k', baseUrl: '', model: 'm' },
    }),
    execute: vi.fn(async (call: ToolCall): Promise<ToolResult> => {
      calls.push(call);
      return { id: call.id, ok: true, content: [{ type: 'text', text: 'ok' }] };
    }),
    saveChat: async (chat) => void chats.push(structuredClone(chat)),
    save: async (run) => void runs.push(structuredClone(run)),
    now: () => (clock += 5),
    ...overrides,
  };
  return { deps, chats, runs, calls };
}

const toolTurn: ProviderEvent[] = [
  { type: 'tool_call', id: 't1', name: 'navigate', input: { url: 'https://example.com' } },
  { type: 'done', stopReason: 'tool_use' },
];
const answerTurn: ProviderEvent[] = [
  { type: 'text_delta', text: 'Three new ' },
  { type: 'text_delta', text: 'stories.' },
  { type: 'done', stopReason: 'end' },
];

describe('runPromptSchedule', () => {
  it('runs the agent with the scheduled source, logs tool calls and keeps the answer', async () => {
    const t = setup([toolTurn, answerTurn]);
    const run = await runPromptSchedule(schedule, new AbortController().signal, t.deps);

    expect(t.calls.map((call) => call.name)).toEqual(['navigate']);
    expect(run).toMatchObject({
      kind: 'prompt',
      trigger: 'schedule',
      source: 'scheduled',
      scheduleId: 's1',
      scheduleName: 'News digest',
      workflowName: 'News digest',
      status: 'ok',
      summary: 'Three new stories.',
      totalSteps: 1,
    });
    expect(run.steps).toMatchObject([
      { index: 0, tool: 'navigate', status: 'ok', note: expect.stringContaining('example.com') },
    ]);
    expect(t.runs.at(-1)?.id).toBe(run.id);
  });

  it('saves the conversation as a chat titled with the schedule name, linked from the run', async () => {
    const t = setup([toolTurn, answerTurn]);
    const run = await runPromptSchedule(schedule, new AbortController().signal, t.deps);
    const chat = t.chats.at(-1)!;
    expect(run.chatId).toBe(chat.id);
    expect(chat.title).toBe('News digest: Summarise the front page');
    expect(chat).toMatchObject({ providerId: 'anthropic', model: 'm' });
    expect(chat.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('tells the model nobody can answer, and marks a failed tool call in the log', async () => {
    let system = '';
    const t = setup([toolTurn, answerTurn], {
      loadTarget: async () => ({
        provider: {
          id: 'anthropic',
          listModels: async () => [],
          async *stream(request) {
            system = request.system;
            yield* [
              { type: 'text_delta', text: 'done' },
              { type: 'done', stopReason: 'end' },
            ] as const;
          },
        },
        settings: { apiKey: 'k', baseUrl: '', model: 'm' },
      }),
    });
    await runPromptSchedule(schedule, new AbortController().signal, t.deps);
    expect(system).toContain('unattended scheduled run');

    const denied = setup([toolTurn, answerTurn], {
      execute: async (call) => ({
        id: call.id,
        ok: false,
        content: [{ type: 'text', text: 'Scheduled runs cannot run JavaScript' }],
      }),
    });
    const run = await runPromptSchedule(schedule, new AbortController().signal, denied.deps);
    expect(run.status).toBe('ok');
    expect(run.steps[0]).toMatchObject({
      status: 'failed',
      error: 'Scheduled runs cannot run JavaScript',
    });
  });

  it('fails with the provider error', async () => {
    const t = setup([[{ type: 'error', message: 'Invalid API key' }]]);
    const run = await runPromptSchedule(schedule, new AbortController().signal, t.deps);
    expect(run).toMatchObject({ status: 'failed', error: 'Invalid API key' });
  });

  it('fails without calling a model when the provider is not set up', async () => {
    const t = setup([], { loadTarget: async () => ({ error: 'Anthropic is not set up.' }) });
    const run = await runPromptSchedule(schedule, new AbortController().signal, t.deps);
    expect(run).toMatchObject({ status: 'failed', error: 'Anthropic is not set up.' });
    expect(t.chats).toHaveLength(0);
    expect(t.runs).toHaveLength(1);
  });

  it('is stopped by the abort signal', async () => {
    const controller = new AbortController();
    const t = setup([toolTurn, answerTurn], {
      execute: async (call) => {
        controller.abort();
        return { id: call.id, ok: true, content: [{ type: 'text', text: 'ok' }] };
      },
    });
    const run = await runPromptSchedule(schedule, controller.signal, t.deps);
    expect(run.status).toBe('stopped');
  });
});
