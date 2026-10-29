import { describe, expect, it } from 'vitest';
import { filterNetwork, formatNetworkEntry, parseStatusFilter, type NetworkEntry } from './network';

const request = (patch: Partial<NetworkEntry>): NetworkEntry => ({
  requestId: '1',
  method: 'GET',
  url: 'http://x/a',
  type: 'Fetch',
  startedAt: 0,
  ...patch,
});

describe('parseStatusFilter', () => {
  it('accepts keywords, numbers and numeric strings', () => {
    expect(parseStatusFilter('failed')).toBe('failed');
    expect(parseStatusFilter('4XX')).toBe('4xx');
    expect(parseStatusFilter('5xx')).toBe('5xx');
    expect(parseStatusFilter(404)).toBe(404);
    expect(parseStatusFilter('404')).toBe(404);
  });

  it('rejects anything else', () => {
    expect(parseStatusFilter('nope')).toBeUndefined();
    expect(parseStatusFilter('4')).toBeUndefined();
    expect(parseStatusFilter(undefined)).toBeUndefined();
  });
});

describe('formatNetworkEntry', () => {
  it('shows id, method, status, url, type, size and time', () => {
    expect(
      formatNetworkEntry(request({ status: 200, size: 2048, durationMs: 12.4, requestId: '9.1' })),
    ).toBe('[9.1] GET 200 http://x/a (Fetch, 2.0 kB, 12 ms)');
  });

  it('shows the error of a failed request and pending ones', () => {
    expect(formatNetworkEntry(request({ error: 'net::ERR_NAME_NOT_RESOLVED' }))).toBe(
      '[1] GET failed: net::ERR_NAME_NOT_RESOLVED http://x/a (Fetch)',
    );
    expect(formatNetworkEntry(request({}))).toBe('[1] GET pending http://x/a (Fetch)');
  });
});

describe('filterNetwork', () => {
  const entries = [
    request({ requestId: '1', status: 200 }),
    request({ requestId: '2', status: 404, url: 'http://x/missing' }),
    request({ requestId: '3', status: 503, method: 'POST' }),
    request({ requestId: '4', error: 'net::ERR_FAILED' }),
  ];
  const ids = (status: Parameters<typeof filterNetwork>[1]['status']) =>
    filterNetwork(entries, { status, limit: 50 }).map((e) => e.requestId);

  it('filters by status', () => {
    expect(ids('failed')).toEqual(['4']);
    expect(ids('4xx')).toEqual(['2']);
    expect(ids('5xx')).toEqual(['3']);
    expect(ids(200)).toEqual(['1']);
    expect(ids(undefined)).toEqual(['1', '2', '3', '4']);
  });

  it('filters by url pattern and method, and keeps the newest', () => {
    expect(filterNetwork(entries, { urlPattern: 'MISSING', limit: 50 })).toHaveLength(1);
    expect(filterNetwork(entries, { method: 'post', limit: 50 }).map((e) => e.requestId)).toEqual([
      '3',
    ]);
    expect(filterNetwork(entries, { limit: 2 }).map((e) => e.requestId)).toEqual(['3', '4']);
  });
});
