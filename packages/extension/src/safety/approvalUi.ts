import { browser } from 'wxt/browser';
import { approvals } from './approvals';
import { isApprovalAnswer, isApprovalGet, type ApprovalEvent } from './messages';
import type { ApprovalRequest } from './types';

const POPUP_SIZE = { width: 420, height: 360 };

const panels = new Set<Browser.runtime.Port>();
/** Request id to the id of the popup window showing it. */
const popups = new Map<string, number>();

function sendToPanels(event: ApprovalEvent): void {
  for (const port of panels) {
    try {
      port.postMessage(event);
    } catch {
      // The panel is closing; its disconnect handler removes it.
    }
  }
}

async function openPopup(request: ApprovalRequest): Promise<void> {
  const url = `${browser.runtime.getURL('/approve.html')}?id=${request.id}`;
  const popup = await browser.windows.create({ url, type: 'popup', ...POPUP_SIZE });
  if (popup?.id === undefined) return;
  // Answered while the window was opening.
  if (approvals.get(request.id)) popups.set(request.id, popup.id);
  else await browser.windows.remove(popup.id).catch(() => {});
}

function present(request: ApprovalRequest): void {
  if (panels.size > 0) sendToPanels({ type: 'approval_request', request });
  else
    void openPopup(request).catch((error: unknown) =>
      console.error('autochrome: no prompt', error),
    );
}

function dismiss(request: ApprovalRequest): void {
  sendToPanels({ type: 'approval_done', id: request.id });
  const windowId = popups.get(request.id);
  popups.delete(request.id);
  if (windowId !== undefined) void browser.windows.remove(windowId).catch(() => {});
}

/** A side panel that is open shows the prompt inline in the chat; otherwise a popup does. */
export function registerPanel(port: Browser.runtime.Port): void {
  panels.add(port);
  const pending = approvals.current();
  if (pending)
    port.postMessage({ type: 'approval_request', request: pending } satisfies ApprovalEvent);

  port.onDisconnect.addListener(() => {
    panels.delete(port);
    // The prompt was only in the panel that just closed.
    const current = approvals.current();
    if (current && panels.size === 0 && !popups.has(current.id)) present(current);
  });
}

/** Messages from extension pages are the user's own clicks; anything else is ignored. */
export function isExtensionPage(sender: Browser.runtime.MessageSender): boolean {
  return sender.id === browser.runtime.id && !!sender.url?.startsWith(browser.runtime.getURL('/'));
}

/** Handles the approve popup's runtime messages. Returns true when it answered. */
export function handleApprovalMessage(
  message: unknown,
  sender: Browser.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  if (!isApprovalGet(message) && !isApprovalAnswer(message)) return false;
  if (!isExtensionPage(sender)) {
    sendResponse(undefined);
    return true;
  }
  sendResponse(
    isApprovalGet(message)
      ? approvals.get(message.id)
      : approvals.answer(message.id, message.choice),
  );
  return true;
}

export function startApprovalUi(): void {
  approvals.setPresenter({ present, dismiss });
  // Closing the popup without answering is a no.
  browser.windows.onRemoved.addListener((windowId) => {
    for (const [id, popupId] of popups) {
      if (popupId === windowId) {
        popups.delete(id);
        approvals.answer(id, 'deny');
      }
    }
  });
}
