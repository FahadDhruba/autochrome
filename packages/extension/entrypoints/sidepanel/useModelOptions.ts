import { useEffect, useState } from 'react';
import { providers } from '@/src/providers';
import { STATIC_MODELS } from '@/src/providers/anthropic';
import type { ModelOption, ProviderId, ProviderSettings } from '@/src/providers/types';

/** Model suggestions for a provider; empty until the provider can be asked. Free text is always allowed. */
export function useModelOptions(id: ProviderId, settings: ProviderSettings): ModelOption[] {
  const { apiKey, baseUrl } = settings;
  const key = `${id}\n${apiKey}\n${baseUrl}`;
  const [fetched, setFetched] = useState<{ key: string; models: ModelOption[] }>();

  useEffect(() => {
    let current = true;
    const info = providers[id];
    const canList = info.needsKey ? apiKey !== '' : (baseUrl || info.defaultBaseUrl) !== '';
    if (canList) {
      void info.provider.listModels({ apiKey, baseUrl, model: '' }).then((models) => {
        if (current) setFetched({ key, models });
      });
    }
    return () => {
      current = false;
    };
  }, [id, apiKey, baseUrl, key]);

  if (fetched?.key === key && fetched.models.length > 0) return fetched.models;
  return id === 'anthropic' ? STATIC_MODELS : [];
}
