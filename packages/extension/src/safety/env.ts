import { browser } from 'wxt/browser';
import { callPage } from '../content';
import { isAgentGroup } from '../tabGroup';
import { formatTabContext } from '../tabContext';
import { resolveTabId } from '../target';
import type { GateEnv, TabInfo } from './gate';
import { siteOf } from './origin';
import { loadSafety } from './settings';

async function tabInfo(tabId: number | undefined): Promise<TabInfo> {
  const id = await resolveTabId(tabId);
  const tab = await browser.tabs.get(id);
  return {
    id,
    url: tab.url ?? '',
    title: tab.title ?? '',
    inAgentGroup: await isAgentGroup(tab.groupId),
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
