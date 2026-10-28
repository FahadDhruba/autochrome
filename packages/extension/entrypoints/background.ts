import { isExecuteMessage } from '@autochrome/shared';
import { watchDebuggerDetach } from '@/src/debugger';
import { executeTool } from '@/src/executor';

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('autochrome: failed to set side panel behavior', error);
  });

  watchDebuggerDetach();

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExecuteMessage(message)) return;
    executeTool(message.call).then(sendResponse);
    return true;
  });
});
