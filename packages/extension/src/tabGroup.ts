import { browser } from 'wxt/browser';
import type { ToolSource } from './safety/types';

const GROUP_TITLE = 'autochrome';
const SCHEDULE_GROUP_PREFIX = `${GROUP_TITLE} · `;

/** The tab group a schedule's run works in. */
export const scheduleGroupTitle = (scheduleName: string): string =>
  `${SCHEDULE_GROUP_PREFIX}${scheduleName}`;

const isAgentGroupTitle = (title: string | undefined): boolean =>
  title === GROUP_TITLE || (title?.startsWith(SCHEDULE_GROUP_PREFIX) ?? false);

// Only one scheduled run works at a time, and only its own tool calls (source `scheduled`) use it.
let scheduledTitle: string | undefined;

/** Sets the group that tabs opened by scheduled tool calls go in; undefined when no run is going. */
export function setScheduledGroupTitle(title: string | undefined): void {
  scheduledTitle = title;
}

export async function findAgentGroupId(
  windowId: number,
  title = GROUP_TITLE,
): Promise<number | undefined> {
  const [group] = await browser.tabGroups.query({ windowId, title });
  return group?.id;
}

/** Whether the group is one of ours: the agent's group or a schedule's. */
export async function isAgentGroup(groupId: number): Promise<boolean> {
  if (groupId === -1) return false;
  try {
    return isAgentGroupTitle((await browser.tabGroups.get(groupId)).title);
  } catch {
    return false;
  }
}

/**
 * Put the tab in the window's `autochrome` group, creating the group if needed. A scheduled call
 * uses the group of its schedule (`autochrome · <name>`) instead.
 */
export async function addToAgentGroup(tabId: number, source?: ToolSource): Promise<void> {
  const title = source === 'scheduled' && scheduledTitle ? scheduledTitle : GROUP_TITLE;
  const tab = await browser.tabs.get(tabId);
  const groupId = await findAgentGroupId(tab.windowId, title);
  if (groupId !== undefined) {
    if (tab.groupId !== groupId) await browser.tabs.group({ tabIds: [tabId], groupId });
    return;
  }
  const created = await browser.tabs.group({
    tabIds: [tabId],
    createProperties: { windowId: tab.windowId },
  });
  await browser.tabGroups.update(created, {
    title,
    color: title === GROUP_TITLE ? 'cyan' : 'orange',
  });
}

/** Closes every tab in the groups with this title, in all windows. */
export async function closeGroupTabs(title: string): Promise<void> {
  const groups = await browser.tabGroups.query({ title });
  for (const group of groups) {
    const tabs = await browser.tabs.query({ groupId: group.id });
    const ids = tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
    if (ids.length > 0) await browser.tabs.remove(ids).catch(() => {});
  }
}

export type TabEntry = {
  id: number;
  title: string;
  url: string;
  inAgentGroup: boolean;
};

/** Every open tab, with whether it is in one of the agent's groups. */
export async function listTabs(): Promise<TabEntry[]> {
  const tabs = await browser.tabs.query({});
  const agent = new Map<number, boolean>();
  for (const { groupId } of tabs) {
    if (!agent.has(groupId)) agent.set(groupId, await isAgentGroup(groupId));
  }
  return tabs.flatMap((tab) =>
    tab.id === undefined
      ? []
      : [
          {
            id: tab.id,
            title: tab.title ?? '',
            url: tab.url ?? '',
            inAgentGroup: agent.get(tab.groupId) ?? false,
          },
        ],
  );
}
