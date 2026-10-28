import { browser } from 'wxt/browser';

let currentTabId: number | undefined;

export function setCurrentTab(tabId: number | undefined): void {
  currentTabId = tabId;
}

export function getCurrentTabId(): number | undefined {
  return currentTabId;
}

const isPageUrl = (url: string | undefined) => /^(https?|file):/.test(url ?? '');

async function exists(tabId: number): Promise<boolean> {
  try {
    await browser.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

/** Explicit tabId, else the current tab, else the active web tab of the last focused window. */
export async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId !== undefined) return tabId;
  if (currentTabId !== undefined && (await exists(currentTabId))) return currentTabId;

  const window = await browser.windows
    .getLastFocused({ windowTypes: ['normal'] })
    .catch(() => null);
  if (window?.id !== undefined) {
    const [active] = await browser.tabs.query({ active: true, windowId: window.id });
    if (active?.id !== undefined && isPageUrl(active.url)) return active.id;
  }
  throw new Error('No target tab. Use tab_open or tab_switch first.');
}
