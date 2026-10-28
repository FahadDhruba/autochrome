import { browser } from 'wxt/browser';

const PROTOCOL_VERSION = '1.3';
const attached = new Set<number>();

/** Call once from the background: forget tabs that closed or whose banner the user cancelled. */
export function watchDebuggerDetach(): void {
  browser.debugger.onDetach.addListener(({ tabId }) => {
    if (tabId !== undefined) attached.delete(tabId);
  });
  browser.tabs.onRemoved.addListener((tabId) => attached.delete(tabId));
}

async function ensureAttached(tabId: number): Promise<void> {
  if (attached.has(tabId)) return;
  try {
    await browser.debugger.attach({ tabId }, PROTOCOL_VERSION);
  } catch (error) {
    // After a service worker restart Chrome keeps the attachment we no longer remember.
    if (!(error instanceof Error && error.message.includes('already attached'))) throw error;
  }
  attached.add(tabId);
}

/** Send a CDP command, attaching to the tab on first use and re-attaching after a detach. */
export async function cdp<T = unknown>(tabId: number, method: string, params?: object): Promise<T> {
  await ensureAttached(tabId);
  try {
    return (await browser.debugger.sendCommand({ tabId }, method, params)) as T;
  } catch (error) {
    if (!(error instanceof Error && error.message.includes('not attached'))) throw error;
    attached.delete(tabId);
    await ensureAttached(tabId);
    return (await browser.debugger.sendCommand({ tabId }, method, params)) as T;
  }
}

/** Viewport size in CSS px, the unit of every x/y the tools accept. */
export async function viewportSize(tabId: number): Promise<{ width: number; height: number }> {
  const { result } = await cdp<{ result: { value: { width: number; height: number } } }>(
    tabId,
    'Runtime.evaluate',
    {
      expression: '({ width: innerWidth, height: innerHeight })',
      returnByValue: true,
    },
  );
  return result.value;
}
