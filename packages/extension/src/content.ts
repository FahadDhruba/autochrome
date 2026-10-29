import { browser } from 'wxt/browser';
import type { PageOp, PageRequests, PageResponse, PageResults } from './page/messages';

const CONTENT_SCRIPT = '/content-scripts/content.js';

/** Run an operation in the tab's content script, injecting it first (a repeat inject is a no-op). */
export async function callPage<Op extends PageOp>(
  tabId: number,
  op: Op,
  args: PageRequests[Op],
): Promise<PageResults[Op]> {
  await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
  const response = (await browser.tabs.sendMessage(
    tabId,
    { type: 'autochrome:page', op, args },
    { frameId: 0 },
  )) as PageResponse<PageResults[Op]> | undefined;
  if (!response) throw new Error('The page did not respond.');
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
