import { isExecuteMessage } from '@autochrome/shared';
import { startChatSessions } from '@/src/agent/session';
import { bridge, startBridge } from '@/src/bridge';
import { isBridgeStatusRequest } from '@/src/bridgeSettings';
import { watchDebugger } from '@/src/debugger';
import { executeTool } from '@/src/executor';
import { handleApprovalMessage, isExtensionPage, startApprovalUi } from '@/src/safety/approvalUi';
import { handleScheduleMessage, startSchedules } from '@/src/schedules/start';
import { handleTestMessage } from '@/src/schedules/testHook';
import { handleRecordMessage, startRecorder } from '@/src/workflows/recorder';

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('autochrome: failed to set side panel behavior', error);
  });

  watchDebugger();
  startBridge();
  startApprovalUi();
  startChatSessions();
  startRecorder();
  startSchedules();

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isBridgeStatusRequest(message)) {
      sendResponse(bridge.status);
      return;
    }
    if (handleApprovalMessage(message, sender, sendResponse)) return;
    if (handleRecordMessage(message, sender, sendResponse)) return true;
    if (handleScheduleMessage(message, sender, sendResponse)) return true;
    // Test hooks (fire a schedule's alarm now) exist only in non-production builds.
    if (import.meta.env.MODE !== 'production' && handleTestMessage(message, sender, sendResponse)) {
      return true;
    }
    if (!isExecuteMessage(message)) return;
    // Only the extension's own pages (the debug page) run ungated; a content script never does.
    if (!isExtensionPage(sender)) {
      sendResponse({
        id: message.call.id,
        ok: false,
        content: [{ type: 'text', text: 'Only extension pages may run tools directly.' }],
      });
      return;
    }
    executeTool(message.call, { source: 'debug' }).then(sendResponse);
    return true;
  });
});
