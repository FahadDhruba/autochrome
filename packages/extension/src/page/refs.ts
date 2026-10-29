let refToElement = new Map<string, WeakRef<Element>>();
let elementToRef = new WeakMap<Element, string>();
let counter = 0;

/** Forget all refs. Called by every read_page, so refs only live until the next one. */
export function resetRefs(): void {
  refToElement = new Map();
  elementToRef = new WeakMap();
  counter = 0;
}

/** Stable within one read_page generation, so `find` never invalidates earlier refs. */
export function refFor(el: Element): string {
  let ref = elementToRef.get(el);
  if (!ref) {
    ref = `e${++counter}`;
    elementToRef.set(el, ref);
    refToElement.set(ref, new WeakRef(el));
  }
  return ref;
}

export function elementForRef(ref: string): Element {
  const el = refToElement.get(ref)?.deref();
  if (!el || !el.isConnected) throw new Error(`Unknown ref ${ref}. Call read_page again.`);
  return el;
}
