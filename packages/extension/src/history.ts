import type { ChatMessage, ProviderId, Usage } from './providers/types';

const INDEX_KEY = 'chat:index';
const TITLE_LENGTH = 60;

export type ChatSummary = { id: string; title: string; updatedAt: number };
/** `providerId` and `model` are missing on chats saved before M4; they were Anthropic chats. */
export type Chat = ChatSummary & {
  messages: ChatMessage[];
  usage?: Usage;
  providerId?: ProviderId;
  model?: string;
};

export type ChatTarget = { providerId: ProviderId; model: string };

const chatKey = (id: string) => `chat:${id}`;

export function titleFor(messages: ChatMessage[]): string {
  const first = messages
    .find((message) => message.role === 'user')
    ?.parts.find((part) => part.type === 'text');
  return first?.type === 'text' ? first.text.trim().slice(0, TITLE_LENGTH) : 'New chat';
}

export async function listChats(): Promise<ChatSummary[]> {
  const stored = await browser.storage.local.get(INDEX_KEY);
  const index = stored[INDEX_KEY] as ChatSummary[] | undefined;
  return [...(index ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadChat(id: string): Promise<Chat | undefined> {
  const stored = await browser.storage.local.get(chatKey(id));
  return stored[chatKey(id)] as Chat | undefined;
}

export async function saveChat(chat: Chat): Promise<void> {
  const index = (await listChats()).filter((entry) => entry.id !== chat.id);
  const summary: ChatSummary = { id: chat.id, title: chat.title, updatedAt: chat.updatedAt };
  await browser.storage.local.set({ [chatKey(chat.id)]: chat, [INDEX_KEY]: [summary, ...index] });
}

export async function deleteChat(id: string): Promise<void> {
  const index = (await listChats()).filter((entry) => entry.id !== id);
  await browser.storage.local.set({ [INDEX_KEY]: index });
  await browser.storage.local.remove(chatKey(id));
}

/** Changes the provider/model of a saved chat without touching its order in the history. */
export async function saveChatTarget(id: string, target: ChatTarget): Promise<void> {
  const chat = await loadChat(id);
  if (chat) await browser.storage.local.set({ [chatKey(id)]: { ...chat, ...target } });
}
