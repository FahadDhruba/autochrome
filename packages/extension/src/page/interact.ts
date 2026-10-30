import type { Point } from './messages';
import { elementForRef } from './refs';

/** Scroll the element to the middle of the viewport and return its center in viewport CSS px. */
export function locate(ref: string, focus = false): Point {
  const el = elementForRef(ref);
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  if (focus && el instanceof HTMLElement) el.focus();
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
