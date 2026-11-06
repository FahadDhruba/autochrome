import { useEffect, useRef } from 'react';
import { PENDING_PROMPT_KEY, type PendingPrompt } from '@/src/contextMenu';

/** A right-click older than this was not meant for a panel opened now. */
const MAX_AGE_MS = 60_000;

/** Takes the prompt a right-click left for the panel, once, and hands it to `use`. */
export function usePendingPrompt(use: (text: string) => void): void {
  const latest = useRef(use);
  useEffect(() => {
    latest.current = use;
  });

  useEffect(() => {
    const take = async () => {
      const stored = (await browser.storage.session.get(PENDING_PROMPT_KEY))[PENDING_PROMPT_KEY] as
        PendingPrompt | undefined;
      if (!stored) return;
      await browser.storage.session.remove(PENDING_PROMPT_KEY);
      if (Date.now() - stored.at < MAX_AGE_MS) latest.current(stored.text);
    };
    void take();
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (area === 'session' && PENDING_PROMPT_KEY in changes) void take();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);
}
