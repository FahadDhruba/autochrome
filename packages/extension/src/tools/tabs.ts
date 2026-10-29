import { browser } from 'wxt/browser';
import { cdp } from '../debugger';
import { loadPage, waitForLoad } from '../navigation';
import { addToAgentGroup, listTabs } from '../tabGroup';
import { getCurrentTabId, resolveTabId, setCurrentTab } from '../target';
import { text, type ToolHandlers } from './types';

async function describeTab(tabId: number): Promise<string> {
  const tab = await browser.tabs.get(tabId);
  return `${tab.title ?? ''} (${tab.url ?? ''})`;
}

type NavigationHistory = { currentIndex: number; entries: { id: number }[] };

/**
 * tabs.goBack/goForward skip entries that were created without a user gesture (Chrome's
 * "skippable history" intervention), which is every entry we create. CDP does not skip them.
 */
async function goInHistory(tabId: number, delta: -1 | 1): Promise<void> {
  const { currentIndex, entries } = await cdp<NavigationHistory>(
    tabId,
    'Page.getNavigationHistory',
  );
  const entry = entries[currentIndex + delta];
  if (!entry) throw new Error(`No ${delta < 0 ? 'previous' : 'next'} page in history.`);
  await cdp(tabId, 'Page.navigateToHistoryEntry', { entryId: entry.id });
}

async function finishNavigation(tabId: number, verb: string): Promise<string> {
  return `${verb} ${await describeTab(tabId)}`;
}

export const tabHandlers: Pick<
  ToolHandlers,
  'tabs_list' | 'tab_open' | 'tab_switch' | 'tab_close' | 'navigate' | 'go_back' | 'go_forward'
> = {
  async tabs_list({ agentOnly }) {
    const current = getCurrentTabId();
    const lines = (await listTabs())
      .filter((tab) => !agentOnly || tab.inAgentGroup)
      .map((tab) => {
        const marks = [tab.id === current ? 'current' : '', tab.inAgentGroup ? 'agent' : ''].filter(
          Boolean,
        );
        const suffix = marks.length ? ` [${marks.join(', ')}]` : '';
        return `${tab.id} · ${tab.title} · ${tab.url}${suffix}`;
      });
    return text(lines.join('\n') || 'No tabs open.');
  },

  async tab_open({ url, background }) {
    // Open straight at the URL: navigating a blank tab afterwards races with the blank page's own load.
    const tab = await browser.tabs.create({ active: !background, url });
    const tabId = tab.id!;
    await addToAgentGroup(tabId);
    if (!background) setCurrentTab(tabId);
    const where = background ? ' in the background' : '';
    if (!url) return text(`Opened tab ${tabId}${where}.`);
    await waitForLoad(tabId);
    return text(`Opened tab ${tabId}${where}: ${await describeTab(tabId)}`);
  },

  async tab_switch({ tabId }) {
    const tab = await browser.tabs.update(tabId, { active: true });
    await browser.windows.update(tab!.windowId, { focused: true });
    await addToAgentGroup(tabId);
    setCurrentTab(tabId);
    return text(`Switched to tab ${tabId}: ${await describeTab(tabId)}`);
  },

  async tab_close({ tabId }) {
    await browser.tabs.remove(tabId);
    if (getCurrentTabId() === tabId) setCurrentTab(undefined);
    return text(`Closed tab ${tabId}.`);
  },

  async navigate({ url, tabId }) {
    const id = await resolveTabId(tabId);
    await loadPage(id, () => browser.tabs.update(id, { url }));
    return text(await finishNavigation(id, 'Loaded'));
  },

  async go_back({ tabId }) {
    const id = await resolveTabId(tabId);
    await loadPage(id, () => goInHistory(id, -1));
    return text(await finishNavigation(id, 'Went back to'));
  },

  async go_forward({ tabId }) {
    const id = await resolveTabId(tabId);
    await loadPage(id, () => goInHistory(id, 1));
    return text(await finishNavigation(id, 'Went forward to'));
  },
};
