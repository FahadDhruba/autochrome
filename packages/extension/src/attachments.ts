import { browser } from 'wxt/browser';
import type { FileData } from './page/messages';

/** Files the user attached to a chat, kept on this device so the agent can upload them. */
export type Attachment = FileData & { id: string; size: number };

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const key = (id: string) => `attachment:${id}`;

export async function saveAttachment(file: Omit<Attachment, 'id'>): Promise<Attachment> {
  const attachment = { ...file, id: `a${crypto.randomUUID().slice(0, 6)}` };
  await browser.storage.local.set({ [key(attachment.id)]: attachment });
  return attachment;
}

export async function loadAttachment(id: string): Promise<Attachment> {
  const stored = (await browser.storage.local.get(key(id)))[key(id)] as Attachment | undefined;
  if (!stored) throw new Error(`No attached file with id ${id}.`);
  return stored;
}

const NOTE_PREFIX = 'Attached files, for upload_file: ';

/** The note added to the user's message, so the model knows the files and their ids. */
export function attachmentNote(files: Pick<Attachment, 'id' | 'name' | 'size'>[]): string {
  const list = files.map((f) => `${f.name} (id ${f.id}, ${Math.ceil(f.size / 1024)} KB)`);
  return `${NOTE_PREFIX}${list.join(', ')}`;
}

/** Splits a user message into what they typed and the names of the files they attached. */
export function splitAttachmentNote(text: string): { text: string; files: string[] } {
  const at = text.lastIndexOf(`\n\n${NOTE_PREFIX}`);
  if (at === -1) return { text, files: [] };
  const list = text.slice(at + 2 + NOTE_PREFIX.length);
  const files = [...list.matchAll(/(?:^|, )(.+?) \(id [\w-]+, \d+ KB\)/g)].map((m) => m[1]!);
  return { text: text.slice(0, at), files };
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
