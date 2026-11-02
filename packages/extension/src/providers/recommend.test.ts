import { describe, expect, it } from 'vitest';
import { recommendedModel } from './recommend';

const list = (...ids: string[]) => ids.map((id) => ({ id, label: id }));

describe('recommendedModel', () => {
  it('prefers a fast Gemini model, newest first', () => {
    expect(recommendedModel('gemini', list('gemini-2.5-pro', 'gemini-3.5-flash-lite'))).toBe(
      'gemini-3.5-flash-lite',
    );
    expect(recommendedModel('gemini', list('gemini-2.5-flash', 'gemini-3.1-flash'))).toBe(
      'gemini-3.1-flash',
    );
  });

  it('falls back to the given default, then the first model', () => {
    expect(recommendedModel('compatible', list('llama3', 'qwen'))).toBe('llama3');
    expect(recommendedModel('anthropic', list('x'), 'claude-default')).toBe('claude-default');
    expect(recommendedModel('openai', [])).toBe('');
  });
});
