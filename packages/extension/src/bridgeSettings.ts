import { DEFAULT_BRIDGE_PORT } from '@autochrome/shared';

const TOKEN_KEY = 'bridge.token';
const PORT_KEY = 'bridge.port';

export type BridgeSettings = { token: string; port: number };

/** What the side panel shows next to the status dot. */
export type BridgeStatus = 'no-token' | 'connecting' | 'connected' | 'waiting' | 'bad-token';

/** Sent by the UI to ask for the status; the background answers with a `BridgeStatus`. */
export type BridgeStatusRequest = { type: 'autochrome:bridge-status' };
/** Broadcast by the background whenever the status changes. */
export type BridgeStatusBroadcast = { type: 'autochrome:bridge-status'; status: BridgeStatus };

export function isBridgeStatusRequest(message: unknown): message is BridgeStatusRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'autochrome:bridge-status' &&
    !('status' in message)
  );
}

export function isBridgeStatusBroadcast(message: unknown): message is BridgeStatusBroadcast {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'autochrome:bridge-status' &&
    'status' in message
  );
}

export async function loadBridgeSettings(): Promise<BridgeSettings> {
  const stored = await browser.storage.local.get([TOKEN_KEY, PORT_KEY]);
  const port = Number(stored[PORT_KEY]);
  return {
    token: typeof stored[TOKEN_KEY] === 'string' ? stored[TOKEN_KEY].trim() : '',
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_BRIDGE_PORT,
  };
}

export async function saveBridgeSettings(settings: BridgeSettings): Promise<void> {
  await browser.storage.local.set({
    [TOKEN_KEY]: settings.token.trim(),
    [PORT_KEY]: settings.port,
  });
}

export function isBridgeSettingsChange(changes: Record<string, unknown>, area: string): boolean {
  return area === 'local' && (TOKEN_KEY in changes || PORT_KEY in changes);
}
