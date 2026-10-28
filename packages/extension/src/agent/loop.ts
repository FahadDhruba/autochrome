import type { ToolCall, ToolResult } from '@autochrome/shared';
import type {
  ChatMessage,
  Part,
  Provider,
  ProviderSettings,
  ProviderTool,
  Usage,
} from '../providers/types';
import { MAX_STEPS, type AgentEvent } from './protocol';
import { pruneScreenshots } from './prune';

export type AgentRun = {
  provider: Provider;
  settings: ProviderSettings;
  model: string;
  system: string;
  tools: ProviderTool[];
  /** History so far, ending with the new user message. The loop appends to it. */
  messages: ChatMessage[];
  execute: (call: ToolCall) => Promise<ToolResult>;
  emit: (event: AgentEvent) => void;
  /** Called after each message is appended, so the caller can persist progress. */
  onMessage?: () => void | Promise<void>;
  signal: AbortSignal;
  maxSteps?: number;
};

const STOPPED_TEXT = 'Stopped.';
const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });

function addUsage(total: Usage, usage: Usage | undefined): void {
  if (!usage) return;
  total.inputTokens += usage.inputTokens;
  total.outputTokens += usage.outputTokens;
  total.cacheReadTokens = (total.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0);
}

/** Runs the model/tool loop until the model finishes, the user stops it, or a limit is hit. */
export async function runAgent(run: AgentRun): Promise<void> {
  const { messages, emit, signal } = run;
  const usage = emptyUsage();

  const append = async (message: ChatMessage) => {
    messages.push(message);
    await run.onMessage?.();
  };
  // Keeps user/assistant turns alternating after an early exit.
  const finishWithNote = async (text: string) => {
    const last = messages.at(-1);
    if (last?.role === 'assistant') {
      emit({ type: 'text_delta', text: `\n\n${text}` });
      last.parts.push({ type: 'text', text: `\n\n${text}` });
      await run.onMessage?.();
    } else {
      emit({ type: 'text_delta', text });
      await append({ role: 'assistant', parts: [{ type: 'text', text }] });
    }
    emit({ type: 'done', usage });
  };

  for (let step = 0; step < (run.maxSteps ?? MAX_STEPS); step++) {
    if (signal.aborted) return finishWithNote(STOPPED_TEXT);

    const parts: Part[] = [];
    let stopReason: string | undefined;
    let failure: string | undefined;

    for await (const event of run.provider.stream({
      settings: run.settings,
      model: run.model,
      system: run.system,
      messages: pruneScreenshots(messages),
      tools: run.tools,
      signal,
    })) {
      if (event.type === 'text_delta') {
        const last = parts.at(-1);
        if (last?.type === 'text') last.text += event.text;
        else parts.push({ type: 'text', text: event.text });
        emit(event);
      } else if (event.type === 'tool_call') {
        parts.push(event);
      } else if (event.type === 'done') {
        stopReason = event.stopReason;
        addUsage(usage, event.usage);
      } else {
        failure = event.message;
      }
    }

    // Tool calls that will never run must not stay in the history without results.
    const interrupted = signal.aborted || failure !== undefined;
    const kept = interrupted ? parts.filter((part) => part.type !== 'tool_call') : parts;
    if (kept.length > 0) await append({ role: 'assistant', parts: kept });
    if (signal.aborted) return finishWithNote(STOPPED_TEXT);
    if (failure) return emit({ type: 'error', message: failure });

    const calls = parts.filter((part) => part.type === 'tool_call');
    if (stopReason !== 'tool_use' || calls.length === 0) {
      if (stopReason === 'max_tokens') {
        return emit({ type: 'error', message: 'The response was cut off (output limit reached).' });
      }
      return emit({ type: 'done', usage });
    }

    const results: Part[] = [];
    for (const call of calls) {
      emit({ type: 'tool_start', id: call.id, name: call.name, input: call.input });
      const result: ToolResult = signal.aborted
        ? { id: call.id, ok: false, content: [{ type: 'text', text: 'Stopped by the user.' }] }
        : await run.execute({
            id: call.id,
            name: call.name as ToolCall['name'],
            input: call.input,
          });
      emit({ type: 'tool_end', id: call.id, result });
      results.push({
        type: 'tool_result',
        callId: call.id,
        content: result.content,
        isError: !result.ok,
      });
    }
    await append({ role: 'user', parts: results });
  }

  await finishWithNote(`Stopped after ${run.maxSteps ?? MAX_STEPS} steps without finishing.`);
}
