import { browser } from 'wxt/browser';
import { truncate } from './capture/limits';
import { captureOf, startCapture, stopCapture, type TabCapture } from './capture/buffers';

const PROTOCOL_VERSION = '1.3';
const MAX_INSPECTED_CHARS = 500;
const attached = new Set<number>();

const INSPECT_FUNCTION = `function () {
  try { return JSON.stringify(this); } catch { return String(this); }
}`;

/** Prints a console argument as JSON, so `console.log({ a: 1 })` reads as `{"a":1}`. */
async function inspectObject(tabId: number, objectId: string): Promise<string | undefined> {
  const send = (method: string, params: object) =>
    browser.debugger.sendCommand({ tabId }, method, params);
  try {
    const { result } = (await send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: INSPECT_FUNCTION,
      returnByValue: true,
    })) as { result: { value?: unknown } };
    return typeof result.value === 'string'
      ? truncate(result.value, MAX_INSPECTED_CHARS)
      : undefined;
  } finally {
    await send('Runtime.releaseObject', { objectId }).catch(() => {});
  }
}

const beginCapture = (tabId: number) =>
  startCapture(tabId, (objectId) => inspectObject(tabId, objectId));

const CAPTURE_DOMAINS = ['Runtime', 'Log', 'Network'];

function forget(tabId: number): void {
  attached.delete(tabId);
  stopCapture(tabId);
}

/**
 * Call once from the background: forget tabs that closed or whose banner the user cancelled, and
 * route console and network events into the tab's capture buffers.
 */
export function watchDebugger(): void {
  browser.debugger.onDetach.addListener(({ tabId }) => {
    if (tabId !== undefined) forget(tabId);
  });
  browser.tabs.onRemoved.addListener(forget);
  browser.debugger.onEvent.addListener(({ tabId }, method, params) => {
    if (tabId !== undefined) captureOf(tabId)?.handleEvent(method, params);
  });
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
  // The buffer exists before the domains are enabled so no early event is lost.
  beginCapture(tabId);
  await Promise.all(
    CAPTURE_DOMAINS.map((domain) => browser.debugger.sendCommand({ tabId }, `${domain}.enable`)),
  );
}

/** The tab's console and network buffers, attaching the debugger first if needed. */
export async function captureFor(tabId: number): Promise<TabCapture> {
  await ensureAttached(tabId);
  return beginCapture(tabId);
}

/** Send a CDP command, attaching to the tab on first use and re-attaching after a detach. */
export async function cdp<T = unknown>(tabId: number, method: string, params?: object): Promise<T> {
  await ensureAttached(tabId);
  try {
    return (await browser.debugger.sendCommand({ tabId }, method, params)) as T;
  } catch (error) {
    if (!(error instanceof Error && error.message.includes('not attached'))) throw error;
    forget(tabId);
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
