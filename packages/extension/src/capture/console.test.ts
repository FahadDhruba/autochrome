import { describe, expect, it } from 'vitest';
import {
  filterConsole,
  formatConsoleArgs,
  formatConsoleEntry,
  levelOfApiType,
  levelOfLogEntry,
  type ConsoleEntry,
} from './console';

const entry = (level: ConsoleEntry['level'], message: string, time = 0): ConsoleEntry => ({
  time,
  level,
  message,
});

describe('console formatting', () => {
  it('formats a line with time, level, message and source', () => {
    const line = formatConsoleEntry({
      time: Date.UTC(2026, 9, 28, 12, 30, 5, 120),
      level: 'error',
      message: 'boom',
      source: 'http://x/app.js:12',
    });
    expect(line).toBe('[12:30:05.120] error boom (http://x/app.js:12)');
  });

  it('joins arguments by value, preview or description', () => {
    expect(
      formatConsoleArgs([
        { type: 'string', value: 'count:' },
        { type: 'number', value: 3 },
        { type: 'number', unserializableValue: 'NaN' },
        {
          type: 'object',
          description: 'Object',
          preview: { properties: [{ name: 'a', value: '1' }], overflow: true },
        },
        { type: 'object', subtype: 'error', description: 'Error: bad\n    at f' },
      ]),
    ).toBe('count: 3 NaN Object {a: 1, …} Error: bad\n    at f');
  });

  it('maps CDP types and levels', () => {
    expect(levelOfApiType('warning')).toBe('warning');
    expect(levelOfApiType('assert')).toBe('error');
    expect(levelOfApiType('table')).toBe('log');
    expect(levelOfLogEntry('verbose')).toBe('debug');
    expect(levelOfLogEntry('error')).toBe('error');
  });
});

describe('filterConsole', () => {
  const entries = [
    entry('log', 'hello'),
    entry('error', 'Boom happened'),
    entry('warning', 'careful'),
    entry('error', 'second boom'),
  ];

  it('filters by level and pattern, case-insensitively', () => {
    expect(filterConsole(entries, { level: 'error', limit: 50 }).map((e) => e.message)).toEqual([
      'Boom happened',
      'second boom',
    ]);
    expect(filterConsole(entries, { pattern: 'BOOM', limit: 50 })).toHaveLength(2);
  });

  it('keeps the newest entries when limited, oldest first', () => {
    expect(filterConsole(entries, { limit: 2 }).map((e) => e.message)).toEqual([
      'careful',
      'second boom',
    ]);
  });
});
