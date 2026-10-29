import { PROTOCOL_VERSION } from '@autochrome/shared';
import pkg from '../package.json' with { type: 'json' };

export function versionLine(): string {
  return `autochrome-bridge v${pkg.version} (protocol ${PROTOCOL_VERSION})`;
}
