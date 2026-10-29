import { describe, expect, it } from 'vitest';
import { checkUrl, siteOf } from './origin';

describe('siteOf', () => {
  it('returns scheme, host and port', () => {
    expect(siteOf('https://example.com/a/b?c=d#e')).toBe('https://example.com');
    expect(siteOf('http://127.0.0.1:8080/x')).toBe('http://127.0.0.1:8080');
    expect(siteOf('https://example.com:443/')).toBe('https://example.com');
  });

  it('keeps subdomains and schemes apart', () => {
    expect(siteOf('https://a.example.com')).not.toBe(siteOf('https://example.com'));
    expect(siteOf('http://example.com')).not.toBe(siteOf('https://example.com'));
  });

  it('treats all file pages as one site', () => {
    expect(siteOf('file:///home/me/a.html')).toBe('file://');
    expect(siteOf('file:///tmp/b.html')).toBe('file://');
  });

  it('has no site for other schemes or garbage', () => {
    expect(siteOf('chrome://settings')).toBeUndefined();
    expect(siteOf('about:blank')).toBeUndefined();
    expect(siteOf('example.com')).toBeUndefined();
    expect(siteOf('')).toBeUndefined();
  });
});

describe('checkUrl', () => {
  it('accepts web and file pages', () => {
    expect(checkUrl('https://example.com/x')).toEqual({ site: 'https://example.com' });
    expect(checkUrl('file:///a.html')).toEqual({ site: 'file://' });
  });

  it.each([
    'chrome://settings',
    'chrome-extension://abc/debug.html',
    'about:blank',
    'javascript:alert(1)',
    'data:text/html,hi',
    'view-source:https://example.com',
  ])('refuses %s', (url) => {
    expect(checkUrl(url)).toEqual({ reason: expect.stringContaining('cannot control') });
  });

  it('refuses the Chrome Web Store', () => {
    expect(checkUrl('https://chromewebstore.google.com/detail/x')).toEqual({
      reason: 'autochrome cannot control the Chrome Web Store.',
    });
    expect(checkUrl('https://chrome.google.com/webstore/detail/x')).toMatchObject({
      reason: expect.stringContaining('Web Store'),
    });
    expect(checkUrl('https://chrome.google.com/other')).toEqual({
      site: 'https://chrome.google.com',
    });
  });

  it('reports invalid URLs', () => {
    expect(checkUrl('example.com')).toEqual({ reason: '"example.com" is not a valid URL.' });
  });
});
