import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './index';

describe('shared', () => {
  it('exposes the protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
