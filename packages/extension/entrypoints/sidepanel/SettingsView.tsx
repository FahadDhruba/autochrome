import { useEffect, useState } from 'react';
import { createAnthropicProvider, DEFAULT_MODEL, STATIC_MODELS } from '@/src/providers/anthropic';
import type { ModelOption, ProviderSettings } from '@/src/providers/types';
import { loadProviderSettings, saveProviderSettings } from '@/src/settings';
import BridgeSettings from './BridgeSettings';

const provider = createAnthropicProvider();

export default function SettingsView() {
  const [settings, setSettings] = useState<ProviderSettings>({
    apiKey: '',
    baseUrl: '',
    model: DEFAULT_MODEL,
  });
  const [models, setModels] = useState<ModelOption[]>(STATIC_MODELS);
  const [saved, setSaved] = useState(false);

  const refreshModels = (current: ProviderSettings) => {
    if (current.apiKey) void provider.listModels(current).then(setModels);
  };

  useEffect(() => {
    void loadProviderSettings().then((loaded) => {
      setSettings(loaded);
      refreshModels(loaded);
    });
  }, []);

  const change = (patch: Partial<ProviderSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  const save = async () => {
    await saveProviderSettings(settings);
    setSaved(true);
    refreshModels(settings);
  };

  // A saved model that the list does not contain (yet) must stay selectable.
  const options = models.some((m) => m.id === settings.model)
    ? models
    : [{ id: settings.model, label: settings.model }, ...models];

  return (
    <div className="settings">
      <section aria-label="Anthropic settings">
        <h2>Anthropic</h2>
        <label>
          API key
          <input
            type="password"
            value={settings.apiKey}
            autoComplete="off"
            placeholder="sk-ant-…"
            onChange={(e) => change({ apiKey: e.target.value })}
          />
        </label>
        <p className="muted">Stored on this device and sent only to the Anthropic API.</p>
        <label>
          Model
          <select value={settings.model} onChange={(e) => change({ model: e.target.value })}>
            {options.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary>Advanced</summary>
          <label>
            Base URL
            <input
              type="url"
              value={settings.baseUrl}
              placeholder="https://api.anthropic.com"
              onChange={(e) => change({ baseUrl: e.target.value })}
            />
          </label>
        </details>
        <button onClick={() => void save()}>{saved ? 'Saved' : 'Save'}</button>
      </section>
      <BridgeSettings />
      <p>
        <a href={browser.runtime.getURL('/debug.html')} target="_blank" rel="noreferrer">
          Open tool debugger
        </a>
      </p>
    </div>
  );
}
