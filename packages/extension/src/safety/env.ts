import { browser } from 'wxt/browser';
import { callPage } from '../content';
import { findAgentGroupId } from '../tabGroup';
import { formatTabContext } from '../tabContext';
import { resolveTabId } from '../target';
import type { GateEnv, TabInfo } from './gate';
import { siteOf } from './origin';
import { loadSafety } from './settings';

async function tabInfo(tabId: number | undefined): Promise<TabInfo> {
  const id = await resolveTabId(tabId);
  const tab = await browser.tabs.get(id);
  const agentGroup = tab.groupId === -1 ? undefined : await findAgentGroupId(tab.windowId);
  return {
    id,
    url: tab.url ?? '',
    title: tab.title ?? '',
    inAgentGroup: agentGroup !== undefined && tab.groupId === agentGroup,
  };
}

export const gateEnv: GateEnv = {
  loadSafety,
  tab: tabInfo,
  describe: (tabId, target) => callPage(tabId, 'describe', target),
};

/** The site of the tab a page-reading tool just read, for the `<page_content>` wrapper. */
export async function pageSite(tabId: number | undefined): Promise<string> {
  const { url } = await tabInfo(tabId);
  return siteOf(url) ?? 'unknown';
}

/** The `[tab id · title · url]` line for the tab a tool just acted on. */
export async function tabContext(tabId: number | undefined): Promise<string> {
  return formatTabContext(await tabInfo(tabId));
}
