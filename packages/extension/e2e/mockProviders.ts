import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';

/** What the mock model says in one step: some text, some tool calls, or a stream that hangs. */
export type MockStep = {
  text?: string;
  calls?: { id?: string; name: string; input: object; signature?: string }[];
};
export type StepScript = MockStep | ((request: ProviderRequest) => MockStep);

export type ProviderRequest = {
  url: string;
  headers: IncomingMessage['headers'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const data = (payload: object | string) =>
  `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`;

/** Shared plumbing: a local HTTP server that records POST bodies and plays one scripted step each. */
abstract class MockProvider {
  readonly requests: ProviderRequest[] = [];
  private script: StepScript[] = [];
  private server: Server | undefined;

  get baseUrl(): string {
    return `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  /** Replace the script; each chat request consumes the next entry. */
  play(...script: StepScript[]): void {
    this.script = script;
    this.requests.length = 0;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise((resolve) => this.server?.close(resolve));
  }

  protected abstract isChatRequest(method: string, path: string): boolean;
  protected abstract models(): object;
  protected abstract stream(step: MockStep): string;

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') return void res.writeHead(204, CORS).end();
    const path = new URL(req.url ?? '/', 'http://x').pathname;

    if (req.method === 'GET' && path.endsWith('/models')) {
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
      return void res.end(JSON.stringify(this.models()));
    }
    if (!this.isChatRequest(req.method ?? '', path)) {
      return void res.writeHead(404, CORS).end('not found');
    }

    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    const recorded: ProviderRequest = {
      url: req.url ?? '',
      headers: req.headers,
      body: JSON.parse(raw),
    };
    this.requests.push(recorded);

    const entry = this.script[this.requests.length - 1];
    if (!entry) {
      res.writeHead(500, { ...CORS, 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ error: { message: 'Mock script exhausted.' } }));
    }
    const step = typeof entry === 'function' ? entry(recorded) : entry;
    res.writeHead(200, {
      ...CORS,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    res.end(this.stream(step));
  }
}

/** A local stand-in for a Chat Completions server (OpenAI, Ollama, LM Studio, ...). */
export class MockOpenAi extends MockProvider {
  protected isChatRequest(method: string, path: string): boolean {
    return method === 'POST' && path === '/v1/chat/completions';
  }

  protected models(): object {
    return {
      data: [
        { id: 'mock-chat', object: 'model' },
        { id: 'mock-other', object: 'model' },
      ],
    };
  }

  protected stream({ text, calls = [] }: MockStep): string {
    const chunk = (delta: object, finish_reason: string | null = null) =>
      data({ choices: [{ index: 0, delta, finish_reason }] });
    const out: string[] = [chunk({ role: 'assistant' })];
    if (text) {
      const middle = Math.ceil(text.length / 2);
      out.push(chunk({ content: text.slice(0, middle) }), chunk({ content: text.slice(middle) }));
    }
    calls.forEach((call, index) => {
      const json = JSON.stringify(call.input);
      const middle = Math.ceil(json.length / 2);
      out.push(
        chunk({
          tool_calls: [
            {
              index,
              id: call.id ?? `call_${index}`,
              type: 'function',
              function: { name: call.name, arguments: '' },
            },
          ],
        }),
        chunk({ tool_calls: [{ index, function: { arguments: json.slice(0, middle) } }] }),
        chunk({ tool_calls: [{ index, function: { arguments: json.slice(middle) } }] }),
      );
    });
    out.push(
      chunk({}, calls.length > 0 ? 'tool_calls' : 'stop'),
      data({
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 30,
          prompt_tokens_details: { cached_tokens: 40 },
        },
      }),
      data('[DONE]'),
    );
    return out.join('');
  }
}

/** A local stand-in for the Gemini streamGenerateContent API. */
export class MockGemini extends MockProvider {
  protected isChatRequest(method: string, path: string): boolean {
    return method === 'POST' && /^\/v1beta\/models\/[^/]+:streamGenerateContent$/.test(path);
  }

  protected models(): object {
    return {
      models: [
        {
          name: 'models/mock-gemini',
          displayName: 'Mock Gemini',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/mock-embed',
          displayName: 'Mock embed',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    };
  }

  protected stream({ text, calls = [] }: MockStep): string {
    const chunk = (parts: object[], finishReason?: string) =>
      data({
        candidates: [{ content: { role: 'model', parts }, ...(finishReason && { finishReason }) }],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 30,
          cachedContentTokenCount: 40,
        },
      });
    const out: string[] = [];
    if (text) {
      const middle = Math.ceil(text.length / 2);
      out.push(chunk([{ text: text.slice(0, middle) }]), chunk([{ text: text.slice(middle) }]));
    }
    const callParts = calls.map((call) => ({
      functionCall: { ...(call.id && { id: call.id }), name: call.name, args: call.input },
      ...(call.signature && { thoughtSignature: call.signature }),
    }));
    out.push(chunk(callParts, 'STOP'));
    return out.join('');
  }
}

export type LiveRequest = {
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  turns: any[];
};

/** A local stand-in for the Gemini Live WebSocket API (one session per agent step). */
export class MockGeminiLive {
  readonly requests: LiveRequest[] = [];
  private script: ((request: LiveRequest) => MockStep)[] = [];
  private server = createServer(this.serveModels);
  private sockets = new WebSocketServer({ server: this.server });

  get baseUrl(): string {
    return `ws://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  /** Replace the script; each session consumes the next entry. */
  play(...script: (MockStep | ((request: LiveRequest) => MockStep))[]): void {
    this.script = script.map((entry) => (typeof entry === 'function' ? entry : () => entry));
    this.requests.length = 0;
  }

  async start(): Promise<void> {
    this.sockets.on('connection', (socket, req) => {
      let setup: unknown;
      // Like the real service, send JSON as binary frames.
      const send = (message: object) => socket.send(Buffer.from(JSON.stringify(message)));
      socket.on('message', (raw) => {
        const message = JSON.parse(String(raw));
        if (message.setup) {
          setup = message.setup;
          return send({ setupComplete: {} });
        }
        const request: LiveRequest = {
          url: req.url ?? '',
          setup,
          turns: message.clientContent.turns,
        };
        this.requests.push(request);
        const entry = this.script[this.requests.length - 1];
        if (!entry) return socket.close(1011, 'Mock script exhausted.');
        this.reply(entry(request), send);
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets.clients) socket.terminate();
    this.sockets.close();
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }

  private reply({ text, calls = [] }: MockStep, send: (message: object) => void): void {
    const usageMetadata = { promptTokenCount: 100, responseTokenCount: 30 };
    if (text) {
      const middle = Math.ceil(text.length / 2);
      send({ serverContent: { outputTranscription: { text: text.slice(0, middle) } } });
      send({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] } } });
      send({ serverContent: { outputTranscription: { text: text.slice(middle) } } });
    }
    if (calls.length > 0) {
      send({
        toolCall: {
          functionCalls: calls.map((call) => ({
            ...(call.id && { id: call.id }),
            name: call.name,
            args: call.input,
          })),
        },
        usageMetadata,
      });
    } else {
      send({ usageMetadata });
      send({ serverContent: { turnComplete: true } });
    }
  }

  private serveModels(req: IncomingMessage, res: ServerResponse): void {
    const models = [
      {
        name: 'models/mock-live',
        displayName: 'Mock Live',
        supportedGenerationMethods: ['bidiGenerateContent'],
      },
      { name: 'models/mock-flash', supportedGenerationMethods: ['generateContent'] },
    ];
    res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url?.includes('/models') ? { models } : {}));
  }
}
