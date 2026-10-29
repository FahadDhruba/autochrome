import type { TargetHint } from '@autochrome/shared';
import { collapse, nameOf, roleOf, textOf } from './dom';

const MAX_TEXT_CHARS = 100;
const STABLE_ATTRIBUTES = ['data-testid', 'data-test', 'name', 'aria-label', 'placeholder'];

function matchesOnce(root: ParentNode, selector: string): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function pathSelector(el: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== document.documentElement;) {
    if (node.id && matchesOnce(document, `#${CSS.escape(node.id)}`)) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const tag = node.localName;
    const sameTag = Array.from(node.parentElement?.children ?? []).filter(
      (c) => c.localName === tag,
    );
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/** A CSS selector that matches only this element: an id or stable attribute, else its path. */
export function selectorFor(el: Element): string | undefined {
  // Selectors do not reach into shadow roots.
  if (!(el.getRootNode() instanceof Document)) return undefined;
  if (el.id && matchesOnce(document, `#${CSS.escape(el.id)}`)) return `#${CSS.escape(el.id)}`;
  for (const attribute of STABLE_ATTRIBUTES) {
    const value = el.getAttribute(attribute);
    if (!value) continue;
    const selector = `${el.localName}[${attribute}=${JSON.stringify(value)}]`;
    if (matchesOnce(document, selector)) return selector;
  }
  return pathSelector(el);
}

/** How to find this element again: role + name like `read_page`, visible text and a selector. */
export function hintFor(el: Element): TargetHint {
  const role = roleOf(el) ?? '';
  const name = nameOf(el, role);
  const text = textOf(el);
  return {
    role,
    name,
    ...(text && text !== name && { text: collapse(text).slice(0, MAX_TEXT_CHARS) }),
    selector: selectorFor(el),
    url: location.href,
  };
}
