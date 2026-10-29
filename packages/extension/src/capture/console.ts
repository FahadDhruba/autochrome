export type ConsoleLevel = 'error' | 'warning' | 'info' | 'log' | 'debug';

export type ConsoleEntry = {
  time: number;
  level: ConsoleLevel;
  message: string;
  /** `url:line`, when known. */
  source?: string;
};

export type ConsoleFilter = { level?: ConsoleLevel; pattern?: string; limit: number };

/** CDP `Runtime.consoleAPICalled` types that are not already one of our levels. */
const API_LEVELS: Record<string, ConsoleLevel> = {
  error: 'error',
  assert: 'error',
  warning: 'warning',
  info: 'info',
  debug: 'debug',
};

export const levelOfApiType = (type: string): ConsoleLevel => API_LEVELS[type] ?? 'log';

/** CDP `Log.entryAdded` levels. */
export function levelOfLogEntry(level: string): ConsoleLevel {
  if (level === 'verbose') return 'debug';
  return level === 'error' || level === 'warning' || level === 'info' ? level : 'log';
}

type RemoteObject = {
  type?: string;
  subtype?: string;
  value?: unknown;
  description?: string;
  unserializableValue?: string;
  preview?: { properties?: { name: string; value?: string }[]; overflow?: boolean };
};

function formatRemoteObject(arg: RemoteObject): string {
  if (typeof arg.value === 'string') return arg.value;
  if (arg.value !== undefined) return JSON.stringify(arg.value);
  if (arg.unserializableValue) return arg.unserializableValue;
  const properties = arg.preview?.properties;
  if (properties && arg.subtype !== 'error') {
    const body = properties.map((p) => `${p.name}: ${p.value}`).join(', ');
    return `${arg.description ?? 'Object'} {${body}${arg.preview?.overflow ? ', …' : ''}}`;
  }
  return arg.description ?? arg.type ?? '';
}

export const formatConsoleArgs = (args: RemoteObject[]): string =>
  args.map(formatRemoteObject).join(' ');

export function sourceOf(url: string | undefined, lineNumber: number | undefined) {
  if (!url) return undefined;
  return lineNumber === undefined ? url : `${url}:${lineNumber + 1}`;
}

const clock = (time: number) => new Date(time).toISOString().slice(11, 23);

export function formatConsoleEntry(entry: ConsoleEntry): string {
  const where = entry.source ? ` (${entry.source})` : '';
  return `[${clock(entry.time)}] ${entry.level} ${entry.message}${where}`;
}

/** The newest `limit` entries that match, oldest first. */
export function filterConsole(entries: ConsoleEntry[], filter: ConsoleFilter): ConsoleEntry[] {
  const pattern = filter.pattern?.toLowerCase();
  return entries
    .filter((entry) => filter.level === undefined || entry.level === filter.level)
    .filter((entry) => pattern === undefined || entry.message.toLowerCase().includes(pattern))
    .slice(-filter.limit);
}
