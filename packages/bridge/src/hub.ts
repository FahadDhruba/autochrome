import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CLOSE_BAD_MESSAGE,
  CLOSE_BAD_TOKEN,
  CLOSE_REPLACED,
  decodeMessage,
  describeTools,
  isToolName,
  protocolVersionMismatch,
  toHubMessage,
  type ToClientMessage,
  type ToExtensionMessage,
  type ToolResult,
} from '@autochrome/shared';
import { Dispatcher } from './dispatcher';
import { handleHttp } from './http';
import { isExtensionOrigin, isWebOrigin } from './origin';
import { tokensMatch } from './token';

export const DEFAULT_CALL_TIMEOUT_MS = 120_000;
const HELLO_TIMEOUT_MS = 5_000;

export type HubOptions = {
  port: number;
  token: string;
  callTimeoutMs?: number;
  /** How long a call waits for the extension to connect before failing. */
  extensionGraceMs?: number;
};

export type Hub = {
  port: number;
  close: () => Promise<void>;
};

type Role = 'client' | 'extension';

/** A failed result for a `call` message that has an id but did not validate (e.g. unknown tool). */
function invalidCall(raw: string): ToolResult | undefined {
  try {
    const { type, call } = JSON.parse(raw) as {
      type?: unknown;
      call?: { id?: unknown; name?: unknown };
    };
    if (type !== 'call' || typeof call?.id !== 'string') return undefined;
    const text = isToolName(String(call.name))
      ? 'Invalid tool call.'
      : `Unknown tool "${String(call.name)}".`;
    return { id: call.id, ok: false, content: [{ type: 'text', text }] };
  } catch {
    return undefined;
  }
}

/** Starts the hub on 127.0.0.1. Rejects with EADDRINUSE when another hub owns the port. */
export async function startHub(options: HubOptions): Promise<Hub> {
  const { token } = options;
  const dispatcher = new Dispatcher(
    options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS,
    options.extensionGraceMs,
  );
  const clients = new Set<WebSocket>();
  let extension: WebSocket | undefined;

  const sendJson = (socket: WebSocket, message: ToClientMessage | ToExtensionMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const broadcastStatus = () => {
    for (const client of clients) {
      sendJson(client, { type: 'status', extensionConnected: dispatcher.extensionConnected });
    }
  };

  const server: Server = createServer((req, res) => {
    handleHttp(req, res, {
      token,
      extensionConnected: () => dispatcher.extensionConnected,
      dispatch: (call) => dispatcher.dispatch(call),
    }).catch((error: unknown) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });

  const attachExtension = (socket: WebSocket) => {
    if (extension) extension.close(CLOSE_REPLACED, 'Replaced by a newer extension connection.');
    extension = socket;
    dispatcher.attach((message) => sendJson(socket, message));
    sendJson(socket, { type: 'welcome', extensionConnected: true });
    broadcastStatus();

    socket.on('message', (data) => {
      const message = decodeMessage(toHubMessage, data.toString());
      if (message?.type === 'result') dispatcher.handleResult(message.result);
      else if (message?.type === 'ping') sendJson(socket, { type: 'pong' });
    });
    socket.on('close', () => {
      if (extension !== socket) return;
      extension = undefined;
      dispatcher.detach();
      broadcastStatus();
    });
  };

  const attachClient = (socket: WebSocket) => {
    clients.add(socket);
    sendJson(socket, { type: 'welcome', extensionConnected: dispatcher.extensionConnected });

    socket.on('message', (data) => {
      const message = decodeMessage(toHubMessage, data.toString());
      if (message?.type === 'call') {
        const { call } = message;
        void dispatcher
          .dispatch(call)
          .then((result) => sendJson(socket, { type: 'result', result }));
      } else if (message?.type === 'list_tools') {
        sendJson(socket, { type: 'tools', tools: describeTools() });
      } else {
        // A call with a typo in the tool name gets an answer, like over HTTP and MCP.
        const rejected = invalidCall(data.toString());
        if (rejected) sendJson(socket, { type: 'result', result: rejected });
        else socket.close(CLOSE_BAD_MESSAGE, 'Invalid message.');
      }
    });
    socket.on('close', () => clients.delete(socket));
  };

  /** The first message must be a valid hello for the expected role. */
  const authenticate = (socket: WebSocket, role: Role) => {
    const timer = setTimeout(
      () => socket.close(CLOSE_BAD_MESSAGE, 'Expected a hello message.'),
      HELLO_TIMEOUT_MS,
    );
    socket.once('message', (data) => {
      clearTimeout(timer);
      const hello = decodeMessage(toHubMessage, data.toString());
      if (hello?.type !== 'hello' || hello.role !== role) {
        return socket.close(CLOSE_BAD_MESSAGE, 'Expected a hello message.');
      }
      if (!tokensMatch(token, hello.token)) {
        return socket.close(CLOSE_BAD_TOKEN, 'Invalid token.');
      }
      const mismatch = protocolVersionMismatch(hello.protocolVersion);
      if (mismatch) return socket.close(CLOSE_BAD_MESSAGE, mismatch);
      if (role === 'extension') attachExtension(socket);
      else attachClient(socket);
    });
    socket.once('close', () => clearTimeout(timer));
  };

  const reject = (socket: Duplex, status: string) => {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '/', 'http://hub');
    const role: Role | undefined =
      pathname === '/extension' ? 'extension' : pathname === '/client' ? 'client' : undefined;
    if (!role) return reject(socket, '404 Not Found');
    // /extension is only for the extension itself; no web page may reach either endpoint.
    const origin = req.headers.origin;
    if (role === 'extension' ? !isExtensionOrigin(origin) : isWebOrigin(origin)) {
      return reject(socket, '403 Forbidden');
    }
    wss.handleUpgrade(req, socket, head, (ws) => authenticate(ws, role));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    port: (server.address() as AddressInfo).port,
    close: async () => {
      for (const socket of wss.clients) socket.terminate();
      dispatcher.detach();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
