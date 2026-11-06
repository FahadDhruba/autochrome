import { describeTools, toolDefinitions, type ToolCall, type ToolResult } from '@autochrome/shared';
import { executeTool } from '../executor';
import { loadChat, saveChat, titleFor, type Chat } from '../history';
import { providers } from '../providers';
import type { ProviderId } from '../providers/types';
import { isProviderId, loadProviderSettings } from '../settings';
import { registerPanel } from '../safety/approvalUi';
import { runAgent } from './loop';
import { CHAT_PORT_NAME, type AgentEvent, type PanelMessage } from './protocol';
import { runFromPanel, type WorkflowEvent } from '../workflows/session';
import { loadTabState } from './tab-state';
import { buildSystemPrompt } from './system-prompt';

function isPanelMessage(message: unknown): message is PanelMessage {
  const type = (message as { type?: unknown } | null)?.type;
  if (type === 'stop' || type === 'pause') return true;
  if (type === 'resume') {
    const note = (message as { note?: unknown }).note;
    return note === undefined || typeof note === 'string';
  }
  if (type === 'answer') {
    const answer = message as { id?: unknown; text?: unknown };
    return typeof answer.id === 'string' && typeof answer.text === 'string';
  }
  const run = message as Partial<Extract<PanelMessage, { type: 'run_workflow' }>>;
  if (type === 'run_workflow') {
    return typeof run.workflowId === 'string' && typeof run.variables === 'object';
  }
  const send = message as Partial<Extract<PanelMessage, { type: 'send' }>>;
  return type === 'send' && isProviderId(send.providerId) && typeof send.model === 'string';
}

/** Handles one side panel connection: one task at a time, aborted when the panel goes away. */
function handlePort(port: Browser.runtime.Port): void {
  registerPanel(port);
  let controller: AbortController | undefined;
  const questions = new Map<string, (answer: string | undefined) => void>();
  // Set while the user has taken over; resolving it hands the browser back (with a note).
  let pause: { resolve: (note: string) => void; resumed: Promise<string> } | undefined;

  const endPause = (note: string) => {
    pause?.resolve(note);
    pause = undefined;
  };

  const emit = (event: AgentEvent | WorkflowEvent) => {
    try {
      port.postMessage(event);
    } catch {
      // The panel is gone; the disconnect handler aborts the run.
    }
  };

  /** ask_user, answered in the panel. Stopping the task answers it with nothing. */
  const ask = async (call: ToolCall, signal: AbortSignal): Promise<ToolResult> => {
    const parsed = toolDefinitions.ask_user.input.safeParse(call.input ?? {});
    if (!parsed.success) {
      return {
        id: call.id,
        ok: false,
        content: [{ type: 'text', text: 'Invalid ask_user input.' }],
      };
    }
    const { question, choices, handoff } = parsed.data;
    const answer = await new Promise<string | undefined>((resolve) => {
      questions.set(call.id, resolve);
      signal.addEventListener('abort', () => resolve(undefined), { once: true });
      emit({ type: 'question', id: call.id, question, choices, handoff });
    });
    questions.delete(call.id);
    emit({ type: 'question_done', id: call.id });
    if (answer === undefined) {
      return { id: call.id, ok: false, content: [{ type: 'text', text: 'Stopped by the user.' }] };
    }
    const said = handoff
      ? `The user says it is done.${answer ? ` Their note: ${answer}` : ''} Check the page before going on.`
      : `The user answered: ${answer}`;
    return { id: call.id, ok: true, content: [{ type: 'text', text: said }] };
  };

  const start = async (chatId: string, text: string, providerId: ProviderId, model: string) => {
    const { provider } = providers[providerId];
    const settings = await loadProviderSettings(providerId);
    const existing = await loadChat(chatId);
    const chat: Chat = existing ?? { id: chatId, title: '', updatedAt: 0, messages: [] };
    chat.providerId = providerId;
    chat.model = model;
    chat.messages.push({ role: 'user', parts: [{ type: 'text', text }] });
    chat.title ||= titleFor(chat.messages);
    const persist = () => saveChat({ ...chat, updatedAt: Date.now() });
    await persist();

    await runAgent({
      provider,
      settings,
      model,
      system: buildSystemPrompt(new Date()),
      tools: describeTools({ panel: true }).map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
      messages: chat.messages,
      execute: (call: ToolCall) =>
        call.name === 'ask_user'
          ? ask(call, controller!.signal)
          : executeTool(call, { source: 'agent', signal: controller!.signal }),
      isPaused: () => pause !== undefined,
      waitIfPaused: async () => {
        if (!pause) return undefined;
        const { resumed } = pause;
        const aborted = new Promise<string>((resolve) =>
          controller!.signal.addEventListener('abort', () => resolve(''), { once: true }),
        );
        return Promise.race([resumed, aborted]);
      },
      emit: (event) => {
        if (event.type === 'done') chat.usage = event.usage;
        emit(event);
      },
      stateNote: loadTabState,
      onMessage: persist,
      signal: controller!.signal,
    });
    await persist();
  };

  port.onMessage.addListener((message: unknown) => {
    if (!isPanelMessage(message)) return;
    if (message.type === 'stop') {
      endPause('');
      return controller?.abort();
    }
    if (message.type === 'answer') return questions.get(message.id)?.(message.text);
    if (message.type === 'pause') {
      if (!controller || pause) return;
      let resolve!: (note: string) => void;
      const resumed = new Promise<string>((r) => (resolve = r));
      pause = { resolve, resumed };
      return emit({ type: 'paused' });
    }
    if (message.type === 'resume') {
      if (!pause) return;
      endPause(message.note?.trim() ?? '');
      return emit({ type: 'resumed' });
    }
    const isRun = message.type === 'run_workflow';
    const fail = (text: string) =>
      emit(isRun ? { type: 'run_error', message: text } : { type: 'error', message: text });
    if (controller) return fail('A task is already running.');

    controller = new AbortController();
    const task =
      message.type === 'run_workflow'
        ? runFromPanel(message.workflowId, message.variables, emit, controller.signal)
        : start(message.chatId, message.text, message.providerId, message.model);
    task
      .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
      .finally(() => {
        controller = undefined;
        endPause('');
      });
  });
  port.onDisconnect.addListener(() => controller?.abort());
}

export function startChatSessions(): void {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === CHAT_PORT_NAME) handlePort(port);
  });
}
