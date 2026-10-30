import { useEffect, useState } from 'react';
import type { ProviderId } from '@/src/providers/types';
import {
  isProviderReady,
  loadAllProviderSettings,
  loadDefaultProvider,
  withKeyFallbacks,
  type AllProviderSettings,
} from '@/src/settings';
import { PROVIDER_IDS } from '@/src/providers';

export type ProviderState = {
  all: AllProviderSettings;
  defaultProvider: ProviderId;
  /** Providers that can run a task right now, default first. */
  ready: ProviderId[];
};

/** The saved provider settings; undefined until loaded. Follows changes made elsewhere. */
export function useProviderSettings(): ProviderState | undefined {
  const [state, setState] = useState<ProviderState>();

  useEffect(() => {
    const refresh = async () => {
      const [stored, defaultProvider] = await Promise.all([
        loadAllProviderSettings(),
        loadDefaultProvider(),
      ]);
      const all = withKeyFallbacks(stored);
      const ready = PROVIDER_IDS.filter((id) => isProviderReady(id, all[id])).sort(
        (a, b) => Number(b === defaultProvider) - Number(a === defaultProvider),
      );
      setState({ all, defaultProvider, ready });
    };
    void refresh();
    const listener = () => void refresh();
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  return state;
}
