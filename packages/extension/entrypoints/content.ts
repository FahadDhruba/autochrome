import { handlePageMessage } from '@/src/page/dispatch';
import { startFrameRegistry } from '@/src/page/frames';
import type { PageMessage } from '@/src/page/messages';

// Injected on demand by the background worker, into every frame, and maybe more than once.
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    const scope = globalThis as { __autochromeReady?: boolean };
    if (scope.__autochromeReady) return;
    scope.__autochromeReady = true;
    startFrameRegistry();

    browser.runtime.onMessage.addListener((message: PageMessage, _sender, sendResponse) => {
      if (message?.type !== 'autochrome:page') return;
      sendResponse(handlePageMessage(message));
    });
  },
});
