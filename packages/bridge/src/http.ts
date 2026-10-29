import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  PROTOCOL_VERSION,
  describeTools,
  isToolName,
  type ToolCall,
  type ToolResult,
} from '@autochrome/shared';
import { isWebOrigin } from './origin';
import { tokensMatch } from './token';

const MAX_BODY_BYTES = 10 * 1024 * 1024;

export type HttpBackend = {
  token: string;
  extensionConnected: () => boolean;
  dispatch: (call: ToolCall) => Promise<ToolResult>;
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isAuthorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') && tokensMatch(token, header.slice('Bearer '.length));
}

export async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  backend: HttpBackend,
): Promise<void> {
  // A web page must never reach the hub, even with a leaked token.
  if (isWebOrigin(req.headers.origin)) {
    return sendJson(res, 403, { error: 'Requests from web pages are not allowed.' });
  }
  if (!isAuthorized(req, backend.token)) {
    return sendJson(res, 401, { error: 'Missing or invalid bearer token.' });
  }

  const { pathname } = new URL(req.url ?? '/', 'http://hub');

  if (req.method === 'GET' && pathname === '/v1/status') {
    return sendJson(res, 200, {
      extensionConnected: backend.extensionConnected(),
      protocolVersion: PROTOCOL_VERSION,
    });
  }
  if (req.method === 'GET' && pathname === '/v1/tools') {
    return sendJson(res, 200, describeTools());
  }

  const toolMatch = /^\/v1\/tools\/([^/]+)$/.exec(pathname);
  if (req.method === 'POST' && toolMatch) {
    const name = decodeURIComponent(toolMatch[1] ?? '');
    if (!isToolName(name)) return sendJson(res, 404, { error: `Unknown tool "${name}".` });

    let input: unknown;
    try {
      const body = await readBody(req);
      input = body.trim() === '' ? {} : JSON.parse(body);
    } catch (error) {
      return sendJson(res, 400, { error: `Invalid request body: ${(error as Error).message}` });
    }
    const result = await backend.dispatch({ id: crypto.randomUUID(), name, input });
    return sendJson(res, 200, result);
  }

  return sendJson(res, 404, { error: 'Not found.' });
}
