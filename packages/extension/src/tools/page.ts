import { browser } from 'wxt/browser';
import { callPage } from '../content';
import { cdp, viewportSize } from '../debugger';
import { resolveTabId } from '../target';
import { text, type ToolHandlers } from './types';

const POLL_INTERVAL_MS = 250;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForText(tabId: number, needle: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await callPage(tabId, 'has_text', { text: needle }))) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for text "${needle}".`);
    await sleep(POLL_INTERVAL_MS);
  }
}

export const pageHandlers: Pick<
  ToolHandlers,
  'read_page' | 'find' | 'get_text' | 'screenshot' | 'wait'
> = {
  async read_page({ filter, tabId }) {
    return text(await callPage(await resolveTabId(tabId), 'read', { filter }));
  },

  async find({ query, tabId }) {
    return text(await callPage(await resolveTabId(tabId), 'find', { query }));
  },

  async get_text({ tabId }) {
    const page = await callPage(await resolveTabId(tabId), 'text', {});
    return text(`Title: ${page.title}\nURL: ${page.url}\n\n${page.text}`);
  },

  async screenshot({ tabId }) {
    const id = await resolveTabId(tabId);
    await browser.tabs.update(id, { active: true });
    const { width, height } = await viewportSize(id);
    const { data } = await cdp<{ data: string }>(id, 'Page.captureScreenshot', {
      format: 'jpeg',
      quality: 80,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    return [{ type: 'image', data, mimeType: 'image/jpeg' }];
  },

  async wait({ ms, text: needle, timeoutMs, tabId }) {
    if (ms) await sleep(ms);
    if (needle !== undefined) await waitForText(await resolveTabId(tabId), needle, timeoutMs);
    return text(needle === undefined ? `Waited ${ms}ms.` : `Found text "${needle}".`);
  },
};
