import { browser } from 'wxt/browser';
import type { Workflow } from '@autochrome/shared';
import { callPage } from '../content';
import { saveWorkflow } from './store';
import { isExtensionPage } from '../safety/approvalUi';
import {
  addEvent,
  addNavigation,
  newRecording,
  isRecordControl,
  isRecordMessage,
  RECORDING_KEY,
  type RecordControl,
  type RecordControlResult,
  type RecordEvent,
  type RecordingState,
} from './recording';

// Events arrive from the page one by one; each updates the saved state, so they must not overlap.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task);
  queue = next.catch(() => undefined);
  return next;
}

/** In session storage, so the panel can watch it and a restarted worker still has it. */
export async function loadRecording(): Promise<RecordingState | undefined> {
  const stored = await browser.storage.session.get(RECORDING_KEY);
  return stored[RECORDING_KEY] as RecordingState | undefined;
}

const saveRecording = (state: RecordingState): Promise<void> =>
  browser.storage.session.set({ [RECORDING_KEY]: state });

const clearRecording = (): Promise<void> => browser.storage.session.remove(RECORDING_KEY);

const isPageUrl = (url: string | undefined) => /^(https?|file):/.test(url ?? '');

/** The active web page of the window the user last used. */
async function activeWebTab(): Promise<Browser.tabs.Tab> {
  const window = await browser.windows
    .getLastFocused({ windowTypes: ['normal'] })
    .catch(() => null);
  if (window?.id !== undefined) {
    const [tab] = await browser.tabs.query({ active: true, windowId: window.id });
    if (tab?.id !== undefined && isPageUrl(tab.url)) return tab;
  }
  throw new Error('Open the page you want to record in a tab first.');
}

/** The content script reports from the page; a reload or a new page needs it started again. */
async function injectRecorder(tabId: number): Promise<void> {
  await callPage(tabId, 'record_start', {}).catch(() => {});
}

export function startRecording(tabId?: number): Promise<RecordingState> {
  return serial(async () => {
    if (await loadRecording()) throw new Error('A recording is already in progress.');
    const tab = tabId === undefined ? await activeWebTab() : await browser.tabs.get(tabId);
    if (tab.id === undefined || !isPageUrl(tab.url))
      throw new Error('This page cannot be recorded.');
    const state = newRecording(tab.id, tab.url!, Date.now());
    await saveRecording(state);
    await callPage(tab.id, 'record_start', {});
    return state;
  });
}

export function recordEvent(event: RecordEvent, tabId: number | undefined): Promise<void> {
  return serial(async () => {
    const state = await loadRecording();
    if (!state || state.tabId !== tabId) return;
    await saveRecording(addEvent(state, event, Date.now()));
  });
}

async function onTabUpdated(
  tabId: number,
  change: { status?: string },
  tab: { url?: string },
): Promise<void> {
  if (change.status !== 'complete') return;
  const state = await loadRecording();
  if (state?.tabId !== tabId || !isPageUrl(tab.url)) return;
  await serial(async () => {
    const current = await loadRecording();
    if (current?.tabId === tabId) await saveRecording(addNavigation(current, tab.url!, Date.now()));
  });
  await injectRecorder(tabId);
}

/** Finishes the recording and saves it as a workflow. */
export async function stopRecording(): Promise<Workflow> {
  const before = await loadRecording();
  if (!before) throw new Error('No recording in progress.');
  // Ask the page for any typing it has not reported yet, then let those messages arrive.
  await callPage(before.tabId, 'record_stop', {}).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 150));

  return serial(async () => {
    const state = (await loadRecording()) ?? before;
    const host = new URL(state.lastUrl).host || 'a page';
    const workflow: Workflow = {
      id: crypto.randomUUID(),
      name: `Recorded on ${host}`,
      variables: state.variables,
      steps: state.steps,
      createdFrom: 'recording',
      updatedAt: Date.now(),
    };
    await saveWorkflow(workflow);
    await clearRecording();
    return workflow;
  });
}

export async function cancelRecording(): Promise<void> {
  const state = await loadRecording();
  if (state) await callPage(state.tabId, 'record_stop', {}).catch(() => {});
  await serial(clearRecording);
}

export function startRecorder(): void {
  browser.tabs.onUpdated.addListener((tabId, change, tab) => void onTabUpdated(tabId, change, tab));
}

async function control(message: RecordControl): Promise<RecordControlResult> {
  try {
    if (message.action === 'start') {
      await startRecording(message.tabId);
      return { ok: true };
    }
    if (message.action === 'stop') return { ok: true, workflowId: (await stopRecording()).id };
    await cancelRecording();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Handles the runtime messages of recording. Returns true when it will answer asynchronously. */
export function handleRecordMessage(
  message: unknown,
  sender: Browser.runtime.MessageSender,
  sendResponse: (response: RecordControlResult) => void,
): boolean {
  if (isRecordMessage(message)) {
    // From a content script: only the recorded tab's page counts.
    if (sender.id === browser.runtime.id) void recordEvent(message.event, sender.tab?.id);
    return false;
  }
  if (!isRecordControl(message)) return false;
  if (!isExtensionPage(sender)) {
    sendResponse({ ok: false, error: 'Only extension pages may control recording.' });
    return false;
  }
  void control(message).then(sendResponse);
  return true;
}
