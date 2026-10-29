import type { TargetHint } from '@autochrome/shared';
import { describe, expect, it } from 'vitest';
import { bestMatch, type Candidate } from './match';

const candidate = (patch: Partial<Candidate>): Candidate => ({
  role: 'button',
  name: '',
  text: '',
  actionable: true,
  selectorMatch: false,
  ...patch,
});
const hint = (patch: Partial<TargetHint> = {}): TargetHint => ({
  role: 'button',
  name: 'Sign in',
  ...patch,
});

describe('bestMatch', () => {
  it('prefers role and name exactly', () => {
    const candidates = [
      candidate({ name: 'sign in' }),
      candidate({ name: 'Sign in' }),
      candidate({ role: 'link', name: 'Sign in' }),
    ];
    expect(bestMatch(hint(), candidates)).toEqual({ index: 1, kind: 'name' });
  });

  it('falls back to a case-insensitive name with the same role', () => {
    const candidates = [
      candidate({ role: 'link', name: 'Sign in' }),
      candidate({ name: 'SIGN IN' }),
    ];
    expect(bestMatch(hint(), candidates)).toEqual({ index: 1, kind: 'name-loose' });
  });

  it('matches a name that contains the recorded one, or the other way round', () => {
    expect(bestMatch(hint(), [candidate({ name: 'Sign in to continue' })])).toEqual({
      index: 0,
      kind: 'name-loose',
    });
    expect(
      bestMatch(hint({ name: 'Sign in to continue' }), [candidate({ name: 'Sign in' })]),
    ).toEqual({ index: 0, kind: 'name-loose' });
  });

  it('does not match very short partial names', () => {
    expect(bestMatch(hint({ name: 'OK' }), [candidate({ name: 'Book now' })])).toBeUndefined();
  });

  it('falls back to the visible text when the role or name changed', () => {
    const candidates = [candidate({ role: 'link', name: 'Log in', text: 'Sign in' })];
    expect(bestMatch(hint({ text: 'Sign in' }), candidates)).toEqual({ index: 0, kind: 'text' });
  });

  it('uses the name as the text when the hint has none', () => {
    const candidates = [candidate({ role: 'clickable', name: '', text: 'Sign in' })];
    expect(bestMatch(hint(), candidates)).toEqual({ index: 0, kind: 'text' });
  });

  it('does not match a container whose text merely contains the text', () => {
    const candidates = [candidate({ role: 'form', name: '', text: 'Email Sign in Cancel' })];
    expect(bestMatch(hint({ text: 'Sign in' }), candidates)).toBeUndefined();
  });

  it('does not take a heading with the same text for the button', () => {
    const candidates = [
      candidate({ role: 'heading', name: 'Sign in', text: 'Sign in', actionable: false }),
    ];
    expect(bestMatch(hint({ text: 'Sign in' }), candidates)).toBeUndefined();
  });

  it('never matches an empty name', () => {
    expect(bestMatch(hint({ name: '' }), [candidate({ name: '' })])).toBeUndefined();
  });

  it('breaks ties with the selector, then page order', () => {
    const same = [
      candidate({ name: 'Delete' }),
      candidate({ name: 'Delete', selectorMatch: true }),
      candidate({ name: 'Delete' }),
    ];
    expect(bestMatch(hint({ name: 'Delete' }), same)).toEqual({ index: 1, kind: 'name' });
    expect(bestMatch(hint({ name: 'Delete' }), [same[0]!, same[2]!])).toEqual({
      index: 0,
      kind: 'name',
    });
  });

  it('lets a better rule win over a selector match on a worse one', () => {
    const candidates = [
      candidate({ name: 'Sign in now', selectorMatch: true }),
      candidate({ name: 'Sign in' }),
    ];
    expect(bestMatch(hint(), candidates)).toEqual({ index: 1, kind: 'name' });
  });

  it('finds nothing in an empty page', () => {
    expect(bestMatch(hint(), [])).toBeUndefined();
  });
});
