export function isExtensionOrigin(origin: string | undefined): boolean {
  return origin !== undefined && origin.startsWith('chrome-extension://');
}

/**
 * Browsers attach an Origin to requests made by web pages (including "null"); Node scripts and
 * MCP clients do not. Anything that is not an extension origin counts as a web page.
 */
export function isWebOrigin(origin: string | undefined): boolean {
  return origin !== undefined && !isExtensionOrigin(origin);
}
