import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadToken, tokensMatch } from './token';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'autochrome-token-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('loadToken', () => {
  it('creates a 64-char hex token with private permissions and reuses it', async () => {
    const configDir = path.join(dir, '.autochrome');
    const first = await loadToken({}, configDir);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await loadToken({}, configDir)).toBe(first);
    expect((await stat(configDir)).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(configDir, 'token'))).mode & 0o777).toBe(0o600);
  });

  it('prefers AUTOCHROME_TOKEN and does not write a file', async () => {
    const configDir = path.join(dir, 'unused');
    expect(await loadToken({ AUTOCHROME_TOKEN: 'abc' }, configDir)).toBe('abc');
    await expect(stat(configDir)).rejects.toThrow();
  });

  it('reads an existing token file', async () => {
    await writeFile(path.join(dir, 'token'), 'existing\n');
    expect(await loadToken({}, dir)).toBe('existing');
  });
});

describe('tokensMatch', () => {
  it('compares tokens of any length', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abd')).toBe(false);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
  });
});
