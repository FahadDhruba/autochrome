import {
  CLOSE_BAD_TOKEN,
  PROTOCOL_VERSION,
  decodeMessage,
  toExtensionMessage,
  type ToolResult,
} from '@autochrome/shared';
import {
  isBridgeSettingsChange,
  loadBridgeSettings,
  type BridgeStatus,
  type BridgeStatusBroadcast,
} from './bridgeSettings';
import { executeTool } from './executor';

const ALARM_NAME = 'autochrome-bridge';
const ALARM_PERIOD_MINUTES = 0.5;
const PING_INTERVAL_MS = 20_000;
const MIN_BACKOFF_MS = 1_000;
// Retrying localhost is cheap, and a newly started hub should be picked up quickly.
const MAX_BACKOFF_MS = 5_000;

/**
 * Keeps one WebSocket open to the bridge hub while a token is saved, and runs the calls it
 * receives through `executeTool`.
 */
class BridgeConnection {
  status: BridgeStatus = 'no-token';
  private socket: WebSocket | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private backoffMs = MIN_BACKOFF_MS;

  /** Drops any current connection and connects with the saved settings. */
  async restart(): Promise<void> {
    this.stop();
    this.backoffMs = MIN_BACKOFF_MS;
    await this.connect();
  }

  /** Called by the alarm: reconnects if the worker restarted or a retry timer was lost. */
  async ensureConnected(): Promise<void> {
    const alive = this.socket && this.socket.readyState <= WebSocket.OPEN;
    if (!alive && this.status !== 'bad-token') await this.connect();
  }

  private async connect(): Promise<void> {
    this.stop();
    const { token, port } = await loadBridgeSettings();
    if (!token) return this.setStatus('no-token');

    this.setStatus('connecting');
    const socket = new WebSocket(`ws://127.0.0.1:${port}/extension`);
    this.socket = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'hello',
          role: 'extension',
          token,
          protocolVersion: PROTOCOL_VERSION,
        }),
      );
    };
    socket.onmessage = (event) => {
      const message = decodeMessage(toExtensionMessage, String(event.data));
      if (message?.type === 'welcome') {
        this.backoffMs = MIN_BACKOFF_MS;
        this.setStatus('connected');
        this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_INTERVAL_MS);
      } else if (message?.type === 'call') {
        void executeTool(message.call, { source: 'bridge' }).then((result: ToolResult) =>
          // The target hint is for saving chats as workflows, not for bridge clients.
          this.send({ type: 'result', result: { ...result, target: undefined } }),
        );
      }
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.clearPing();
      this.socket = undefined;
      if (event.code === CLOSE_BAD_TOKEN) return this.setStatus('bad-token');
      this.setStatus('waiting');
      this.scheduleRetry();
    };
  }

  private send(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private scheduleRetry(): void {
    this.retryTimer = setTimeout(() => void this.connect(), this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private stop(): void {
    clearTimeout(this.retryTimer);
    this.clearPing();
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }

  private clearPing(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }

  private setStatus(status: BridgeStatus): void {
    if (status === this.status) return;
    this.status = status;
    const broadcast: BridgeStatusBroadcast = { type: 'autochrome:bridge-status', status };
    // Rejects when no UI is open to receive it.
    browser.runtime.sendMessage(broadcast).catch(() => {});
  }
}

export const bridge = new BridgeConnection();

export function startBridge(): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (isBridgeSettingsChange(changes, area)) void bridge.restart();
  });
  browser.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void bridge.ensureConnected();
  });
  void bridge.restart();
}
