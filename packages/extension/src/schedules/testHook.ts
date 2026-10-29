import { isExtensionPage } from '../safety/approvalUi';
import { fireSchedule, resumeSchedules } from './start';
import { openRun } from './notify';

/**
 * Test-only hooks for the e2e suite, compiled out of production builds (see background.ts):
 * Playwright cannot wait for real alarms, so these run the alarm handler and the notification
 * click handler on demand. Like the debug page, they only answer extension pages.
 */
export const TEST_FIRE_MESSAGE = 'autochrome:test-fire-schedule';
export const TEST_CLICK_MESSAGE = 'autochrome:test-click-notification';
/** What happens when the browser starts: recreate the alarms, catch up on overdue schedules. */
export const TEST_RESUME_MESSAGE = 'autochrome:test-resume';

export function handleTestMessage(
  message: unknown,
  sender: Browser.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  const m = message as { type?: unknown; id?: unknown; runId?: unknown } | null;
  const known = [TEST_FIRE_MESSAGE, TEST_CLICK_MESSAGE, TEST_RESUME_MESSAGE];
  if (typeof m?.type !== 'string' || !known.includes(m.type)) return false;
  if (!isExtensionPage(sender)) {
    sendResponse(undefined);
    return true;
  }
  if (m.type === TEST_FIRE_MESSAGE && typeof m.id === 'string') {
    void fireSchedule(m.id, 'test-alarm').then((outcome) =>
      sendResponse(
        outcome.ran
          ? { ran: true, runId: outcome.run.id, status: outcome.run.status }
          : { ran: false, reason: outcome.reason },
      ),
    );
  } else if (m.type === TEST_CLICK_MESSAGE && typeof m.runId === 'string') {
    void openRun(m.runId).then(sendResponse);
  } else if (m.type === TEST_RESUME_MESSAGE) {
    void resumeSchedules().then(() => sendResponse(true));
  } else {
    sendResponse(undefined);
  }
  return true;
}
