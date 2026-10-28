import { describe, expect, it } from 'vitest';
import { parseMode, parseSites } from './settings';

describe('safety settings parsing', () => {
  it('defaults to per-site mode', () => {
    expect(parseMode(undefined)).toBe('per-site');
    expect(parseMode('yolo')).toBe('per-site');
    expect(parseMode(3)).toBe('per-site');
  });

  it('keeps valid modes', () => {
    expect(parseMode('ask')).toBe('ask');
    expect(parseMode('per-site')).toBe('per-site');
    expect(parseMode('auto')).toBe('auto');
  });

  it('keeps only string sites', () => {
    expect(parseSites(undefined)).toEqual([]);
    expect(parseSites('https://a.com')).toEqual([]);
    expect(parseSites(['https://a.com', 3, null, 'file://'])).toEqual(['https://a.com', 'file://']);
  });
});
