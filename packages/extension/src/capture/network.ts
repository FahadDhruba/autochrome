export type NetworkEntry = {
  requestId: string;
  method: string;
  url: string;
  /** Resource type such as Fetch, Document or Script. */
  type: string;
  status?: number;
  /** Error text when the request failed before a response completed. */
  error?: string;
  /** Encoded size in bytes, once finished. */
  size?: number;
  startedAt: number;
  durationMs?: number;
  responseHeaders?: Record<string, string>;
};

export type StatusFilter = 'failed' | '4xx' | '5xx' | number;

export type NetworkFilter = {
  urlPattern?: string;
  method?: string;
  status?: StatusFilter;
  limit: number;
};

/** Accepts what a model tends to send: "failed", "4xx", "404" or 404. */
export function parseStatusFilter(value: unknown): StatusFilter | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase();
  if (text === 'failed' || text === '4xx' || text === '5xx') return text;
  return /^\d{3}$/.test(text) ? Number(text) : undefined;
}

export function matchesStatus(entry: NetworkEntry, filter: StatusFilter): boolean {
  if (filter === 'failed') return entry.error !== undefined;
  if (entry.status === undefined) return false;
  if (filter === '4xx') return entry.status >= 400 && entry.status < 500;
  if (filter === '5xx') return entry.status >= 500 && entry.status < 600;
  return entry.status === filter;
}

/** The newest `limit` requests that match, oldest first. */
export function filterNetwork(entries: NetworkEntry[], filter: NetworkFilter): NetworkEntry[] {
  const pattern = filter.urlPattern?.toLowerCase();
  const method = filter.method?.toUpperCase();
  return entries
    .filter((entry) => pattern === undefined || entry.url.toLowerCase().includes(pattern))
    .filter((entry) => method === undefined || entry.method.toUpperCase() === method)
    .filter((entry) => filter.status === undefined || matchesStatus(entry, filter.status))
    .slice(-filter.limit);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} kB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatNetworkEntry(entry: NetworkEntry): string {
  const state = entry.error ? `failed: ${entry.error}` : String(entry.status ?? 'pending');
  const details = [
    entry.type,
    entry.size !== undefined ? formatSize(entry.size) : undefined,
    entry.durationMs !== undefined ? `${Math.round(entry.durationMs)} ms` : undefined,
  ].filter(Boolean);
  return `[${entry.requestId}] ${entry.method} ${state} ${entry.url} (${details.join(', ')})`;
}
