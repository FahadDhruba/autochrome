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

  it('picks a newer model as soon as the provider lists it', () => {
    expect(
      recommendedModel(
        'gemini',
        list('gemini-3.5-flash-lite', 'gemini-10.0-flash-lite', 'gemini-11.0-flash-lite-preview'),
      ),
    ).toBe('gemini-10.0-flash-lite');
    expect(recommendedModel('openai', list('gpt-4.1-mini', 'gpt-6-mini'))).toBe('gpt-6-mini');
    expect(recommendedModel('anthropic', list('claude-sonnet-5-5', 'claude-sonnet-6'))).toBe(
      'claude-sonnet-6',
    );
  });

  it('falls back to the given default, then the first model', () => {
    expect(recommendedModel('compatible', list('llama3', 'qwen'))).toBe('llama3');
    expect(recommendedModel('anthropic', list('x'), 'claude-default')).toBe('claude-default');
    expect(recommendedModel('openai', [])).toBe('');
  });
});
