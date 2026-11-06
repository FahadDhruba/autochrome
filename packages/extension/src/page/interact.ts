import type { FileData, Point } from './messages';
import { highlight } from './overlay';
import { elementForRef } from './refs';

/** Scroll the element to the middle of the viewport and return its center in viewport CSS px. */
export function locate(ref: string, focus = false): Point {
  const el = elementForRef(ref);
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  if (focus && el instanceof HTMLElement) el.focus();
  highlight(el);
  const rect = el.getBoundingClientRect();
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max - 1);
  return {
    x: Math.round(clamp(rect.left + rect.width / 2, innerWidth)),
    y: Math.round(clamp(rect.top + rect.height / 2, innerHeight)),
  };
}

function fireInputAndChange(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Go through the prototype setter so React-style controlled inputs see the change.
  const proto =
    el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
}

export function setValue(ref: string, value: string | boolean): string {
  const el = elementForRef(ref);
  highlight(el);

  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    if (typeof value !== 'boolean') throw new Error(`${ref} is a ${el.type}; pass true or false.`);
    if (el.type === 'radio' && !value)
      throw new Error(`A radio button cannot be unchecked (${ref}).`);
    // click() toggles the box and fires input + change like a real user would.
    if (el.checked !== value) el.click();
    return `Set ${ref} to ${el.checked}`;
  }

  const text = String(value);
  if (el instanceof HTMLSelectElement) {
    const option = Array.from(el.options).find((o) => o.value === text || o.text.trim() === text);
    if (!option) {
      const choices = Array.from(el.options, (o) => JSON.stringify(o.text.trim())).join(', ');
      throw new Error(`No option "${text}" in ${ref}. Options: ${choices}`);
    }
    el.value = option.value;
    fireInputAndChange(el);
    return `Selected ${JSON.stringify(option.text.trim())} in ${ref}`;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, text);
    fireInputAndChange(el);
    return `Set ${ref} to ${JSON.stringify(text)}`;
  }
  throw new Error(`${ref} is not a form field.`);
}

/** Case-insensitive: the model cannot know how a page capitalises the text it waits for. */
export function hasText(text: string): boolean {
  return document.body.innerText.toLowerCase().includes(text.toLowerCase());
}

/**
 * The file input an element stands for: itself, one inside it, its label's control, or the only
 * one in its immediate container (a styled button next to a hidden input).
 */
function fileInputFor(el: Element): HTMLInputElement | undefined {
  const isFile = (node: Element | null | undefined): node is HTMLInputElement =>
    node instanceof HTMLInputElement && node.type === 'file';
  if (isFile(el)) return el;
  const inside = el.querySelector('input[type="file"]');
  if (isFile(inside)) return inside;
  const control = el.closest('label')?.control;
  if (isFile(control)) return control;
  const parent = el.parentElement;
  if (parent && parent !== document.body && parent !== document.documentElement) {
    const siblings = parent.querySelectorAll('input[type="file"]');
    if (siblings.length === 1 && isFile(siblings[0])) return siblings[0];
  }
  return undefined;
}

function toFile({ name, type, base64 }: FileData): File {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type });
}

/** Put files into the file input behind the element, or drop them on it when it is a drop zone. */
export function setFiles(target: { ref?: string; point?: Point }, files: FileData[]): string {
  const el = target.ref
    ? elementForRef(target.ref)
    : document.elementFromPoint(target.point?.x ?? -1, target.point?.y ?? -1);
  if (!el) throw new Error('There is no element at that point.');
  const ref = target.ref ?? `(${target.point!.x}, ${target.point!.y})`;
  highlight(el);
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(toFile(file));
  const names = files.map((f) => f.name).join(', ');
  const input = fileInputFor(el);
  if (input) {
    if (!input.multiple && files.length > 1) throw new Error('This input takes one file.');
    input.files = transfer.files;
    fireInputAndChange(input);
    return `Attached ${names} to ${ref}.`;
  }
  for (const type of ['dragenter', 'dragover', 'drop']) {
    el.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
  }
  return `Dropped ${names} on ${ref}.`;
}

let clickWatch: { el: Element; seen: boolean; stop: () => void } | undefined;

/** Start noticing whether a real click reaches the element behind `ref`. */
export function watchClick(ref: string): true {
  clickWatch?.stop();
  const el = elementForRef(ref);
  const watch = { el, seen: false, stop: () => removeEventListener('click', onClick, true) };
  const onClick = (event: Event) => {
    if (event.composedPath().includes(el)) watch.seen = true;
  };
  addEventListener('click', onClick, true);
  clickWatch = watch;
  return true;
}

/**
 * After a debugger click: true if it reached the element. If it did not (the browser can fail to
 * route a click into a cross-origin frame), the element is activated from inside the page.
 */
export function confirmClick(): { reached: boolean } {
  const watch = clickWatch;
  clickWatch = undefined;
  if (!watch) return { reached: false };
  watch.stop();
  if (watch.seen) return { reached: true };
  const el = watch.el as HTMLElement;
  el.focus?.();
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    const Event = type.startsWith('pointer') ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, composed: true }));
  }
  el.click?.();
  return { reached: false };
}
