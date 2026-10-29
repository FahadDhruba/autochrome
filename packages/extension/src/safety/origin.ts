const CHROME_WEB_STORE_HOST = 'chromewebstore.google.com';

/** `scheme://host:port` for web pages; every `file://` page counts as the one site `file://`. */
export function siteOf(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol === 'file:') return 'file://';
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.origin;
  return undefined;
}

function isChromeWebStore(url: URL): boolean {
  return (
    url.hostname === CHROME_WEB_STORE_HOST ||
    (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
  );
}

export type UrlCheck = { site: string } | { reason: string };

/** The site of a URL the AI may work on, or why it never may (Chrome blocks scripting there). */
export function checkUrl(url: string): UrlCheck {
  const site = siteOf(url);
  if (site === undefined) {
    try {
      const { protocol } = new URL(url);
      return { reason: `autochrome cannot control ${protocol}// pages.` };
    } catch {
      return { reason: `"${url}" is not a valid URL.` };
    }
  }
  if (isChromeWebStore(new URL(url))) {
    return { reason: 'autochrome cannot control the Chrome Web Store.' };
  }
  return { site };
}
