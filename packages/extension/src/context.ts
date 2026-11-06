import { browser } from 'wxt/browser';
import type { ContextPart } from './agent/protocol';
import { callPage } from './content';
import { checkUrl } from './safety/origin';
import { wrapPageContent } from './safety/wrap';

export type ContextKind = 'page' | 'tabs' | 'screenshot';
export type ContextRequest = { type: 'autochrome:context'; kind: ContextKind };

export const isContextRequest = (message: unknown): message is ContextRequest =>
  (message as { type?: unknown } | null)?.type === 'autochrome:context';

/** Page text is capped lower than get_text: it rides along with every step of the task. */
const MAX_PAGE_CHARS = 8000;

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) throw new Error('No tab is open.');
  return tab as Browser.tabs.Tab & { id: number };
}

/** What the user attached to their message, read from the tab they are looking at. */
export async function contextFor(kind: ContextKind): Promise<ContextPart> {
  if (kind === 'tabs') {
    const tabs = await browser.tabs.query({});
    const lines = tabs.map((t) => `- ${t.title ?? ''} — ${t.url ?? ''}`);
    return {
      type: 'text',
      context: `${tabs.length} open tabs`,
      text: `Context: my open tabs\n${wrapPageContent('browser tabs', lines.join('\n'))}`,
    };
  }
  const tab = await activeTab();
  const checked = checkUrl(tab.url ?? '');
  if ('reason' in checked) throw new Error(checked.reason);
  if (kind === 'screenshot') {
    const url = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
    return {
      type: 'image',
      mimeType: 'image/jpeg',
      data: url.slice(url.indexOf(',') + 1),
      context: `Screenshot of ${tab.title || 'the page'}`,
    };
  }
  const page = await callPage(tab.id, 'text', {});
  const text =
    page.text.length > MAX_PAGE_CHARS
      ? `${page.text.slice(0, MAX_PAGE_CHARS)}\n… truncated`
      : page.text;
  return {
    type: 'text',
    context: `Page: ${page.title || page.url}`,
    text: `Context: the page I have open, "${page.title}" (${page.url})\n${wrapPageContent(checked.site, text)}`,
  };
}
