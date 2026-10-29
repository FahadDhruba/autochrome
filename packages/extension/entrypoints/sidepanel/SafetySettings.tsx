import { useCallback, useState } from 'react';
import IconButton from '@/src/ui/IconButton';
import { X } from 'lucide-react';
import { clearSites, removeSite, saveMode, type SafetyMode } from '@/src/safety/settings';
import { scheduleStore } from '@/src/schedules/store';
import { useSafety } from './useSafety';
import { useStorageList } from './useStorageList';

const MODES: { id: SafetyMode; label: string; description: string }[] = [
  {
    id: 'ask',
    label: 'Ask every action',
    description: 'Approve each click, keystroke and navigation.',
  },
  {
    id: 'per-site',
    label: 'Per-site',
    description: 'Approve each site once. Purchases, sending, deleting and passwords still ask.',
  },
  { id: 'auto', label: 'Auto', description: 'Never ask. Use only if you trust the task.' },
];

export default function SafetySettings() {
  const safety = useSafety();
  const [confirmingAuto, setConfirmingAuto] = useState(false);
  const schedules = useStorageList(
    useCallback(() => scheduleStore.list(), []),
    'schedule:',
  );
  if (!safety) return null;
  const scheduled = schedules?.filter((schedule) => schedule.enabled).length ?? 0;

  const choose = (mode: SafetyMode) => {
    setConfirmingAuto(mode === 'auto');
    if (mode !== 'auto') void saveMode(mode);
  };

  return (
    <section aria-label="Safety settings">
      <h2>Safety</h2>
      <div className="radio-group" role="radiogroup" aria-label="Safety mode">
        {MODES.map(({ id, label, description }) => (
          <label key={id} className="radio-option">
            <input
              type="radio"
              name="safety-mode"
              checked={safety.mode === id}
              onChange={() => choose(id)}
            />
            <span>
              {label}
              <span className="muted option-description">{description}</span>
            </span>
          </label>
        ))}
      </div>
      {confirmingAuto && safety.mode !== 'auto' && (
        <div className="warning" role="alert">
          <p>The AI can act on any site, including ones where you are signed in, without asking.</p>
          <div className="button-row">
            <button
              className="danger"
              onClick={() => {
                setConfirmingAuto(false);
                void saveMode('auto');
              }}
            >
              Turn on Auto
            </button>
            <IconButton label="Cancel" icon={X} onClick={() => setConfirmingAuto(false)} />
          </div>
        </div>
      )}

      {scheduled > 0 && (
        <p className="warning" role="status" data-testid="schedule-warning">
          Scheduled runs act in Auto mode: {scheduled} enabled{' '}
          {scheduled === 1 ? 'schedule runs' : 'schedules run'} without asking, including purchases,
          sending and deleting. They never run JavaScript.
        </p>
      )}

      <h3>Allowed sites</h3>
      {safety.sites.length === 0 ? (
        <p className="muted">No sites allowed yet. You are asked the first time a site is used.</p>
      ) : (
        <>
          <ul className="site-list">
            {safety.sites.map((site) => (
              <li key={site}>
                <span>{site}</span>
                <IconButton
                  label={`Remove ${site}`}
                  icon={X}
                  tone="danger"
                  align="end"
                  onClick={() => void removeSite(site)}
                />
              </li>
            ))}
          </ul>
          <button className="secondary" onClick={() => void clearSites()}>
            Clear all
          </button>
        </>
      )}
    </section>
  );
}
