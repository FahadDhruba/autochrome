import { useCallback, useEffect, useRef, useState } from 'react';
import { applyEvent } from '@/src/agent/apply-event';
import { CHAT_PORT_NAME, type AgentEvent, type PanelMessage } from '@/src/agent/protocol';
import { loadChat, saveChatTarget, type ChatTarget } from '@/src/history';
import type { ChatMessage, Usage } from '@/src/providers/types';
import type { ProviderState } from './useProviderSettings';

const newChatId = (): string => crypto.randomUUID();

function defaultTarget({ all, defaultProvider, ready }: ProviderState): ChatTarget {
  const providerId = ready.includes(defaultProvider)
    ? defaultProvider
    : (ready[0] ?? defaultProvider);
  return { providerId, model: all[providerId].model };
}

/** Chat state for the panel, kept above the views so a running task survives opening Settings. */
export function useChat(providers: ProviderState | undefined) {
  const [chatId, setChatId] = useState(newChatId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [usage, setUsage] = useState<Usage>();
  const [revision, setRevision] = useState(0);
  // Set when the user picks a provider/model or opens a saved chat; otherwise the defaults apply.
  const [chosen, setChosen] = useState<ChatTarget>();
  const port = useRef<Browser.runtime.Port>(undefined);
  const runningRef = useRef(false);

  const setRunningNow = (value: boolean) => {
    runningRef.current = value;
    setRunning(value);
  };

  const connect = useCallback(() => {
    const next = browser.runtime.connect({ name: CHAT_PORT_NAME });
    next.onMessage.addListener((event: AgentEvent) => {
      if (event.type === 'done') {
        setUsage(event.usage);
        setRunningNow(false);
        setRevision((n) => n + 1);
      } else if (event.type === 'error') {
        setError(event.message);
        setRunningNow(false);
        setRevision((n) => n + 1);
      } else {
        setMessages((current) => applyEvent(current, event));
      }
    });
    next.onDisconnect.addListener(() => {
      port.current = undefined;
      if (runningRef.current) {
        setError('Lost the connection to the background worker.');
        setRunningNow(false);
      }
    });
    port.current = next;
    return next;
  }, []);

  useEffect(() => () => port.current?.disconnect(), []);

  const post = (message: PanelMessage) => (port.current ?? connect()).postMessage(message);

  const target = chosen ?? (providers ? defaultTarget(providers) : undefined);

  const changeTarget = (next: ChatTarget) => {
    setChosen(next);
    void saveChatTarget(chatId, next);
  };

  const send = (text: string) => {
    if (!target) return;
    setError(undefined);
    setUsage(undefined);
    setMessages((current) => [...current, { role: 'user', parts: [{ type: 'text', text }] }]);
    setRunningNow(true);
    post({ type: 'send', chatId, text, ...target });
  };

  const stop = () => post({ type: 'stop' });

  const reset = (
    id: string,
    loaded: ChatMessage[],
    loadedUsage?: Usage,
    loadedTarget?: ChatTarget,
  ) => {
    setChatId(id);
    setChosen(loadedTarget);
    setMessages(loaded);
    setUsage(loadedUsage);
    setError(undefined);
  };

  const newChat = () => reset(newChatId(), []);

  const openChat = async (id: string) => {
    const chat = await loadChat(id);
    if (!chat) return;
    // Chats from before M4 have no provider; they were Anthropic chats.
    const providerId = chat.providerId ?? 'anthropic';
    const model = chat.model ?? providers?.all[providerId].model ?? '';
    reset(chat.id, chat.messages, chat.usage, { providerId, model });
  };

  return {
    chatId,
    messages,
    running,
    error,
    usage,
    revision,
    target,
    changeTarget,
    send,
    stop,
    newChat,
    openChat,
  };
}
