import { useEffect, useState } from 'react';
import { isSafetyChange, loadSafety, type SafetySettings } from '@/src/safety/settings';

/** The saved safety settings, kept current when they change anywhere (e.g. "Allow on this site"). */
export function useSafety(): SafetySettings | undefined {
  const [settings, setSettings] = useState<SafetySettings>();

  useEffect(() => {
    const refresh = () => void loadSafety().then(setSettings);
    refresh();
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (isSafetyChange(changes, area)) refresh();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  return settings;
}
