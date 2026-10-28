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

export type TabEntry = {
  id: number;
  title: string;
  url: string;
  inAgentGroup: boolean;
};

/** Every open tab, with whether it is in its window's agent group. */
export async function listTabs(): Promise<TabEntry[]> {
  const tabs = await browser.tabs.query({});
  const groups = new Map<number, number | undefined>();
  for (const { windowId } of tabs) {
    if (!groups.has(windowId)) groups.set(windowId, await findAgentGroupId(windowId));
  }
  return tabs.flatMap((tab) =>
    tab.id === undefined
      ? []
      : [
          {
            id: tab.id,
            title: tab.title ?? '',
            url: tab.url ?? '',
            inAgentGroup: tab.groupId !== -1 && tab.groupId === groups.get(tab.windowId),
          },
        ],
  );
}
