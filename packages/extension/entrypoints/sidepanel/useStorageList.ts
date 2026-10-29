import { useEffect, useState } from 'react';

/** A list read from storage, reloaded whenever an item whose key starts with `prefix` changes. */
export function useStorageList<T>(load: () => Promise<T[]>, prefix: string): T[] | undefined {
  const [items, setItems] = useState<T[]>();

  useEffect(() => {
    const refresh = () => void load().then(setItems);
    refresh();
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && Object.keys(changes).some((key) => key.startsWith(prefix))) refresh();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [load, prefix]);

  return items;
}
