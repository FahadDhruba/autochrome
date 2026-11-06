/**
 * Which iframe in this document hosts which child frame. The background gives each child frame a
 * random token; the child posts it to its parent window, and the parent matches the message's
 * source to one of its iframes. Tokens are unguessable, so a page cannot claim another frame.
 */
const KEY = '__autochromeFrame';
const byToken = new Map<string, WeakRef<Element>>();
const byElement = new WeakMap<Element, string>();

export function startFrameRegistry(): void {
  addEventListener('message', (event) => {
    const token = (event.data as Record<string, unknown> | null)?.[KEY];
    if (typeof token !== 'string' || !event.source) return;
    for (const el of document.querySelectorAll('iframe, frame')) {
      if ((el as HTMLIFrameElement).contentWindow === event.source) {
        byToken.set(token, new WeakRef(el));
        byElement.set(el, token);
      }
    }
  });
}

/** Called in a child frame: tell the parent window which token this frame has. */
export function announceFrame(token: string): true {
  if (window.parent !== window) window.parent.postMessage({ [KEY]: token }, '*');
  return true;
}

/** Tokens of the child frames this document hosts. */
export function frameChildren(): string[] {
  return [...byToken].filter(([, ref]) => ref.deref()?.isConnected).map(([token]) => token);
}

export const frameTokenOf = (el: Element): string | undefined => byElement.get(el);

/** Where the child frame's viewport starts in this frame's viewport, in CSS px. */
export function frameRect(token: string, scroll: boolean): { x: number; y: number } {
  const el = byToken.get(token)?.deref();
  if (!el?.isConnected) throw new Error('The frame is gone. Call read_page again.');
  if (scroll) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return {
    x: rect.left + el.clientLeft + parseFloat(style.paddingLeft),
    y: rect.top + el.clientTop + parseFloat(style.paddingTop),
  };
}
