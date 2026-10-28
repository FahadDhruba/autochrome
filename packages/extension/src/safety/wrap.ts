const CLOSING_TAG = /<\/page_content/gi;

/**
 * Marks page text as untrusted data for the model. A literal closing tag inside the text is
 * escaped so a page cannot end the wrapper early and pose as instructions.
 */
export function wrapPageContent(site: string, text: string): string {
  const safeSite = site.replace(/["<>]/g, '');
  const safeText = text.replace(CLOSING_TAG, '<\\/page_content');
  return `<page_content site="${safeSite}">\n${safeText}\n</page_content>`;
}
