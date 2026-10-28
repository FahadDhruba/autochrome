import { useEffect, useState } from 'react';
import { DEFAULT_BRIDGE_PORT } from '@autochrome/shared';
import {
  isBridgeStatusBroadcast,
  loadBridgeSettings,
  saveBridgeSettings,
  type BridgeStatus,
  type BridgeStatusRequest,
} from '@/src/bridgeSettings';

const STATUS_LABELS: Record<BridgeStatus, string> = {
  'no-token': 'Not configured',
  connecting: 'Connecting',
  connected: 'Connected',
  waiting: 'Waiting for bridge',
  'bad-token': 'Bad token',
};

function useBridgeStatus(): BridgeStatus {
  const [status, setStatus] = useState<BridgeStatus>('no-token');

  useEffect(() => {
    const request: BridgeStatusRequest = { type: 'autochrome:bridge-status' };
    browser.runtime
      .sendMessage(request)
      .then((current: BridgeStatus) => setStatus(current))
      .catch(() => {});
    const listener = (message: unknown) => {
      if (isBridgeStatusBroadcast(message)) setStatus(message.status);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  return status;
}

export default function BridgeSettings() {
  const status = useBridgeStatus();
  const [token, setToken] = useState('');
  const [port, setPort] = useState(String(DEFAULT_BRIDGE_PORT));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadBridgeSettings().then((settings) => {
      setToken(settings.token);
      setPort(String(settings.port));
    });
  }, []);

  const save = async () => {
    await saveBridgeSettings({ token, port: Number(port) || DEFAULT_BRIDGE_PORT });
    setSaved(true);
  };

  return (
    <section aria-label="Bridge settings">
      <h2>Bridge</h2>
      <p className="status">
        <span className={`dot dot-${status}`} aria-hidden="true" />
        <span data-testid="bridge-status">{STATUS_LABELS[status]}</span>
      </p>
      <label>
        Token
        <input
          type="password"
          value={token}
          autoComplete="off"
          placeholder="Output of: npx autochrome-bridge token"
          onChange={(e) => {
            setToken(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <label>
        Port
        <input
          type="number"
          min={1}
          max={65535}
          value={port}
          onChange={(e) => {
            setPort(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <button onClick={() => void save()}>{saved ? 'Saved' : 'Save'}</button>
    </section>
  );
}
