import { WebSocket } from 'ws';
import {
  CLOSE_BAD_TOKEN,
  PROTOCOL_VERSION,
  decodeMessage,
  toClientMessage,
  type ToolCall,
  type ToolResult,
} from '@autochrome/shared';

/** Thrown when the hub is reachable but will never accept this client (e.g. wrong token). */
export class FatalHubError extends Error {}

function failure(id: string, message: string): ToolResult {
  return { id, ok: false, content: [{ type: 'text', text: message }] };
}

/** A connection to the hub's `/client` endpoint. */
export class HubClient {
  private readonly pending = new Map<string, (result: ToolResult) => void>();
  /** Resolves when the connection closes for any reason. */
  readonly closed: Promise<void>;

  private constructor(private readonly socket: WebSocket) {
    this.closed = new Promise((resolve) => {
      socket.on('close', () => {
        for (const [id, resolvePending] of this.pending) {
          resolvePending(failure(id, 'Lost connection to the autochrome hub.'));
        }
        this.pending.clear();
        resolve();
      });
    });
    socket.on('message', (data) => {
      const message = decodeMessage(toClientMessage, data.toString());
      if (message?.type !== 'result') return;
      this.pending.get(message.result.id)?.(message.result);
      this.pending.delete(message.result.id);
    });
  }

  /** Connects and authenticates; rejects if the hub is down or refuses the hello. */
  static connect(port: number, token: string): Promise<HubClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/client`);
      socket.once('error', reject);
      socket.once('open', () => {
        socket.send(
          JSON.stringify({
            type: 'hello',
            role: 'client',
            token,
            protocolVersion: PROTOCOL_VERSION,
          }),
        );
      });
      socket.once('close', (code, reason) => {
        const text = reason.toString() || `code ${code}`;
        reject(
          code === CLOSE_BAD_TOKEN
            ? new FatalHubError(
                `The hub on port ${port} rejected the token (${text}). Another autochrome hub with a different token may be running.`,
              )
            : new Error(`Hub closed the connection: ${text}`),
        );
      });
      socket.once('message', (data) => {
        const message = decodeMessage(toClientMessage, data.toString());
        if (message?.type !== 'welcome') return reject(new Error('Unexpected reply from hub.'));
        socket.removeAllListeners('error');
        socket.removeAllListeners('close');
        resolve(new HubClient(socket));
      });
    });
  }

  call(call: ToolCall): Promise<ToolResult> {
    return new Promise((resolve) => {
      this.pending.set(call.id, resolve);
      this.socket.send(JSON.stringify({ type: 'call', call }), (error) => {
        if (error) {
          this.pending.delete(call.id);
          resolve(failure(call.id, `Could not reach the autochrome hub: ${error.message}`));
        }
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}
