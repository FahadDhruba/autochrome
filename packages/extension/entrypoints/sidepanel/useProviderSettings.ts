import { useEffect, useState } from 'react';
import type { ProviderSettings } from '@/src/providers/types';
import { loadProviderSettings } from '@/src/settings';

/** The saved provider settings; undefined until loaded. Follows changes made elsewhere. */
export function useProviderSettings(): ProviderSettings | undefined {
  const [settings, setSettings] = useState<ProviderSettings>();

  useEffect(() => {
    const refresh = () => void loadProviderSettings().then(setSettings);
    refresh();
    browser.storage.onChanged.addListener(refresh);
    return () => browser.storage.onChanged.removeListener(refresh);
  }, []);

  return settings;
}
