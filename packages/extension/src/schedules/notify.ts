import { browser } from 'wxt/browser';
import type { RunResult } from '../workflows/types';
import { RUN_ROUTE_KEY, runHash } from './route';

const MESSAGE_LENGTH = 200;
const NOTIFICATION_PREFIX = 'run:';

const shorten = (text: string, length = MESSAGE_LENGTH): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

/** The notification for a finished run: "✓ <name> finished" or "✗ <name> failed at step 3". */
export function notificationFor(run: RunResult): { title: string; message: string } {
  const name = run.scheduleName || run.workflowName;
  const seconds = ((run.finishedAt - run.startedAt) / 1000).toFixed(1);
  if (run.status === 'ok' || run.status === 'repaired') {
    const repaired = run.status === 'repaired' ? ' The AI repaired a step.' : '';
    const detail =
      run.kind === 'prompt'
        ? run.summary || `Finished in ${seconds}s.`
        : `${run.steps.length} step${run.steps.length === 1 ? '' : 's'} in ${seconds}s.${repaired}`;
    return { title: `✓ ${name} finished`, message: shorten(detail) };
  }
  const failed = run.steps.find((step) => step.status === 'failed');
  const where = run.kind !== 'prompt' && failed ? ` at step ${failed.index + 1}` : '';
  const reason = failed?.error ?? run.error ?? 'The run did not finish.';
  return { title: `✗ ${name} failed${where}`, message: shorten(reason) };
}

/** One Chrome notification per run, with the result. Needs the `notifications` permission. */
export async function showRunNotification(run: RunResult): Promise<void> {
  const { title, message } = notificationFor(run);
  await browser.notifications.create(`${NOTIFICATION_PREFIX}${run.id}`, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title,
    message,
  });
}

export const runIdOfNotification = (id: string): string | undefined =>
  id.startsWith(NOTIFICATION_PREFIX) ? id.slice(NOTIFICATION_PREFIX.length) : undefined;

export type OpenRunDeps = {
  focusedWindowId: () => Promise<number | undefined>;
  setRoute: (runId: string | undefined) => Promise<void>;
  openSidePanel: (windowId: number) => Promise<void>;
  openTab: (url: string) => Promise<void>;
  pageUrl: string;
};

const defaultOpenDeps = (): OpenRunDeps => ({
  focusedWindowId: async () => (await browser.windows.getLastFocused()).id,
  setRoute: async (runId) => {
    if (runId === undefined) await browser.storage.session.remove(RUN_ROUTE_KEY);
    else await browser.storage.session.set({ [RUN_ROUTE_KEY]: runId });
  },
  openSidePanel: (windowId) => browser.sidePanel.open({ windowId }),
  openTab: async (url) => void (await browser.tabs.create({ url })),
  pageUrl: browser.runtime.getURL('/sidepanel.html'),
});

/**
 * Shows a run in the side panel. Opening the panel needs a user gesture, which a notification
 * click counts as in recent Chrome; when Chrome refuses, the same run opens in a tab instead.
 */
export async function openRun(
  runId: string,
  deps: OpenRunDeps = defaultOpenDeps(),
): Promise<'panel' | 'tab'> {
  try {
    const windowId = await deps.focusedWindowId();
    if (windowId === undefined) throw new Error('No window.');
    await deps.setRoute(runId);
    await deps.openSidePanel(windowId);
    return 'panel';
  } catch {
    await deps.setRoute(undefined).catch(() => {});
    await deps.openTab(`${deps.pageUrl}${runHash(runId)}`);
    return 'tab';
  }
}
