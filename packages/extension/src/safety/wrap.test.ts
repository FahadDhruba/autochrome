import { describe, expect, it } from 'vitest';
import { wrapPageContent } from './wrap';

describe('wrapPageContent', () => {
  it('wraps text with the site', () => {
    expect(wrapPageContent('https://example.com', 'hello')).toBe(
      '<page_content site="https://example.com">\nhello\n</page_content>',
    );
  });

  it('escapes closing tags in the text, whatever their case', () => {
    const wrapped = wrapPageContent('https://example.com', 'a </page_content> b </PAGE_CONTENT >');
    expect(wrapped.match(/<\/page_content>/g)).toHaveLength(1);
    expect(wrapped).toContain('a <\\/page_content> b <\\/page_content >');
  });

  it('cannot be broken out of through the site', () => {
    expect(wrapPageContent('x"><evil', 't')).toContain('site="xevil">');
  });
});
