import { browser } from 'wxt/browser';

const LOAD_TIMEOUT_MS = 30_000;

/** Start listening for the tab to finish loading. Always call `dispose` when done. */
function listenForLoad(tabId: number): { loaded: Promise<void>; dispose: () => void } {
  let onUpdated!: (id: number, change: { status?: string }) => void;
  let timer!: ReturnType<typeof setTimeout>;

  const loaded = new Promise<void>((resolve, reject) => {
    onUpdated = (id, change) => {
      if (id === tabId && change.status === 'complete') resolve();
    };
    timer = setTimeout(
      () => reject(new Error(`Page did not finish loading within ${LOAD_TIMEOUT_MS / 1000}s.`)),
      LOAD_TIMEOUT_MS,
    );
  });
  browser.tabs.onUpdated.addListener(onUpdated);

  return {
    loaded,
    dispose: () => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
    },
  };
}

/** Run `start` (which triggers a navigation) and resolve once the tab reports it finished loading. */
export async function loadPage(tabId: number, start: () => Promise<unknown>): Promise<void> {
  const { loaded, dispose } = listenForLoad(tabId);
  try {
    await start();
    await loaded;
  } finally {
    dispose();
  }
}

/** Resolve once a tab that is already navigating (e.g. just created with a URL) has loaded. */
export async function waitForLoad(tabId: number): Promise<void> {
  const { loaded, dispose } = listenForLoad(tabId);
  try {
    // The load may have finished before the listener was added.
    if ((await browser.tabs.get(tabId)).status === 'complete') return;
    await loaded;
  } finally {
    dispose();
  }
}
