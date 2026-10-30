import { browser } from 'wxt/browser';
import { cdp } from '../debugger';
import { loadPage, waitForLoad } from '../navigation';
import { addToAgentGroup, listTabs } from '../tabGroup';
import { findTargetTabId, getCurrentTabId, resolveTabId, setCurrentTab } from '../target';
import type { ToolSource } from '../safety/types';
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

/** Opens a tab in the agent group and, unless in the background, makes it the current tab. */
async function openAgentTab(
  url: string | undefined,
  background: boolean,
  source: ToolSource,
): Promise<string> {
  // Open straight at the URL: navigating a blank tab afterwards races with the blank page's own load.
  const tab = await browser.tabs.create({ active: !background, url });
  const tabId = tab.id!;
  await addToAgentGroup(tabId, source);
  if (!background) setCurrentTab(tabId);
  const where = background ? ' in the background' : '';
  if (!url) return `Opened tab ${tabId}${where}.`;
  await waitForLoad(tabId);
  return `Opened tab ${tabId}${where}: ${await describeTab(tabId)}`;
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

  async tab_open({ url, background }, { source }) {
    return text(await openAgentTab(url, background, source));
  },

  async tab_switch({ tabId }, { source }) {
    const tab = await browser.tabs.update(tabId, { active: true });
    await browser.windows.update(tab!.windowId, { focused: true });
    await addToAgentGroup(tabId, source);
    setCurrentTab(tabId);
    return text(`Switched to tab ${tabId}: ${await describeTab(tabId)}`);
  },

  async tab_close({ tabId }) {
    await browser.tabs.remove(tabId);
    if (getCurrentTabId() === tabId) setCurrentTab(undefined);
    return text(`Closed tab ${tabId}.`);
  },

  async navigate({ url, tabId }, { source }) {
    // With no tab to navigate yet (a fresh task), open one rather than fail the model's first step.
    const id = tabId ?? (await findTargetTabId());
    if (id === undefined) return text(await openAgentTab(url, false, source));
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
