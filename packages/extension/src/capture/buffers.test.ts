import { describe, expect, it, vi } from 'vitest';
import { TabCapture } from './buffers';

describe('TabCapture', () => {
  it('records console calls, exceptions and browser log entries', () => {
    const capture = new TabCapture();
    capture.handleEvent('Runtime.consoleAPICalled', {
      type: 'warning',
      timestamp: 1,
      args: [{ type: 'string', value: 'careful' }],
      stackTrace: { callFrames: [{ url: 'http://x/a.js', lineNumber: 4 }] },
    });
    capture.handleEvent('Runtime.exceptionThrown', {
      timestamp: 2,
      exceptionDetails: {
        text: 'Uncaught',
        url: 'http://x/a.js',
        lineNumber: 9,
        exception: { description: 'Error: kaput\n    at f' },
      },
    });
    capture.handleEvent('Log.entryAdded', {
      entry: { source: 'network', level: 'error', text: 'Failed to load resource', timestamp: 3 },
    });
    capture.handleEvent('Log.entryAdded', {
      entry: { source: 'console-api', level: 'info', text: 'duplicate', timestamp: 4 },
    });

    expect(capture.console.toArray()).toEqual([
      { time: 1, level: 'warning', message: 'careful', source: 'http://x/a.js:5' },
      {
        time: 2,
        level: 'error',
        message: 'Error: kaput\n    at f',
        source: 'http://x/a.js:10',
      },
      { time: 3, level: 'error', message: 'Failed to load resource', source: undefined },
    ]);
  });

  it('replaces object placeholders with their inspected text', async () => {
    const capture = new TabCapture(async (id) => (id === 'o1' ? '{"a":1}' : undefined));
    capture.handleEvent('Runtime.consoleAPICalled', {
      type: 'log',
      timestamp: 1,
      args: [
        { type: 'string', value: 'state' },
        { type: 'object', description: 'Object', objectId: 'o1' },
        { type: 'object', description: 'Array(2)', objectId: 'o2' },
      ],
    });
    expect(capture.console.toArray()[0]?.message).toBe('state Object Array(2)');
    await vi.waitFor(() =>
      expect(capture.console.toArray()[0]?.message).toBe('state {"a":1} Array(2)'),
    );
  });

  it('follows a request from start to finish', () => {
    const capture = new TabCapture();
    capture.handleEvent('Network.requestWillBeSent', {
      requestId: 'r1',
      timestamp: 10,
      type: 'Fetch',
      request: { url: 'http://x/api', method: 'POST' },
    });
    capture.handleEvent('Network.responseReceived', {
      requestId: 'r1',
      response: { status: 201, headers: { 'content-type': 'application/json' } },
    });
    capture.handleEvent('Network.loadingFinished', {
      requestId: 'r1',
      timestamp: 10.05,
      encodedDataLength: 321,
    });
    const entry = capture.networkEntry('r1')!;
    expect(entry).toMatchObject({ method: 'POST', status: 201, size: 321, type: 'Fetch' });
    expect(entry.durationMs).toBeCloseTo(50);
    expect(entry.responseHeaders).toEqual({ 'content-type': 'application/json' });
  });

  it('records failures and keeps one line per redirect chain', () => {
    const capture = new TabCapture();
    const start = (url: string) =>
      capture.handleEvent('Network.requestWillBeSent', {
        requestId: 'r',
        timestamp: 1,
        request: { url, method: 'GET' },
      });
    start('http://x/old');
    capture.handleEvent('Network.responseReceived', { requestId: 'r', response: { status: 302 } });
    start('http://x/new');
    expect(capture.networkEntries()).toHaveLength(1);
    expect(capture.networkEntry('r')).toMatchObject({ url: 'http://x/new', status: undefined });

    capture.handleEvent('Network.loadingFailed', {
      requestId: 'r',
      timestamp: 2,
      errorText: 'net::ERR_FAILED',
    });
    expect(capture.networkEntry('r')?.error).toBe('net::ERR_FAILED');
  });

  it('keeps the newest 500 requests and forgets evicted ids', () => {
    const capture = new TabCapture();
    for (let i = 0; i < 502; i++) {
      capture.handleEvent('Network.requestWillBeSent', {
        requestId: `r${i}`,
        timestamp: i,
        request: { url: 'http://x', method: 'GET' },
      });
    }
    expect(capture.networkEntries()).toHaveLength(500);
    expect(capture.networkEntry('r0')).toBeUndefined();
    expect(capture.networkEntry('r501')).toBeDefined();
  });

  it('clears network entries', () => {
    const capture = new TabCapture();
    capture.handleEvent('Network.requestWillBeSent', {
      requestId: 'r',
      timestamp: 1,
      request: { url: 'http://x', method: 'GET' },
    });
    capture.clearNetwork();
    expect(capture.networkEntries()).toEqual([]);
    expect(capture.networkEntry('r')).toBeUndefined();
  });
});
