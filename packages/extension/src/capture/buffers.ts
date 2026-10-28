import {
  levelOfApiType,
  levelOfLogEntry,
  formatConsoleArgs,
  sourceOf,
  type ConsoleEntry,
} from './console';
import type { NetworkEntry } from './network';
import { CAPTURE_CAPACITY, RingBuffer } from './ring';

// CDP event payloads arrive untyped; each field is read defensively below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CdpParams = Record<string, any>;

/** Turns a remote object into text; used for objects the console event only has a handle for. */
export type InspectObject = (objectId: string) => Promise<string | undefined>;

/** Everything captured from one tab since autochrome attached to it. */
export class TabCapture {
  readonly startedAt = Date.now();
  readonly console = new RingBuffer<ConsoleEntry>(CAPTURE_CAPACITY);
  private readonly network = new RingBuffer<NetworkEntry>(CAPTURE_CAPACITY);
  private readonly networkById = new Map<string, NetworkEntry>();

  constructor(private readonly inspect?: InspectObject) {}

  networkEntries(): NetworkEntry[] {
    return this.network.toArray();
  }

  networkEntry(requestId: string): NetworkEntry | undefined {
    return this.networkById.get(requestId);
  }

  clearNetwork(): void {
    this.network.clear();
    this.networkById.clear();
  }

  /** Feed one CDP event; events that are not captured are ignored. */
  handleEvent(method: string, params: CdpParams = {}): void {
    switch (method) {
      case 'Runtime.consoleAPICalled': {
        const frame = params.stackTrace?.callFrames?.[0];
        const args = params.args ?? [];
        const entry: ConsoleEntry = {
          time: params.timestamp ?? Date.now(),
          level: levelOfApiType(params.type),
          message: formatConsoleArgs(args),
          source: sourceOf(frame?.url, frame?.lineNumber),
        };
        this.console.push(entry);
        void this.expandObjects(entry, args);
        break;
      }
      case 'Runtime.exceptionThrown': {
        const details = params.exceptionDetails ?? {};
        this.console.push({
          time: params.timestamp ?? Date.now(),
          level: 'error',
          message: details.exception?.description ?? details.text ?? 'Uncaught exception',
          source: sourceOf(details.url, details.lineNumber),
        });
        break;
      }
      case 'Log.entryAdded': {
        const entry = params.entry ?? {};
        // console.* calls arrive through Runtime already.
        if (entry.source === 'console-api') break;
        this.console.push({
          time: entry.timestamp ?? Date.now(),
          level: levelOfLogEntry(entry.level),
          message: entry.text ?? '',
          source: sourceOf(entry.url, entry.lineNumber),
        });
        break;
      }
      case 'Network.requestWillBeSent':
        return this.requestStarted(params);
      case 'Network.responseReceived': {
        const entry = this.networkById.get(params.requestId);
        if (!entry) break;
        entry.status = params.response?.status;
        entry.responseHeaders = params.response?.headers;
        break;
      }
      case 'Network.loadingFinished': {
        const entry = this.networkById.get(params.requestId);
        if (!entry) break;
        entry.size = params.encodedDataLength;
        entry.durationMs = (params.timestamp - entry.startedAt) * 1000;
        break;
      }
      case 'Network.loadingFailed': {
        const entry = this.networkById.get(params.requestId);
        if (!entry) break;
        entry.error = params.canceled ? 'canceled' : (params.errorText ?? 'failed');
        entry.durationMs = (params.timestamp - entry.startedAt) * 1000;
        break;
      }
    }
  }

  /** Replaces "Object" placeholders in the message with the objects' JSON, once it arrives. */
  private async expandObjects(entry: ConsoleEntry, args: CdpParams[]): Promise<void> {
    if (!this.inspect || !args.some(needsInspection)) return;
    const texts = await Promise.all(
      args.map(async (arg) =>
        needsInspection(arg)
          ? ((await this.inspect!(arg.objectId).catch(() => undefined)) ?? formatConsoleArgs([arg]))
          : formatConsoleArgs([arg]),
      ),
    );
    entry.message = texts.join(' ');
  }

  private requestStarted(params: CdpParams): void {
    const { requestId } = params;
    const fields = {
      method: params.request?.method ?? 'GET',
      url: params.request?.url ?? '',
      type: params.type ?? 'Other',
      startedAt: params.timestamp,
    };
    const existing = this.networkById.get(requestId);
    if (existing) {
      // A redirect reuses the request id: keep one line for the final hop.
      Object.assign(existing, fields, {
        status: undefined,
        error: undefined,
        size: undefined,
        durationMs: undefined,
        responseHeaders: undefined,
      });
      return;
    }
    const entry: NetworkEntry = { requestId, ...fields };
    this.networkById.set(requestId, entry);
    const dropped = this.network.push(entry);
    if (dropped) this.networkById.delete(dropped.requestId);
  }
}

/** Plain objects and arrays arrive as a handle, with no value to print. */
const needsInspection = (arg: CdpParams) =>
  arg.type === 'object' &&
  arg.objectId !== undefined &&
  arg.subtype !== 'error' &&
  arg.subtype !== 'null' &&
  arg.value === undefined;

const captures = new Map<number, TabCapture>();

/** Start capturing for a tab; keeps the existing buffers if capture already runs. */
export function startCapture(tabId: number, inspect?: InspectObject): TabCapture {
  let capture = captures.get(tabId);
  if (!capture) captures.set(tabId, (capture = new TabCapture(inspect)));
  return capture;
}

export const captureOf = (tabId: number): TabCapture | undefined => captures.get(tabId);

export function stopCapture(tabId: number): void {
  captures.delete(tabId);
}
