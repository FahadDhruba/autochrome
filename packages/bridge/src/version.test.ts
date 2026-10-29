import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@autochrome/shared';
import pkg from '../package.json' with { type: 'json' };
import { versionLine } from './version';

describe('versionLine', () => {
  it('includes the package and protocol versions', () => {
    expect(versionLine()).toBe(`autochrome-bridge v${pkg.version} (protocol ${PROTOCOL_VERSION})`);
  });
});
