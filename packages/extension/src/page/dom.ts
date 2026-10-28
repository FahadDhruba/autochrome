import type { PageNode } from './format';

export type RawNode = Omit<PageNode, 'ref'> & { el: Element; actionable: boolean };

const SKIPPED_TAGS = new Set(['script', 'style', 'noscript', 'template']);
const MAX_NAME_CHARS = 100;

const TAG_ROLES: Record<string, string> = {
  button: 'button',
  textarea: 'textbox',
  select: 'combobox',
  option: 'option',
  img: 'img',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  table: 'table',
  tr: 'row',
  td: 'cell',
  th: 'columnheader',
  nav: 'navigation',
  main: 'main',
  form: 'form',
  dialog: 'dialog',
  header: 'banner',
  footer: 'contentinfo',
  aside: 'complementary',
  article: 'article',
  p: 'paragraph',
  summary: 'button',
};

const INPUT_ROLES: Record<string, string> = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  file: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  search: 'searchbox',
};

const ACTIONABLE_ROLES = new Set([
  'link',
  'button',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'menuitem',
  'clickable',
]);

/** Roles whose accessible name may come from their text content. */
const NAME_FROM_CONTENT = new Set([
  'link',
  'button',
  'heading',
  'option',
  'cell',
  'columnheader',
  'paragraph',
  'clickable',
  'tab',
  'menuitem',
]);

const NO_VALUE_INPUTS = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'image',
  'file',
]);

function isContentEditable(el: Element): boolean {
  const attr = el.getAttribute('contenteditable');
  return attr !== null && attr !== 'false';
}

function hasClickHandlerOrTabStop(el: Element): boolean {
  const tabindex = el.getAttribute('tabindex');
  return el.hasAttribute('onclick') || (tabindex !== null && Number(tabindex) >= 0);
}

function implicitRole(el: Element): string | undefined {
  const tag = el.localName;
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : undefined;
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    return type === 'hidden' ? undefined : (INPUT_ROLES[type] ?? 'textbox');
  }
  if (tag === 'select') {
    const select = el as HTMLSelectElement;
    return select.multiple || select.size > 1 ? 'listbox' : 'combobox';
  }
  if (tag === 'img') return el.getAttribute('alt') === '' ? undefined : 'img';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  return TAG_ROLES[tag];
}

export function roleOf(el: Element): string | undefined {
  const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
  if (explicit && explicit !== 'presentation' && explicit !== 'none') return explicit;
  if (el.localName === 'input' && (el as HTMLInputElement).type === 'hidden') return undefined;
  const implicit = implicitRole(el);
  if (implicit) return implicit;
  if (isContentEditable(el)) return 'textbox';
  return hasClickHandlerOrTabStop(el) ? 'clickable' : undefined;
}

function isActionable(el: Element, role: string): boolean {
  return (
    ACTIONABLE_ROLES.has(role) ||
    el.localName === 'summary' ||
    isContentEditable(el) ||
    hasClickHandlerOrTabStop(el)
  );
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const truncate = (s: string) =>
  s.length > MAX_NAME_CHARS ? `${s.slice(0, MAX_NAME_CHARS - 1)}…` : s;

function textOf(el: Element): string {
  return collapse((el as HTMLElement).innerText ?? el.textContent ?? '');
}

/** A <label>'s text without the controls nested in it (a <select> would add all its options). */
function labelText(label: Element): string {
  const clone = label.cloneNode(true) as Element;
  clone.querySelectorAll('select, textarea, input, button').forEach((control) => control.remove());
  return collapse(clone.textContent ?? '');
}

/** Accessible name, in precedence order: aria-labelledby, aria-label, <label>, alt, title, … */
function nameOf(el: Element, role: string): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const root = el.getRootNode() as Document | ShadowRoot;
    const text = labelledBy
      .split(/\s+/)
      .map((id) => root.getElementById(id))
      .map((ref) => (ref ? textOf(ref) : ''))
      .join(' ');
    if (collapse(text)) return truncate(collapse(text));
  }
  const ariaLabel = collapse(el.getAttribute('aria-label') ?? '');
  if (ariaLabel) return truncate(ariaLabel);

  const labels = (el as HTMLInputElement).labels;
  if (labels?.length) {
    const text = collapse(Array.from(labels, labelText).join(' '));
    if (text) return truncate(text);
  }
  for (const attr of ['alt', 'title']) {
    const text = collapse(el.getAttribute(attr) ?? '');
    if (text) return truncate(text);
  }
  if (el.localName === 'input' && NO_VALUE_INPUTS.has((el as HTMLInputElement).type)) {
    // Button-like inputs are named by their value; an <input type=checkbox> is not.
    const text = collapse((el as HTMLInputElement).value);
    if (text && role === 'button') return truncate(text);
  }
  const placeholder = collapse(el.getAttribute('placeholder') ?? '');
  if (placeholder) return truncate(placeholder);
  return NAME_FROM_CONTENT.has(role) ? truncate(textOf(el)) : '';
}

function valueOf(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) {
    // Never echo passwords back to the model.
    if (el.type === 'password' || NO_VALUE_INPUTS.has(el.type)) return undefined;
    return truncate(el.value) || undefined;
  }
  if (el instanceof HTMLTextAreaElement) return truncate(el.value) || undefined;
  if (el instanceof HTMLSelectElement) {
    return (
      truncate(Array.from(el.selectedOptions, (o) => collapse(o.text)).join(', ')) || undefined
    );
  }
  return undefined;
}

function isChecked(el: Element): boolean {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return el.checked;
  }
  return el.getAttribute('aria-checked') === 'true';
}

function levelOf(el: Element): number | undefined {
  const aria = Number(el.getAttribute('aria-level'));
  if (aria) return aria;
  const match = /^h([1-6])$/.exec(el.localName);
  return match ? Number(match[1]) : undefined;
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && el.checkVisibility({ checkVisibilityCSS: true });
}

function isSubtreeHidden(el: Element): boolean {
  return (
    SKIPPED_TAGS.has(el.localName) ||
    el.hasAttribute('hidden') ||
    el.getAttribute('aria-hidden') === 'true' ||
    getComputedStyle(el).display === 'none'
  );
}

function childrenOf(el: Element): Element[] {
  if (el instanceof HTMLSlotElement) {
    const assigned = el.assignedElements({ flatten: true });
    return assigned.length ? assigned : Array.from(el.children);
  }
  return Array.from((el.shadowRoot ?? el).children);
}

export type Collected = { nodes: RawNode[]; iframes: number };

/** Walk the document (including open shadow roots) and describe every element that has a role. */
export function collectNodes(): Collected {
  const nodes: RawNode[] = [];
  let iframes = 0;

  const walk = (el: Element, depth: number) => {
    if (isSubtreeHidden(el)) return;
    if (el.localName === 'iframe' || el.localName === 'frame') iframes++;

    const role = roleOf(el);
    const listed = role !== undefined && isVisible(el);
    if (listed) {
      nodes.push({
        el,
        depth,
        role,
        name: nameOf(el, role),
        value: valueOf(el),
        checked: isChecked(el),
        level: levelOf(el),
        actionable: isActionable(el, role),
      });
    }
    for (const child of childrenOf(el)) walk(child, listed ? depth + 1 : depth);
  };

  walk(document.documentElement, 0);
  return { nodes, iframes };
}
