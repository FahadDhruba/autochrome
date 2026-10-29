import { filterConsole, formatConsoleEntry } from '../capture/console';
import { truncate } from '../capture/limits';
import { filterNetwork, formatNetworkEntry } from '../capture/network';
import { captureFor, cdp } from '../debugger';
import { resolveTabId } from '../target';
import { text, type ToolHandlers } from './types';

const EVAL_TIMEOUT_MS = 10_000;

/** Capture only sees events after the debugger attached, and the model should know that. */
const captureNote = (startedAt: number) =>
  `(Captured since ${new Date(startedAt).toISOString().slice(11, 19)} UTC, when autochrome attached to this tab. Earlier events are missing; navigate to the same URL to capture from page start.)`;

type RemoteResult = {
  result: { type: string; value?: unknown; description?: string };
  exceptionDetails?: { text: string; exception?: { description?: string; value?: unknown } };
};

function formatEvalResult({ result, exceptionDetails }: RemoteResult): string {
  if (exceptionDetails) {
    const thrown = exceptionDetails.exception;
    throw new Error(
      `JavaScript threw: ${thrown?.description ?? (thrown?.value !== undefined ? String(thrown.value) : exceptionDetails.text)}`,
    );
  }
  if (result.type === 'undefined') return 'undefined';
  return truncate(JSON.stringify(result.value) ?? result.description ?? String(result.value));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Decoded size of a base64 string. */
const base64Bytes = (data: string) =>
  Math.floor((data.length * 3) / 4) - (data.match(/=+$/)?.[0].length ?? 0);

export const debugHandlers: Pick<
  ToolHandlers,
  'console_logs' | 'network_requests' | 'network_response' | 'js_eval'
> = {
  async console_logs({ tabId, level, pattern, limit, clear }) {
    const capture = await captureFor(await resolveTabId(tabId));
    const lines = filterConsole(capture.console.toArray(), { level, pattern, limit }).map(
      formatConsoleEntry,
    );
    if (clear) capture.console.clear();
    return text(
      [lines.join('\n') || 'No console messages.', captureNote(capture.startedAt)].join('\n'),
    );
  },

  async network_requests({ tabId, urlPattern, method, status, limit, clear }) {
    const capture = await captureFor(await resolveTabId(tabId));
    const lines = filterNetwork(capture.networkEntries(), {
      urlPattern,
      method,
      status,
      limit,
    }).map(formatNetworkEntry);
    if (clear) capture.clearNetwork();
    return text(
      [lines.join('\n') || 'No matching requests.', captureNote(capture.startedAt)].join('\n'),
    );
  },

  async network_response({ requestId, tabId }) {
    const id = await resolveTabId(tabId);
    const entry = (await captureFor(id)).networkEntry(requestId);
    if (!entry) {
      throw new Error(
        `No request with id "${requestId}" in this tab. List requests with network_requests.`,
      );
    }
    const headers = Object.entries(entry.responseHeaders ?? {})
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n');
    const head = `${entry.method} ${entry.url}\nStatus: ${entry.status ?? entry.error ?? 'pending'}\n\nResponse headers:\n${headers || '(none)'}`;

    let body: string;
    try {
      const response = await cdp<{ body: string; base64Encoded: boolean }>(
        id,
        'Network.getResponseBody',
        { requestId },
      );
      body = response.base64Encoded
        ? `binary, ${base64Bytes(response.body)} bytes`
        : truncate(response.body);
    } catch {
      throw new Error(
        `The body of request ${requestId} is not available: it may still be loading, have failed, or been discarded by Chrome.`,
      );
    }
    return text(`${head}\n\nBody:\n${body}`);
  },

  async js_eval({ code, tabId }) {
    const id = await resolveTabId(tabId);
    const response = await withTimeout(
      cdp<RemoteResult>(id, 'Runtime.evaluate', {
        expression: code,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
        timeout: EVAL_TIMEOUT_MS,
      }),
      EVAL_TIMEOUT_MS + 1000,
      `JavaScript did not finish within ${EVAL_TIMEOUT_MS / 1000}s.`,
    );
    return text(formatEvalResult(response));
  },
};
