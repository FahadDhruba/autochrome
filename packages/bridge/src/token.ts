import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export function defaultConfigDir(): string {
  return path.join(homedir(), '.autochrome');
}

/** `AUTOCHROME_TOKEN` wins; otherwise the token in `<configDir>/token`, created on first use. */
export async function loadToken(
  env: NodeJS.ProcessEnv = process.env,
  configDir: string = defaultConfigDir(),
): Promise<string> {
  const fromEnv = env.AUTOCHROME_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const file = path.join(configDir, 'token');
  try {
    const existing = (await readFile(file, 'utf8')).trim();
    if (existing) return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const token = randomBytes(32).toString('hex');
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await chmod(configDir, 0o700);
  await writeFile(file, `${token}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return token;
}

/** Constant-time comparison; hashing first makes the buffers equal length. */
export function tokensMatch(expected: string, given: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(expected), digest(given));
}
