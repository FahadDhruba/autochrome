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

/** The current tab, else the active web tab of the last focused window, else undefined. */
export async function findTargetTabId(): Promise<number | undefined> {
  if (currentTabId !== undefined && (await exists(currentTabId))) return currentTabId;

  const window = await browser.windows
    .getLastFocused({ windowTypes: ['normal'] })
    .catch(() => null);
  if (window?.id !== undefined) {
    const [active] = await browser.tabs.query({ active: true, windowId: window.id });
    if (active?.id !== undefined && isPageUrl(active.url)) return active.id;
  }
  return undefined;
}

/** Explicit tabId, else the default target tab; throws when there is none. */
export async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId !== undefined) return tabId;
  const target = await findTargetTabId();
  if (target === undefined) throw new Error('No target tab. Use tab_open or tab_switch first.');
  return target;
}
