import { describeTools, type ToolCall, type ToolResult } from '@autochrome/shared';
import { runAgent } from '../agent/loop';
import { loadTabState } from '../agent/tab-state';
import { buildSystemPrompt } from '../agent/system-prompt';
import { executeTool } from '../executor';
import { saveChat, type Chat } from '../history';
import { providers } from '../providers';
import type { Provider, ProviderSettings } from '../providers/types';
import { isProviderReady, loadProviderSettings } from '../settings';
import { summarizeInput } from '../toolSummary';
import { runStore } from '../workflows/store';
import type { RunResult, StepLog } from '../workflows/types';
import type { Schedule } from './types';

export type PromptSchedule = Schedule & { run: { kind: 'prompt' } };

const TITLE_LENGTH = 60;
const NOTE_LENGTH = 80;

export const SCHEDULED_PROMPT_NOTE = [
  '',
  'This is an unattended scheduled run: nobody is watching and nobody can answer questions or approve anything.',
  '- Do not ask the user questions. Do the task, then report the result in a few sentences.',
  '- Actions are allowed without asking, so be careful and do only what the task says.',
  '- js_eval is not available in scheduled runs. If the task needs it, say so instead of trying.',
].join('\n');

export type PromptDeps = {
  /** The provider and its settings, or why it cannot be used. */
  loadTarget: (
    schedule: PromptSchedule,
  ) => Promise<{ provider: Provider; settings: ProviderSettings } | { error: string }>;
  execute: (call: ToolCall, signal: AbortSignal) => Promise<ToolResult>;
  saveChat: (chat: Chat) => Promise<void>;
  save: (run: RunResult) => Promise<void>;
  now: () => number;
};

async function loadTarget(schedule: PromptSchedule) {
  const { providerId, model } = schedule.run;
  const settings = { ...(await loadProviderSettings(providerId)) };
  if (model.trim()) settings.model = model.trim();
  if (!isProviderReady(providerId, settings)) {
    return { error: `${providers[providerId].label} is not set up. Add its API key in Settings.` };
  }
  return { provider: providers[providerId].provider, settings };
}

const defaultDeps: PromptDeps = {
  loadTarget,
  execute: (call, signal) => executeTool(call, { source: 'scheduled', signal }),
  saveChat,
  save: (run) => runStore.save(run),
  now: () => Date.now(),
};

const firstText = (result: ToolResult): string =>
  result.content.find((item) => item.type === 'text')?.text ?? 'The tool failed.';

const shorten = (text: string, length: number): string =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

/**
 * Runs the schedule's prompt with the agent loop and the chosen provider, with no side panel. The
 * conversation is saved as a chat titled with the schedule name, the tool calls become the run's
 * steps, and the AI's final answer its summary. The caller decides what a timeout means.
 */
export async function runPromptSchedule(
  schedule: PromptSchedule,
  signal: AbortSignal,
  deps: PromptDeps = defaultDeps,
): Promise<RunResult> {
  const { prompt, providerId, model } = schedule.run;
  const chat: Chat = {
    id: crypto.randomUUID(),
    title: shorten(`${schedule.name}: ${prompt.trim().replace(/\s+/g, ' ')}`, TITLE_LENGTH),
    updatedAt: deps.now(),
    messages: [{ role: 'user', parts: [{ type: 'text', text: prompt }] }],
    providerId,
    model,
  };
  const run: RunResult = {
    id: crypto.randomUUID(),
    workflowId: '',
    workflowName: schedule.name,
    source: 'scheduled',
    trigger: 'schedule',
    kind: 'prompt',
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    chatId: chat.id,
    startedAt: deps.now(),
    finishedAt: 0,
    status: 'ok',
    totalSteps: 0,
    variableNames: [],
    steps: [],
  };

  const persist = () => deps.saveChat({ ...chat, updatedAt: deps.now() });
  const finish = async (patch: Partial<RunResult>): Promise<RunResult> => {
    Object.assign(run, patch, { finishedAt: deps.now() });
    await deps.save(run).catch((error: unknown) => {
      console.error('autochrome: run not saved', error);
    });
    return run;
  };

  const target = await deps.loadTarget(schedule);
  if ('error' in target) return finish({ status: 'failed', error: target.error });
  await persist().catch(() => {});

  const started = new Map<string, { at: number; name: string; input: unknown }>();
  let failure: string | undefined;
  let answer = '';
  await runAgent({
    provider: target.provider,
    settings: target.settings,
    model: target.settings.model,
    system: buildSystemPrompt(new Date(deps.now())) + SCHEDULED_PROMPT_NOTE,
    tools: describeTools().map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
    messages: chat.messages,
    execute: (call: ToolCall) => deps.execute(call, signal),
    stateNote: loadTabState,
    onMessage: () => persist().catch(() => {}),
    signal,
    emit: (event) => {
      if (event.type === 'text_delta') answer += event.text;
      else if (event.type === 'tool_start') {
        started.set(event.id, { at: deps.now(), name: event.name, input: event.input });
        answer = '';
      } else if (event.type === 'tool_end') {
        const call = started.get(event.id);
        const name = call?.name ?? 'tool';
        const summary = call ? summarizeInput(call.input) : '';
        const step: StepLog = {
          index: run.steps.length,
          tool: name as StepLog['tool'],
          note: shorten(summary ? `${name} ${summary}` : name, NOTE_LENGTH),
          status: event.result.ok ? 'ok' : 'failed',
          durationMs: deps.now() - (call?.at ?? deps.now()),
          ...(!event.result.ok && { error: firstText(event.result) }),
        };
        run.steps.push(step);
      } else if (event.type === 'error') failure = event.message;
    },
  });
  await persist().catch(() => {});

  const text = answer.trim();
  run.totalSteps = run.steps.length;
  if (signal.aborted) return finish({ status: 'stopped', error: 'Stopped.', summary: text });
  if (failure) return finish({ status: 'failed', error: failure, summary: text });
  return finish({ status: 'ok', summary: text });
}
