import { useEffect, useRef } from 'react';
import { RUN_ROUTE_KEY, runIdFromHash } from '@/src/schedules/route';

/**
 * Calls `onRun` when something asks the panel to show a run: a `#run=<id>` in the page URL (a
 * notification click that had to open the panel in a tab), or a notification click that opened
 * the real side panel, which leaves the id in session storage.
 */
export function useRunRoute(onRun: (runId: string) => void): void {
  const latest = useRef(onRun);
  useEffect(() => {
    latest.current = onRun;
  });

  useEffect(() => {
    const fromHash = () => {
      const id = runIdFromHash(window.location.hash);
      if (id) latest.current(id);
    };
    const fromSession = (id: unknown) => {
      if (typeof id !== 'string') return;
      latest.current(id);
      void browser.storage.session.remove(RUN_ROUTE_KEY).catch(() => {});
    };

    fromHash();
    void browser.storage.session
      .get(RUN_ROUTE_KEY)
      .then((stored) => fromSession(stored[RUN_ROUTE_KEY]))
      .catch(() => {});

    const onHash = () => fromHash();
    const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && RUN_ROUTE_KEY in changes)
        fromSession(changes[RUN_ROUTE_KEY]?.newValue);
    };
    window.addEventListener('hashchange', onHash);
    browser.storage.onChanged.addListener(onStorage);
    return () => {
      window.removeEventListener('hashchange', onHash);
      browser.storage.onChanged.removeListener(onStorage);
    };
  }, []);
}
