import { describe, expect, it } from 'vitest';
import { DEFAULT_PROMPTS, matchPrompts, promptName } from './prompts';

describe('saved prompts', () => {
  it('matches by name prefix only while typing a slash command', () => {
    expect(matchPrompts('/', DEFAULT_PROMPTS)).toHaveLength(DEFAULT_PROMPTS.length);
    expect(matchPrompts('/su', DEFAULT_PROMPTS)?.map((p) => p.name)).toEqual(['summarize']);
    expect(matchPrompts('/sum more', DEFAULT_PROMPTS)).toBeUndefined();
    expect(matchPrompts('hello', DEFAULT_PROMPTS)).toBeUndefined();
  });

  it('turns any name into a slash-friendly one', () => {
    expect(promptName(' /Weekly Report! ')).toBe('weekly-report');
  });
});
