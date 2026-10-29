import { describeTools, type ToolCall } from '@autochrome/shared';
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
  if (type === 'stop') return true;
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
  const emit = (event: AgentEvent | WorkflowEvent) => {
    try {
      port.postMessage(event);
    } catch {
      // The panel is gone; the disconnect handler aborts the run.
    }
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
      tools: describeTools().map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
      messages: chat.messages,
      execute: (call: ToolCall) =>
        executeTool(call, { source: 'agent', signal: controller!.signal }),
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
    if (message.type === 'stop') return controller?.abort();
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
      });
  });
  port.onDisconnect.addListener(() => controller?.abort());
}

export function startChatSessions(): void {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === CHAT_PORT_NAME) handlePort(port);
  });
}
