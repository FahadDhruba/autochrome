import { browser } from 'wxt/browser';
import { callPage } from '../content';
import { frameIdOfToken, mapFrames, spliceFrames } from '../frames';
import { cdp, viewportSize } from '../debugger';
import { resolveTabId } from '../target';
import { text, type ToolHandlers } from './types';

const POLL_INTERVAL_MS = 250;
const MAX_FIND_RESULTS = 20;
const MAX_TEXT_CHARS = 20_000;
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
    const id = await resolveTabId(tabId);
    const children = await mapFrames(id);
    const top = await callPage(id, 'read', { filter });
    if (children.length === 0) return text(top);
    // A frame that fails to answer is left out, not the whole page.
    const trees = await Promise.all(
      children.map(async (f) => [f, await callPage(id, 'read', { filter }, f).catch(() => '')]),
    );
    const read = new Map(trees.filter((t): t is [number, string] => Boolean(t[1])));
    return text(spliceFrames(top, read, (token) => frameIdOfToken(id, token)));
  },

  async find({ query, tabId }) {
    const id = await resolveTabId(tabId);
    const children = await mapFrames(id);
    const results = await Promise.all(
      [0, ...children].map(async (f) => {
        const found = await callPage(id, 'find', { query }, f).catch(() => '');
        if (!found || found.startsWith('No elements match')) return '';
        return f === 0 ? found : found.replace(/\[(e\d+)\]/g, `[f${f}$1]`);
      }),
    );
    const lines = results.filter(Boolean).join('\n').split('\n').filter(Boolean);
    return text(lines.slice(0, MAX_FIND_RESULTS).join('\n') || `No elements match "${query}".`);
  },

  async get_text({ tabId }) {
    const id = await resolveTabId(tabId);
    const children = await mapFrames(id);
    const page = await callPage(id, 'text', {});
    const framed = await Promise.all(
      children.map(async (f) => {
        const inner = await callPage(id, 'text', {}, f).catch(() => undefined);
        return inner?.text ? `\n\n[Frame: ${inner.title || inner.url}]\n${inner.text}` : '';
      }),
    );
    const body = `${page.text}${framed.join('')}`;
    const capped =
      body.length > MAX_TEXT_CHARS ? `${body.slice(0, MAX_TEXT_CHARS)}\n… truncated` : body;
    return text(`Title: ${page.title}\nURL: ${page.url}\n\n${capped}`);
  },

  async screenshot({ tabId }) {
    const id = await resolveTabId(tabId);
    await browser.tabs.update(id, { active: true });
    // The model should see the page, not autochrome's own highlight.
    await callPage(id, 'overlay_hide', {}).catch(() => undefined);
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
