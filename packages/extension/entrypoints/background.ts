import { isExecuteMessage } from '@autochrome/shared';
import { startChatSessions } from '@/src/agent/session';
import { bridge, startBridge } from '@/src/bridge';
import { isBridgeStatusRequest } from '@/src/bridgeSettings';
import { watchDebuggerDetach } from '@/src/debugger';
import { executeTool } from '@/src/executor';

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('autochrome: failed to set side panel behavior', error);
  });

  watchDebuggerDetach();
  startBridge();
  startChatSessions();

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isBridgeStatusRequest(message)) {
      sendResponse(bridge.status);
      return;
    }
    if (!isExecuteMessage(message)) return;
    executeTool(message.call).then(sendResponse);
    return true;
  });
});
