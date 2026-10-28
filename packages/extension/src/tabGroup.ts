import { browser } from 'wxt/browser';

const GROUP_TITLE = 'autochrome';

export async function findAgentGroupId(windowId: number): Promise<number | undefined> {
  const [group] = await browser.tabGroups.query({ windowId, title: GROUP_TITLE });
  return group?.id;
}

/** Put the tab in the window's `autochrome` group, creating the group if needed. */
export async function addToAgentGroup(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  const groupId = await findAgentGroupId(tab.windowId);
  if (groupId !== undefined) {
    if (tab.groupId !== groupId) await browser.tabs.group({ tabIds: [tabId], groupId });
    return;
  }
  const created = await browser.tabs.group({
    tabIds: [tabId],
    createProperties: { windowId: tab.windowId },
  });
  await browser.tabGroups.update(created, { title: GROUP_TITLE, color: 'cyan' });
}
