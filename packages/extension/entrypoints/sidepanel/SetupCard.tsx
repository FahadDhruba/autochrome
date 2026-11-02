import { useState } from 'react';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import Logo from '@/src/ui/Logo';
import { providers } from '@/src/providers';
import { recommendedModel } from '@/src/providers/recommend';
import type { ProviderId } from '@/src/providers/types';
import { loadProviderSettings, saveDefaultProvider, saveProviderSettings } from '@/src/settings';

const CHOICES: { id: ProviderId; label: string; hint: string; keyUrl: string }[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    hint: 'Free tier available.',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    hint: 'Paid.',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'Paid.',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
];

type Status = { state: 'idle' | 'testing' | 'done' } | { state: 'error'; message: string };

type Props = { onOpenSettings: () => void; children?: React.ReactNode };

/** First run: pick a provider, paste a key, and it is tested and ready to use. */
export default function SetupCard({ onOpenSettings, children }: Props) {
  const [choice, setChoice] = useState<ProviderId>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const selected = CHOICES.find((c) => c.id === choice)!;

  const connect = async () => {
    const key = apiKey.trim();
    if (!key) return;
    setStatus({ state: 'testing' });
    const info = providers[choice];
    // A base URL saved earlier (a proxy, or a test server) is kept.
    const { baseUrl } = await loadProviderSettings(choice);
    const models = await info.provider.listModels({ apiKey: key, baseUrl, model: '' });
    // Anthropic offers a fixed list, so an empty list means the key or the network failed.
    if (models.length === 0) {
      setStatus({
        state: 'error',
        message: `Could not reach ${info.label} with this key. Check it and try again.`,
      });
      return;
    }
    const model = recommendedModel(choice, models, info.defaultModel);
    await saveProviderSettings(choice, { apiKey: key, baseUrl, model });
    await saveDefaultProvider(choice);
    setStatus({ state: 'done' });
  };

  return (
    <div className="setup" data-testid="empty-state">
      <Logo size={48} />
      <h2>Set up autochrome</h2>
      <p className="muted">
        Choose an AI provider and paste its API key. The key stays in this browser and is sent only
        to that provider.
      </p>
      <form
        className="setup-form"
        onSubmit={(event) => {
          event.preventDefault();
          void connect();
        }}
      >
        <div className="setup-choices" role="radiogroup" aria-label="AI provider">
          {CHOICES.map((c) => (
            <label key={c.id} className={`setup-choice${choice === c.id ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="setup-provider"
                checked={choice === c.id}
                onChange={() => {
                  setChoice(c.id);
                  setStatus({ state: 'idle' });
                }}
              />
              <span className="setup-choice-label">{c.label}</span>
              <span className="muted">{c.hint}</span>
            </label>
          ))}
        </div>
        <label>
          API key
          <input
            type="password"
            value={apiKey}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your key"
            onChange={(event) => {
              setApiKey(event.target.value);
              setStatus({ state: 'idle' });
            }}
          />
        </label>
        <a className="setup-link" href={selected.keyUrl} target="_blank" rel="noreferrer">
          Get a {selected.label} key
        </a>
        {status.state === 'error' && (
          <p className="error-banner" role="alert">
            {status.message}
          </p>
        )}
        {status.state === 'done' ? (
          <p className="setup-done" role="status">
            <CircleCheck size={16} aria-hidden="true" /> Connected. Ask for anything below.
          </p>
        ) : (
          <button type="submit" className="with-icon" disabled={status.state === 'testing'}>
            {status.state === 'testing' && (
              <LoaderCircle className="spin" size={14} aria-hidden="true" />
            )}
            {status.state === 'testing' ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </form>
      <button type="button" className="link" onClick={onOpenSettings}>
        Open settings
      </button>
      <p className="muted setup-foot">
        Local models (Ollama, LM Studio) and OpenRouter are in Settings.
      </p>
      {children}
    </div>
  );
}
