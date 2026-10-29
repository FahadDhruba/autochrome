import { browser } from 'wxt/browser';
import {
  clearAlarm,
  overdueSchedules,
  scheduleIdOfAlarm,
  syncAlarm,
  syncAllAlarms,
} from './alarms';
import { isExtensionPage } from '../safety/approvalUi';
import { isRunNowMessage, type RunNowResponse } from './messages';
import { openRun, runIdOfNotification } from './notify';
import { createRunner, type RunMode, type RunOutcome } from './runner';
import { scheduleStore } from './store';
import type { Schedule } from './types';

export const runner = createRunner();

/** Run each schedule that came due while the browser was closed once, then set the alarms. */
export async function resumeSchedules(now = Date.now()): Promise<void> {
  const schedules = await scheduleStore.list();
  await syncAllAlarms(schedules);
  // Each run moves its schedule's next time forward first, so a missed week is still one run.
  for (const schedule of overdueSchedules(schedules, now)) void runner.run(schedule.id, 'alarm');
}

/** Fires a schedule as its alarm would; resolves when the run is over. */
export const fireSchedule = (id: string, mode: RunMode = 'alarm'): Promise<RunOutcome> =>
  runner.run(id, mode);

const respond = (outcome: RunOutcome): RunNowResponse =>
  outcome.ran
    ? { ran: true, runId: outcome.run.id, status: outcome.run.status }
    : { ran: false, reason: outcome.reason };

/** "Run now" from the side panel. Returns true when it handled the message. */
export function handleScheduleMessage(
  message: unknown,
  sender: Browser.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  if (!isRunNowMessage(message)) return false;
  // Web pages and content scripts cannot start runs; only the extension's own pages can.
  if (!isExtensionPage(sender)) {
    sendResponse({ ran: false, reason: 'Only extension pages may run schedules.' });
    return true;
  }
  void fireSchedule(message.id, 'now').then((outcome) => sendResponse(respond(outcome)));
  return true;
}

/** Alarms, catch-up on start, keeping alarms in step with edits, and notification clicks. */
export function startSchedules(): void {
  browser.alarms.onAlarm.addListener((alarm) => {
    const id = scheduleIdOfAlarm(alarm.name);
    if (id !== undefined) void fireSchedule(id);
  });

  browser.runtime.onStartup.addListener(() => void resumeSchedules());
  browser.runtime.onInstalled.addListener(() => void resumeSchedules());

  // The side panel saves schedules straight to storage; the alarms follow.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith('schedule:') || key === 'schedule:index') continue;
      const id = key.slice('schedule:'.length);
      const schedule = change.newValue as Schedule | undefined;
      void (schedule ? syncAlarm(schedule) : clearAlarm(id)).catch(() => {});
    }
  });

  browser.notifications.onClicked.addListener((notificationId) => {
    const runId = runIdOfNotification(notificationId);
    if (runId === undefined) return;
    void browser.notifications.clear(notificationId);
    void openRun(runId);
  });
}
