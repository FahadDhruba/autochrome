import { useCallback, useEffect, useRef, useState } from 'react';
import { applyEvent } from '@/src/agent/apply-event';
import { CHAT_PORT_NAME, type AgentEvent, type PanelMessage } from '@/src/agent/protocol';
import { loadChat } from '@/src/history';
import type { ChatMessage, Usage } from '@/src/providers/types';

const newChatId = (): string => crypto.randomUUID();

/** Chat state for the panel, kept above the views so a running task survives opening Settings. */
export function useChat() {
  const [chatId, setChatId] = useState(newChatId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [usage, setUsage] = useState<Usage>();
  const [revision, setRevision] = useState(0);
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

  const send = (text: string) => {
    setError(undefined);
    setUsage(undefined);
    setMessages((current) => [...current, { role: 'user', parts: [{ type: 'text', text }] }]);
    setRunningNow(true);
    post({ type: 'send', chatId, text });
  };

  const stop = () => post({ type: 'stop' });

  const reset = (id: string, loaded: ChatMessage[], loadedUsage?: Usage) => {
    setChatId(id);
    setMessages(loaded);
    setUsage(loadedUsage);
    setError(undefined);
  };

  const newChat = () => reset(newChatId(), []);

  const openChat = async (id: string) => {
    const chat = await loadChat(id);
    if (chat) reset(chat.id, chat.messages, chat.usage);
  };

  return { chatId, messages, running, error, usage, revision, send, stop, newChat, openChat };
}
