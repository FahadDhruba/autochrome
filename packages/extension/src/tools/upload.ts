import { loadAttachment, MAX_ATTACHMENT_BYTES, toBase64 } from '../attachments';
import { callPage } from '../content';
import { callRef } from '../frames';
import type { FileData } from '../page/messages';
import { resolveTabId } from '../target';
import { text, type ToolHandlers } from './types';

async function download(url: string): Promise<FileData> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http and https URLs can be uploaded.');
  }
  // No cookies: the file is fetched as a stranger would see it, never with the user's session.
  const response = await fetch(parsed, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('The file is larger than 10 MB.');
  const name = decodeURIComponent(parsed.pathname.split('/').pop() || 'download');
  const type = response.headers.get('content-type')?.split(';')[0] ?? '';
  return { name, type, base64: toBase64(bytes) };
}

export const uploadHandlers: Pick<ToolHandlers, 'upload_file' | 'ask_user'> = {
  async upload_file({ ref, x, y, attachmentIds, url, fileName, text: body, tabId }) {
    const files: FileData[] = [];
    for (const id of attachmentIds ?? []) {
      const { name, type, base64 } = await loadAttachment(id);
      files.push({ name, type, base64 });
    }
    if (url !== undefined) files.push(await download(url));
    if (body !== undefined) {
      const name = fileName || 'file.txt';
      files.push({ name, type: 'text/plain', base64: toBase64(new TextEncoder().encode(body)) });
    }
    const id = await resolveTabId(tabId);
    if (ref !== undefined) return text(await callRef(id, 'set_files', { ref, files }));
    return text(await callPage(id, 'set_files', { point: { x: x!, y: y! }, files }));
  },

  // The side panel answers ask_user itself; anywhere else there is nobody to ask.
  async ask_user() {
    throw new Error(
      'Nobody is available to answer here. Decide with what you have, or stop and say what you need.',
    );
  },
};
