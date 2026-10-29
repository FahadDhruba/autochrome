import { useEffect, useState } from 'react';
import IconButton from '@/src/ui/IconButton';
import { Bug } from 'lucide-react';
import { COMPATIBLE_PRESETS, PROVIDER_IDS, providers } from '@/src/providers';
import type { ProviderId, ProviderSettings } from '@/src/providers/types';
import {
  loadAllProviderSettings,
  loadDefaultProvider,
  saveDefaultProvider,
  saveProviderSettings,
  type AllProviderSettings,
} from '@/src/settings';
import BridgeSettings from './BridgeSettings';
import SafetySettings from './SafetySettings';
import { useModelOptions } from './useModelOptions';

const KEY_PLACEHOLDERS: Record<ProviderId, string> = {
  anthropic: 'sk-ant-…',
  openai: 'sk-…',
  gemini: 'AIza…',
  compatible: 'Optional',
};

const CUSTOM = 'custom';
const emptySettings: ProviderSettings = { apiKey: '', baseUrl: '', model: '' };

export default function SettingsView() {
  const [drafts, setDrafts] = useState<AllProviderSettings>();
  const [saved, setSaved] = useState<AllProviderSettings>();
  const [selected, setSelected] = useState<ProviderId>('anthropic');
  const [defaultProvider, setDefaultProvider] = useState<ProviderId>('anthropic');
  const [justSaved, setJustSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    void Promise.all([loadAllProviderSettings(), loadDefaultProvider()]).then(([all, current]) => {
      setDrafts(all);
      setSaved(all);
      setSelected(current);
      setDefaultProvider(current);
    });
  }, []);

  const info = providers[selected];
  const draft = drafts?.[selected];
  // Suggestions follow what is saved, not every keystroke.
  const models = useModelOptions(selected, saved?.[selected] ?? emptySettings);
  if (!drafts || !draft) return null;

  const change = (patch: Partial<ProviderSettings>) => {
    setDrafts({ ...drafts, [selected]: { ...draft, ...patch } });
    setJustSaved(false);
  };

  const save = async () => {
    await saveProviderSettings(selected, draft);
    setSaved({ ...saved!, [selected]: draft });
    setJustSaved(true);
  };

  const compatible = selected === 'compatible';
  const preset = COMPATIBLE_PRESETS.find((p) => p.baseUrl === draft.baseUrl)?.baseUrl ?? CUSTOM;
  const keyVisible = info.needsKey || showKey || draft.apiKey !== '';

  const baseUrlField = (
    <label>
      Base URL
      <input
        type="url"
        value={draft.baseUrl}
        placeholder={info.defaultBaseUrl || 'http://localhost:11434/v1'}
        onChange={(e) => change({ baseUrl: e.target.value })}
      />
    </label>
  );

  return (
    <div className="settings">
      <label>
        Provider
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value as ProviderId);
            setJustSaved(false);
            setShowKey(false);
          }}
        >
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {providers[id].label}
            </option>
          ))}
        </select>
      </label>
      <section aria-label={`${info.label} settings`}>
        <h2>{info.label}</h2>
        {compatible && (
          <>
            <label>
              Server
              <select
                value={preset}
                onChange={(e) =>
                  change({ baseUrl: e.target.value === CUSTOM ? '' : e.target.value })
                }
              >
                {COMPATIBLE_PRESETS.map((p) => (
                  <option key={p.baseUrl} value={p.baseUrl}>
                    {p.label}
                  </option>
                ))}
                <option value={CUSTOM}>Custom</option>
              </select>
            </label>
            {baseUrlField}
          </>
        )}
        {keyVisible ? (
          <label>
            {info.needsKey ? 'API key' : 'API key (optional)'}
            <input
              type="password"
              value={draft.apiKey}
              autoComplete="off"
              placeholder={KEY_PLACEHOLDERS[selected]}
              onChange={(e) => change({ apiKey: e.target.value })}
            />
          </label>
        ) : (
          <button className="link" onClick={() => setShowKey(true)}>
            Add an API key
          </button>
        )}
        <p className="muted">
          {compatible
            ? 'Stored on this device and sent only to the server above.'
            : `Stored on this device and sent only to the ${info.label} API.`}
        </p>
        <label>
          Model
          <input
            list="settings-models"
            value={draft.model}
            placeholder="Model name"
            spellCheck={false}
            onChange={(e) => change({ model: e.target.value })}
          />
          <datalist id="settings-models">
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </datalist>
        </label>
        {!compatible && (
          <details>
            <summary>Advanced</summary>
            {baseUrlField}
          </details>
        )}
        <div className="button-row">
          <button onClick={() => void save()}>{justSaved ? 'Saved' : 'Save'}</button>
          <button
            className="secondary"
            disabled={defaultProvider === selected}
            onClick={() => {
              void saveDefaultProvider(selected).then(() => setDefaultProvider(selected));
            }}
          >
            {defaultProvider === selected ? 'Default provider' : 'Use as default'}
          </button>
        </div>
      </section>
      <SafetySettings />
      <BridgeSettings />
      <p>
        <IconButton
          label="Open tool debugger"
          icon={Bug}
          href={browser.runtime.getURL('/debug.html')}
          align="start"
        />
      </p>
    </div>
  );
}
