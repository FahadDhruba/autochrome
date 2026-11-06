import { browser } from 'wxt/browser';

/** A reusable prompt, inserted by typing "/" and its name in the message box. */
export type SavedPrompt = { id: string; name: string; text: string };

const KEY = 'prompts';

export const DEFAULT_PROMPTS: SavedPrompt[] = [
  {
    id: 'summarize',
    name: 'summarize',
    text: 'Summarize the page I have open in 5 bullet points.',
  },
  {
    id: 'table',
    name: 'table',
    text: 'Extract the main data on this page as a table.',
  },
  {
    id: 'compare',
    name: 'compare',
    text: 'Compare the products in my open tabs in a table: name, price, rating and key differences.',
  },
  {
    id: 'translate',
    name: 'translate',
    text: 'Translate the main text of this page into English.',
  },
];

/** A name the slash menu can match: lowercase letters, digits and dashes. */
export const promptName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export async function loadPrompts(): Promise<SavedPrompt[]> {
  const stored = (await browser.storage.local.get(KEY))[KEY];
  return Array.isArray(stored) ? (stored as SavedPrompt[]) : DEFAULT_PROMPTS;
}

export async function savePrompts(prompts: SavedPrompt[]): Promise<void> {
  await browser.storage.local.set({ [KEY]: prompts });
}

export const isPromptsChange = (changes: Record<string, unknown>, area: string) =>
  area === 'local' && KEY in changes;

/** Prompts whose name starts with what follows the "/", or undefined when not in a slash command. */
export function matchPrompts(draft: string, prompts: SavedPrompt[]): SavedPrompt[] | undefined {
  const match = /^\/([a-z0-9-]*)$/i.exec(draft);
  if (!match) return undefined;
  const typed = match[1]!.toLowerCase();
  return prompts.filter((p) => p.name.startsWith(typed));
}
