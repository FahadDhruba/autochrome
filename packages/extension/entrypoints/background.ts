import { isExecuteMessage } from '@autochrome/shared';
import { startChatSessions } from '@/src/agent/session';
import { bridge, startBridge } from '@/src/bridge';
import { isBridgeStatusRequest } from '@/src/bridgeSettings';
import { watchDebuggerDetach } from '@/src/debugger';
import { executeTool } from '@/src/executor';
import { handleApprovalMessage, isExtensionPage, startApprovalUi } from '@/src/safety/approvalUi';

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('autochrome: failed to set side panel behavior', error);
  });

  watchDebuggerDetach();
  startBridge();
  startApprovalUi();
  startChatSessions();

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isBridgeStatusRequest(message)) {
      sendResponse(bridge.status);
      return;
    }
    if (handleApprovalMessage(message, sender, sendResponse)) return;
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
