import { useEffect, useState } from 'react';
import { isPromptsChange, loadPrompts, type SavedPrompt } from '@/src/prompts';

/** The saved prompts, kept current when they change in Settings. */
export function usePrompts(): SavedPrompt[] {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  useEffect(() => {
    const refresh = () => void loadPrompts().then(setPrompts);
    refresh();
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (isPromptsChange(changes, area)) refresh();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);
  return prompts;
}
