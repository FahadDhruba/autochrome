import { useEffect, useState } from 'react';
import { isLimitsChange, loadLimits, loadPrices, type Limits, type Price } from '@/src/limits';

/** Task limits and model prices, kept current when they change in Settings. */
export function useLimits(): { limits?: Limits; prices: Record<string, Price> } {
  const [state, setState] = useState<{ limits?: Limits; prices: Record<string, Price> }>({
    prices: {},
  });
  useEffect(() => {
    const refresh = () =>
      void Promise.all([loadLimits(), loadPrices()]).then(([limits, prices]) =>
        setState({ limits, prices }),
      );
    refresh();
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (isLimitsChange(changes, area)) refresh();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);
  return state;
}
