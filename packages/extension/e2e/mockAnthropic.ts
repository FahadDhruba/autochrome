import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type MockBlock =
  { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: object };

/** A request body as the extension sent it (only the parts the tests look at). */
export type RecordedRequest = {
  headers: IncomingMessage['headers'];
  body: {
    model: string;
    stream: boolean;
    system: { text: string; cache_control?: unknown }[];
    tools: { name: string; cache_control?: unknown }[];
    messages: { role: string; content: Record<string, unknown>[] }[];
  };
};

/** One scripted reply: the content blocks to stream, or a stream that never finishes. */
export type MockReply = MockBlock[] | { hang: string };
export type ReplyScript = MockReply | ((request: RecordedRequest) => MockReply);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const sse = (event: object) =>
  `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`;

function startEvents(): string {
  return sse({
    type: 'message_start',
    message: {
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 100, cache_read_input_tokens: 40, output_tokens: 1 },
    },
  });
}

function blockEvents(block: MockBlock, index: number): string {
  if (block.type === 'text') {
    const middle = Math.ceil(block.text.length / 2);
    return [
      sse({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }),
      ...[block.text.slice(0, middle), block.text.slice(middle)].map((text) =>
        sse({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } }),
      ),
      sse({ type: 'content_block_stop', index }),
    ].join('');
  }
  const json = JSON.stringify(block.input);
  const middle = Math.ceil(json.length / 2);
  return [
    sse({
      type: 'content_block_start',
      index,
      content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
    }),
    ...[json.slice(0, middle), json.slice(middle)].map((partial_json) =>
      sse({
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json },
      }),
    ),
    sse({ type: 'content_block_stop', index }),
  ].join('');
}

function endEvents(blocks: MockBlock[]): string {
  const stop_reason = blocks.some((block) => block.type === 'tool_use') ? 'tool_use' : 'end_turn';
  return (
    sse({
      type: 'message_delta',
      delta: { stop_reason, stop_sequence: null },
      usage: { output_tokens: 30 },
    }) + sse({ type: 'message_stop' })
  );
}

/** A local stand-in for the Anthropic API that plays scripted streaming replies. */
export class MockAnthropic {
  readonly requests: RecordedRequest[] = [];
  /** Number of streaming requests whose connection was closed by the client. */
  aborted = 0;
  private script: ReplyScript[] = [];
  private server: Server | undefined;

  get baseUrl(): string {
    return `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  /** Replace the script; each POST /v1/messages consumes the next entry. */
  play(...script: ReplyScript[]): void {
    this.script = script;
    this.requests.length = 0;
    this.aborted = 0;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise((resolve) => this.server?.close(resolve));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') return void res.writeHead(204, CORS).end();
    const path = new URL(req.url ?? '/', 'http://x').pathname;

    if (req.method === 'GET' && path === '/v1/models') {
      const data = [
        {
          type: 'model',
          id: 'mock-model',
          display_name: 'Mock model',
          created_at: '2026-01-01T00:00:00Z',
        },
      ];
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
      return void res.end(
        JSON.stringify({ data, has_more: false, first_id: 'mock-model', last_id: 'mock-model' }),
      );
    }
    if (req.method !== 'POST' || path !== '/v1/messages') {
      return void res.writeHead(404, CORS).end('not found');
    }

    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    const recorded: RecordedRequest = { headers: req.headers, body: JSON.parse(raw) };
    this.requests.push(recorded);

    const entry = this.script[this.requests.length - 1];
    if (!entry) {
      res.writeHead(500, { ...CORS, 'content-type': 'application/json' });
      return void res.end(
        JSON.stringify({
          type: 'error',
          error: { type: 'api_error', message: 'Mock script exhausted.' },
        }),
      );
    }
    const reply = typeof entry === 'function' ? entry(recorded) : entry;

    res.writeHead(200, {
      ...CORS,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    res.write(startEvents());
    if ('hang' in reply) {
      res.write(
        sse({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      );
      res.write(
        sse({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: reply.hang },
        }),
      );
      res.on('close', () => this.aborted++);
      return; // never ends; the client has to abort
    }
    res.write(reply.map(blockEvents).join('') + endEvents(reply));
    res.end();
  }
}
