import { browser } from 'wxt/browser';
import { ensureAttached } from './debugger';
import { describeDialog, openDialog } from './dialogs';
import type { PageOp, PageRequests, PageResponse, PageResults } from './page/messages';

export const CONTENT_SCRIPT = '/content-scripts/content.js';
const PAGE_TIMEOUT_MS = 8000;

/**
 * A page that does not answer is usually frozen by a dialog the debugger has not seen yet (it
 * only sees dialogs once attached), so attach and look before giving up.
 */
async function noResponse(tabId: number): Promise<never> {
  await ensureAttached(tabId).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const dialog = openDialog(tabId);
  throw new Error(dialog ? describeDialog(dialog) : 'The page did not respond.');
}

function withTimeout<T>(work: Promise<T>, tabId: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => noResponse(tabId).catch(reject), PAGE_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Run an operation in the tab's content script, injecting it first (a repeat inject is a no-op). */
export async function callPage<Op extends PageOp>(
  tabId: number,
  op: Op,
  args: PageRequests[Op],
  frameId = 0,
): Promise<PageResults[Op]> {
  const response = (await withTimeout(
    (async () => {
      await browser.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: [CONTENT_SCRIPT],
      });
      return browser.tabs.sendMessage(tabId, { type: 'autochrome:page', op, args }, { frameId });
    })(),
    tabId,
  )) as PageResponse<PageResults[Op]> | undefined;
  if (!response) throw new Error('The page did not respond.');
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
