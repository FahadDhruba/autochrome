import { browser } from 'wxt/browser';
import { wrapPageContent } from './safety/wrap';

/** Where a right-click hands its prompt to the side panel, which sends it. */
export const PENDING_PROMPT_KEY = 'pendingPrompt';
export type PendingPrompt = { text: string; at: number };

const ITEMS = [
  { id: 'ask-selection', title: 'Ask autochrome about “%s”', contexts: ['selection'] },
  { id: 'ask-link', title: 'Ask autochrome about this link', contexts: ['link'] },
  { id: 'summarize-page', title: 'Summarize this page with autochrome', contexts: ['page'] },
] as const;

type Clicked = { menuItemId: string | number; selectionText?: string; linkUrl?: string };

const siteOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
};

/** The prompt a menu item stands for. Selected text came from the page, so it is wrapped as such. */
export function promptFor(info: Clicked, page: { url: string; title: string }): string | undefined {
  switch (info.menuItemId) {
    case 'ask-selection':
      return [
        `Explain this text I selected on "${page.title}" (${page.url}):`,
        wrapPageContent(siteOf(page.url), info.selectionText ?? ''),
      ].join('\n');
    case 'ask-link':
      return `Open this link from "${page.title}" in a new tab and tell me what it is about: ${info.linkUrl}`;
    case 'summarize-page':
      return `Summarize the page I have open ("${page.title}", ${page.url}) in a few bullet points.`;
    default:
      return undefined;
  }
}

/** Right-click items that open the side panel with a prompt about what was clicked. */
export function startContextMenu(): void {
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      for (const item of ITEMS)
        browser.contextMenus.create({ ...item, contexts: [...item.contexts] });
    });
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id === undefined) return;
    // Opening the panel needs the click's user gesture, so it comes before anything async.
    void browser.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
    const text = promptFor(info, { url: tab.url ?? '', title: tab.title ?? '' });
    if (!text) return;
    const pending: PendingPrompt = { text, at: Date.now() };
    void browser.storage.session.set({ [PENDING_PROMPT_KEY]: pending });
  });
}
